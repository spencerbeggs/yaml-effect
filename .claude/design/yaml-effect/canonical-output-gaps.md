# Canonical Output Gaps and Future Work

Status: exploration
Date: 2026-04-27

## Summary

Compliance against the official yaml-test-suite is at **98.6% raw**
(2358/2393 assertions). The remaining 17 canonical-output failures
cluster into three classes that share a common root cause: **the AST
discards the information libyaml's canonical emitter relies on**.

Parse-level compliance is at **100%** (every test that should parse,
parses; every test that should reject, rejects). Roundtrip compliance
is at **100%**. Only canonical-output (`out.yaml` byte-equality
against libyaml's canonical emission) has gaps.

This doc records why the remaining gaps are not piecemeal-fixable and
what structural work would be required to close them.

## The Failing 17

| ID | Class | What libyaml does | What we need |
| -- | ----- | ----------------- | ------------ |
| 2LFX | Stringifier | `---\n"foo"` (DQ on its own line after directives) | Track that source had directives + scalar after `---` |
| 4ABK | Stringifier | `omitted value: null` (explicit null for omitted flow value) | Distinguish "explicit `:`" vs "bare key" in flow source |
| 4WA9 | Stringifier | Prepends `---\n` for block-seq with block scalars | Discriminator for "needs `---`" unclear |
| 5T43 | Stringifier | Drops quotes from flow keys (single-line flow only) | Detect single-line flow source spans |
| 652Z | Stringifier | Prepends `---\n` for flow-converted-to-block map | Detect content-starts-with-indicator pattern |
| 6WLZ | Composer | Cross-document `%TAG` handle expansion in second doc | Multi-doc tag scoping fix |
| 9MQT/00 | Stringifier | Drops DQ to plain when folded value is plain-safe (single-doc only) | Distinguish single-doc vs multi-doc; preserve DQ in multi-doc |
| B3HG | Stringifier | Drops `---` for block-folded with single-line folded content | No clean rule (compare 96L6 which keeps `---`) |
| K54U | Stringifier | Adds `...` after `---<TAB>scalar` | No AST-visible discriminator (compare 27NA, 4V8U) |
| K858 | Stringifier | Empty `\|+` gets `\|2+` indent indicator (in block-map context only) | Distinguish block-map-value vs block-seq-item context (compare JEF9) |
| KK5P | Parser | Explicit `?` keys with collection values | Parser refactor — see below |
| M2N8/00 | Parser | Block-seq item containing explicit-`?` map | Parser refactor |
| M2N8/01 | Parser | Explicit-`?` flow key with following entries | Parser refactor |
| M5DY | Parser | `? - seq\n: - seq` pairs | Parser refactor |
| PUW8 | Stringifier | `...\n` after empty trailing doc when previous had content | Cross-document context |
| VJP3/01 | Stringifier | Prepends `---\n` for nested-flow→block conversion | Detect "source had multi-line flow" |
| XLQ9 | Stringifier | `...` after multi-line plain scalar root | No discriminator (compare 3MYT, 4V8U) |

Three categories emerge:

### Class A — Parser shape (4 failures): KK5P, M2N8/00, M2N8/01, M5DY

The parser produces a flat children list for block mappings and the
composer's `flattenBlockMapChildren` reconstructs pairs. This works
for implicit `key: value` form but breaks down for explicit-`?` keys
whose key OR value is itself a block collection (`? - a\n: b` style).
The composer can't reliably reassemble the tree from the flat sibling
list because `?`, the key node, `:`, and the value node lose their
explicit-pair grouping. Current output for KK5P shows the breakage:

```text
complex1: {}     ← the `?` introduced an empty-map sibling
? []             ← then a stray `?` with empty key
:                ← stray `:` with no value
a:               ← then the rest as a separate pair
```

### Class B — Multi-document context (1 failure): 6WLZ

The composer's `validateTagHandlesInDocument` rejects tags from other
documents' `%TAG` directives correctly. But for canonical output, the
stringifier needs to expand `!handle!suffix` to verbatim `!<full-tag>`
form when the consuming reader wouldn't have the directive in scope.
This requires both threading the handle map through stringification
AND deciding when to emit verbatim vs shorthand.

### Class C — Stringifier canonical quirks (12 failures)

These are the bulk. Each looks like it should have a clean rule, but
in practice every rule we tried fixed 1-2 fixtures and broke 5-15
others. The discriminators libyaml uses are not visible in our AST.

Specific examples:

- **5T43 vs 5MUD/8KB6/9BXH/C2DT** — all flow-source maps with quoted
  keys converting to block. 5T43 drops quotes; the others keep them.
  The discriminator is whether the *flow map source* spans multiple
  lines, which we don't track.
- **4ABK vs C2DT/DFF7** — all flow-source omitted values. 4ABK emits
  `null`; the others emit bare `:`. The discriminator is whether the
  source had `:,` (explicit empty value) or just `,` / `:}` (implicit
  empty), which we don't track.
- **B3HG vs 96L6** — both block-folded `>` at root with content folding
  to a single line. B3HG drops `---`; 96L6 keeps it. No AST-visible
  difference.
- **K54U vs 27NA/4V8U** — all single-line plain scalar at root with
  explicit `---`. K54U gets `...`; the others don't. The discriminator
  appears to be the tab character in K54U's source between `---` and
  the content, which we don't preserve.
- **K858 vs JEF9** — both empty keep-chomp scalars. K858 gets `|2+`
  indicator; JEF9 gets `|+`. The difference is the parent — block-map
  value vs block-seq item — which is detectable but produces only
  modest yield.
- **9MQT/00 vs KSS4 doc 1** — both multi-line DQ scalars at root that
  fold to plain-safe single-line content. 9MQT/00 drops to plain;
  KSS4 doc 1 keeps DQ. The discriminator is single-doc vs multi-doc
  stream, which we have but haven't wired through.

## Why Piecemeal Fixes Don't Generalize

Each candidate rule we tried in
`feat/final-issues` (April 2026):

| Rule attempted | Fixed | Broke |
| -------------- | ----- | ----- |
| Force `---\n` prefix for non-scalar root in canonical | 4WA9, 652Z, VJP3/01 | 229Q + ~140 others |
| Drop quotes from plain-safe flow keys in canonical | 5T43 | 5MUD, 8KB6, 9BXH, 26DV, 87E4, 9SA2, C2DT, ... |
| Render `null` for omitted values in flow-source maps | 4ABK | C2DT, DFF7, 8KB6, 9BXH |
| Drop `---` for block-folded/literal at root | B3HG | 4Q9F, 6JQW, 753E, 96L6, JEF9, 4V8U, ... |
| Empty keep-chomp gets `\|2+` indicator | K858 | JEF9/00, JEF9/01, JEF9/02 |
| `...` for plain scalar root with hasDocStart | K54U, XLQ9 | 27NA, 4V8U, 35KP, 3MYT, 5MUD, 6JQW, 753E, ... |
| `...` for empty doc with hasDocStart | PUW8 | 6XDY, MUS6/02, MUS6/03, MUS6/04, MUS6/05, MUS6/06 |

The rules that survived (EXG3, KSS4 doc 2 — anchored plain scalar
terminator) were the ones narrow enough to fire on a tiny pattern.
Anything broader matches structurally similar fixtures with different
expected outputs.

## Two Structural Paths to 100%

### Path 1 — Capture source-text shape on the AST

Most of the rules libyaml uses are about *how the source was written*,
not about the resolved value. We could enrich `YamlScalar`,
`YamlMap`, `YamlSeq` with optional fields that the composer fills in:

```typescript
class YamlScalar extends Schema.TaggedClass<YamlScalar>("YamlScalar")({
  value: Schema.Unknown,
  style: ScalarStyle,
  tag: Schema.optional(Schema.String),
  anchor: Schema.optional(Schema.String),
  comment: Schema.optional(Schema.String),
  chomp: Schema.optional(Schema.Literal("strip", "clip", "keep")),
  raw: Schema.optional(Schema.String),
  offset: NonNegativeInt,
  length: NonNegativeInt,

  // NEW (proposed):
  sourceLines: Schema.optional(Schema.Int.pipe(Schema.nonNegative())),
  hadExplicitNullMarker: Schema.optional(Schema.Boolean),
}) { }
```

For the YamlMap, similar fields that capture whether the source flow
collection spanned multiple lines, whether explicit `:` was present
for omitted values, etc.

This information lives on the AST after parsing and survives
modification/edit operations (with appropriate handling). The
stringifier's canonical mode can then consult these fields.

**Pros:**

- Each rule becomes data-driven instead of pattern-matched
- Round-trip fidelity for non-canonical use cases also improves
- Format/modify operations gain source-shape awareness "for free"

**Cons:**

- Larger AST surface area (more fields to keep in sync)
- Composer needs to track and emit this data for every node
- Cross-doc state (multi-doc-vs-single-doc) still needs a separate channel
- Some rules (libyaml's K54U tab handling, the B3HG vs 96L6 split) may
  still not be derivable from any reasonable source-shape capture

Estimated effort: 800–1500 LoC of composer + schema changes; possibly
fixes 7–10 of the 12 stringifier gaps.

### Path 2 — Rewrite canonical mode as a libyaml-faithful emitter

Treat `forceDefaultStyles: true` as a separate emitter that mirrors
libyaml's `yaml_emit_t` exactly, rather than as a flag layered onto
the existing stringifier. The libyaml emitter is well-understood and
its decisions are documented; porting it (or its decision tree) gives
us a reference behaviour to match.

**Pros:**

- 100% canonical output by construction (modulo bugs)
- Decouples canonical from non-canonical stringification — both can
  evolve independently
- Makes the canonical emitter testable in isolation

**Cons:**

- Substantial work — libyaml's emitter is ~2000 lines of C
- Two stringifier code paths to maintain
- Doesn't address the parser-shape failures (Class A) or multi-doc
  tag preservation (Class B); those still need separate fixes

Estimated effort: 2000–3000 LoC + extensive test coverage; fixes all
12 stringifier gaps.

### Recommendation

If the goal is just "fewer compliance gaps without major rework",
Path 1 with selective rules is cheapest. If the goal is "100%
canonical output as a stable property", Path 2 is the only honest
answer — Path 1 will keep accreting edge cases.

Either path leaves Class A (parser refactor) and Class B (multi-doc
tag scoping) as separate work items.

## Tier 4: Parser Refactor for Explicit-`?` Keys

This work is referenced in `parsing.md` ("Open Compliance Gaps") but
the full scope hasn't been written down.

### Current parser shape

`parseBlockMapping` walks a flat token sequence and emits CST `block-map`
children as a flat array of nodes. The composer's
`flattenBlockMapChildren` then reconstructs key/value pairs by
walking children in order with state machine flags
(`afterValueSep`, `pendingMeta`, etc.).

This works for implicit form:

```yaml
key: value      # flat children: [scalar("key"), :, scalar("value")]
key2: value2    # the composer pairs them up correctly
```

It fails for explicit-`?` form when key OR value is a block collection:

```yaml
? - a       # children: [?, block-seq(- a), :, scalar("b")]
: b
```

Specifically:

- The `?` is consumed as a "whitespace" CST node with `source === "?"`.
- The block-seq child for `- a` arrives as a sibling, not as a child
  of an explicit-key wrapper.
- The flattener has no reliable way to scope which children form the
  `?` key and which form the `:` value.

Current behaviour (KK5P actual output):

```text
complex1: {}     ← `?` introduced empty-map sibling
? []             ← stray `?` then empty key
:                ← stray `:` with no value
a:               ← rest as separate pair
```

### The fix

`parseBlockMapping` needs to recognise the explicit-`?` form during
parsing and emit a structured pair node, not a flat sibling list.
Specifically:

1. When `parseBlockMapping` sees a `?` indicator at the appropriate
   indent column, treat it as the start of an explicit-pair scope.
2. Within that scope, parse a key node (which may itself be a
   `block-seq`, `block-map`, `flow-seq`, `flow-map`, or `block-scalar`).
3. Look for `:` at the parent column to terminate the key scope.
4. Parse the value node (same allowed shapes as the key).
5. Emit a CST pair node containing the key and value as children,
   wrapping the `?` and `:` indicators.

This replaces the current flattener-based reconstruction with
parser-level scoping.

### Touched files

- `src/utils/parser.ts` — add `parseExplicitPair`, modify
  `parseBlockMapping` to recognise the `?` form. Estimated +200 LoC.
- `src/schemas/CstNode.ts` — possibly add a new CST node type
  `block-explicit-pair` or extend `block-map` semantics. Decide
  whether to keep the flat-children invariant.
- `src/utils/composer.ts` — `flattenBlockMapChildren` needs to know
  about the new pair structure. Could simplify significantly if the
  parser does the scoping. Estimated −100 LoC (simplification) +50
  (new branch).
- `src/utils/cst-visitor.ts` — visitor needs to walk the new pair
  scope. Estimated +30 LoC.
- `src/utils/format.ts` — edit/modify operations may need updates if
  the CST shape changes.
- `__test__/composer.test.ts` — extensive new fixture coverage for
  every explicit-`?` shape (key alone, value alone, both, with
  collection-of-collection nesting).

Estimated total: 800–1200 LoC, plus test coverage.

### Risks

- `block-map` CST nodes are used by `format`/`modify` for AST-level
  edits. Changing the CST shape risks breaking edit operations.
- The composer's column-based key validation (DMG6 / EW3V / N4JP /
  U44R checks) may need to be re-anchored.
- `lastNonTriviaIsValueSep`, `precededByExplicitKeyMarker`, and
  similar helpers in the composer assume flat children — they'd need
  to be rewritten or removed.

### Test fixtures targeted

- KK5P (Various combinations of explicit block mappings)
- M2N8/00, M2N8/01 (Question mark edge cases)
- M5DY (Spec Example 2.11 — Mapping between Sequences)

Possibly also fixes:

- Anything else using `? key\n: value` with collection key/value that
  currently relies on the flattener's heuristic reconstruction.

### Why we deferred

Each piecemeal fix attempted (one was tried and reverted on
`feat/parser`) showed the parser-shape mismatch is fundamental — the
composer can't reliably reconstruct from flat children when the
explicit-pair scope isn't preserved. A clean fix needs the parser
change.

## Tier 3: Multi-Doc TAG Preservation (6WLZ)

```yaml
# 6WLZ source
# Private
---
!foo "bar"
...
# Global
%TAG ! tag:example.com,2000:app/
---
!foo "bar"
```

```yaml
# 6WLZ expected canonical output
---
!foo "bar"
...
--- !<tag:example.com,2000:app/foo>
"bar"
```

The second document's `!foo` should expand to verbatim form
`!<tag:example.com,2000:app/foo>` because:

1. The reader (libyaml) re-emits the document boundary, but the
   directive is scoped to the second document only.
2. In canonical output, the receiving reader doesn't have the
   directive context; the emitter must convert handles to verbatim.

Currently the stringifier's `normalizeNodeTags` runs once per
document with the document's own `directives`, but the resulting
shorthand `!foo` is ambiguous in canonical output without the
`%TAG` line. The fix is to expand handles to verbatim form whenever
the canonical emitter is dropping the `%TAG` directive line (which
it does — directives are not re-emitted in canonical mode).

Touched: `src/utils/stringify.ts` (`normalizeNodeTags`) and
`stringifyDocument`. Estimated 50–100 LoC.

## Closed Wins (April 2026)

- **EXG3** — `applySingleDocCanonical` drops `---` for single-line
  single-quoted scalar root whose content begins with `---`.
- **KSS4** — `stringifyDocument` emits `...\n` terminator after an
  anchored plain scalar root with explicit `---`.

These passed the "doesn't break other tests" threshold by being
narrow enough — both check explicit AST shape (style + anchor + value
prefix) without trying to generalise.
