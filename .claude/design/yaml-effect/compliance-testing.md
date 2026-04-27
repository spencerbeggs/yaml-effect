---
title: Compliance Testing
description: Official yaml-test-suite integration for YAML 1.2 spec compliance validation.
status: current
module: yaml-effect
category: testing
created: 2026-03-14
updated: 2026-04-26
last-synced: 2026-04-26
completeness: 92
related:
  - architecture.md
  - parsing.md
  - errors.md
dependencies:
  - parsing.md
---

## Overview

The project integrates the official
[yaml-test-suite](https://github.com/yaml/yaml-test-suite) to validate
YAML 1.2 spec compliance. The suite contains ~440 test cases covering
valid parsing, invalid rejection, JSON output matching, canonical output,
and stringify round-tripping. It runs as a separate Vitest project named
`compliance`, isolated from unit tests.

This is the primary mechanism for measuring spec conformance and
identifying parser/stringifier gaps. Every known failure is tracked in a
skip map with a reason string, and each map entry corresponds to one of
six open GitHub issues (#6--#11) categorizing the work needed.

## Architecture

### Git Submodule

The test suite data lives in a git submodule:

```text
__test__/fixtures/yaml-test-suite/
```

Configured in `.gitmodules` pointing to
`https://github.com/yaml/yaml-test-suite.git`, pinned to the
`data-2022-01-17` tag. This tag provides a stable, flat-file data format
where each test case is a directory containing fixture files.

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/spencerbeggs/yaml-effect.git

# Or initialize after cloning:
git submodule update --init
```

### Vitest Project Isolation

Compliance tests run in a dedicated Vitest project defined in
`vitest.config.ts`:

```typescript
const compliance = VitestProject.custom("compliance", {
  name: "compliance",
  include: ["__test__/yaml-test-suite.test.ts"],
  overrides: { test: { testTimeout: 30_000 } },
});
```

The default `yaml-effect` project explicitly excludes both compliance
test files so they do not run during normal unit test discovery. The
`test` script explicitly targets `yaml-effect` and `compliance` projects:

```bash
pnpm run test                  # unit tests + filtered compliance
pnpm run test:compliance       # filtered compliance only
pnpm run test:compliance-raw   # unfiltered compliance (expected failures)
```

### Raw Compliance Project (`compliance-raw`)

A second Vitest project runs every test case without SKIP, XFAIL, or
SKIP_ASSERTIONS filtering. This shows the true state of compliance and
makes it easy to spot unexpected improvements after code changes.

- **File:** `__test__/yaml-test-suite-raw.test.ts`
- **Project name:** `compliance-raw`
- **Script:** `pnpm run test:compliance-raw`
- **Guard:** Requires `RAW_COMPLIANCE=1` env var (set by the script).
  Without this, the describe block self-skips, preventing pre-commit
  hooks and default test runs from failing on known gaps.

Filter by test ID:

```bash
pnpm run test:compliance-raw -- -t "\[229Q\]"
```

### Graceful Degradation

Both test files guard against a missing submodule:

```typescript
const suiteAvailable = existsSync(SUITE_DIR);
describe.skipIf(!suiteAvailable)("yaml-test-suite compliance", () => { ... });
```

If the submodule is not initialized, the entire `describe` block is
skipped with no error. This prevents CI failures for contributors who
clone without `--recurse-submodules`.

## Test Case Structure

### Fixture Layout

Each test case lives in a directory under `__test__/fixtures/yaml-test-suite/`.
Two directory patterns exist:

1. **Flat test** -- e.g., `229Q/` contains fixture files directly.
2. **Multi-case test** -- e.g., `3RLN/00/`, `3RLN/01/` has numbered
   subdirectories, each a separate test case. IDs become `3RLN/00`, etc.

### Fixture Files

Each test case directory may contain:

| File | Required | Purpose |
| ---- | -------- | ------- |
| `in.yaml` | Yes | Raw YAML input to parse |
| `===` | No | Human-readable test name |
| `in.json` | No | Expected JSON output after parsing |
| `out.yaml` | No | Expected canonical re-serialized YAML |
| `test.event` | No | Expected parse event stream (not currently used) |
| `error` | No | Presence means `in.yaml` should be rejected |

### Test Data Loader (`__test__/utils/yaml-test-suite.ts`)

`loadAllTestCases()` scans the suite directory, handles both flat and
numbered-subdirectory layouts, and returns a sorted `TestCase[]` array.
Each `TestCase` has:

- `id` -- 4-char ID (or `ID/NN` for multi-case)
- `name` -- from the `===` file
- `yaml` -- raw input
- `json` -- parsed expected JSON (if `in.json` exists)
- `outYaml` -- canonical output (if `out.yaml` exists)
- `isError` -- true if the `error` file is present
- `events` -- raw event stream (currently unused)
- `isMultiDocument` -- true if `in.json` contains multiple top-level
  JSON values (multi-document stream)

The `parseMultiJson()` helper handles `in.json` files that contain
multiple top-level JSON values (one per YAML document in multi-document
streams). It returns a `ParsedJson` object with `value` and
`isMultiDocument` fields.

### Multi-Document Support (Issue #6 -- Resolved)

The test runner detects multi-document fixtures via `isMultiDocument` and
uses `parseAllDocuments()` with `buildAnchorMap()` + `getNodeValue()` to
extract per-document plain values. The `parseYamlMulti()` helper wraps
this for the JSON comparison and roundtrip tests.

## Skip Map Strategy

All known failures are tracked in
`__test__/utils/yaml-test-suite-skip-map.ts` with three tiers:

### SKIP -- Never Run

```typescript
export const SKIP: Record<string, string> = {};
```

Tests that are not applicable to our implementation. Currently empty --
all test cases are relevant.

### XFAIL -- Expected Parse-Level Failures

```typescript
export const XFAIL: Record<string, string> = { ... };
```

Tests that run with `it.fails` -- the test is expected to fail. One
remaining category of XFAIL entries:

1. **Parser accepts invalid YAML** (29 tests) -- our parser succeeds on
   input the spec says should be rejected. Missing validation for various
   structural constraints (indentation, anchors, flow collection syntax).

Previously there were also "parser rejects valid YAML" entries, but
all 16 have been resolved through lexer, parser, and composer fixes
(block scalar indentation, quoted scalar flow context, multi-line
plain scalars, implicit block mapping indent tracking, explicit key
handling).

When an XFAIL test is marked with `it.fails`, Vitest expects the
assertion to fail. If a code fix causes the test to start passing,
`it.fails` will itself fail, signaling that the entry should be removed
from the XFAIL map.

### SKIP_ASSERTIONS -- Per-Assertion Skipping

```typescript
export const SKIP_ASSERTIONS: Record<string, string[]> = { ... };
```

Tests where parsing succeeds but specific assertion types fail. Values
are arrays containing one or more of:

- `"json"` -- skip JSON output comparison
- `"output"` -- skip `out.yaml` canonical output comparison
- `"roundtrip"` -- skip stringify round-trip comparison

This allows a test case to validate parsing while skipping downstream
assertions that depend on stringifier correctness or value resolution
accuracy.

## How to Interpret Results

The test runner performs up to four assertions per valid test case:

### 1. Parse Success/Failure

For valid YAML (`!tc.isError`): asserts `Either.isRight(parse(input))`.
For error YAML (`tc.isError`): asserts `Either.isLeft(parse(input))`.

This is the fundamental compliance check -- can we correctly accept valid
YAML and reject invalid YAML?

### 2. JSON Match

Compares `parse(input)` output against the expected `in.json` value using
a deep equality check that handles `NaN` equality. Only runs when
`in.json` exists and `"json"` is not in `SKIP_ASSERTIONS`.

Failures here mean we parse the YAML but produce the wrong value -- type
resolution errors, incorrect scalar coercion, wrong collection structure.

### 3. Canonical Output Match

Uses `parseDocument()` + `stringifyDocument({ forceDefaultStyles: true })`
to produce canonical output, then compares against `out.yaml`. The
`forceDefaultStyles` option overrides AST node collection styles with
block defaults while preserving multiline scalar sub-styles, producing
output closer to the canonical form expected by the test suite. For
multi-document inputs, each document is stringified independently and
joined. Only runs when `out.yaml` exists and `"output"` is not in
`SKIP_ASSERTIONS`.

### 4. Stringify Roundtrip

Parses, stringifies, re-parses, and deep-compares the two parsed values.
Validates that `parse(stringify(parse(input))) === parse(input)`. This
catches stringifier bugs that produce output our own parser cannot
re-consume identically.

## Working with Compliance Tests

### Examining Test Case Fixtures

When a test fails, inspect the fixture directory:

```bash
# See what files a test case has
ls __test__/fixtures/yaml-test-suite/229Q/

# Read the YAML input
cat __test__/fixtures/yaml-test-suite/229Q/in.yaml

# Read the expected JSON output
cat __test__/fixtures/yaml-test-suite/229Q/in.json

# Check if it's an error test
test -f __test__/fixtures/yaml-test-suite/229Q/error && echo "error test"
```

For multi-case tests:

```bash
ls __test__/fixtures/yaml-test-suite/3RLN/
# 00/  01/  02/  ...
cat __test__/fixtures/yaml-test-suite/3RLN/01/in.yaml
```

### Running a Single Test Case

The compliance suite runs as one big `describe` block, so you filter by
test name:

```bash
pnpm vitest run --project compliance -t "229Q"
pnpm vitest run --project compliance -t "3RLN/01"
```

### Removing Skip Map Entries After Fixes

When a parser or stringifier fix lands:

1. Run the compliance suite: `pnpm run test:compliance`
2. Look for `it.fails` tests that now pass -- Vitest reports these as
   failures with a message like "Expected test to fail but it passed"
3. Remove the corresponding entry from `XFAIL` in
   `__test__/utils/yaml-test-suite-skip-map.ts`
4. For assertion-level fixes, remove the specific assertion string from
   the array in `SKIP_ASSERTIONS`. If the array becomes empty, remove the
   entire entry.
5. Re-run to confirm all tests pass cleanly.

### Debugging Compliance Failures

**Targeting specific tests by ID:**

```bash
# Run a single test case (escape brackets for regex)
pnpm vitest run --project compliance -t "\[229Q\]"

# Multiple IDs (pipe-separated, still need bracket escaping)
pnpm vitest run --project compliance -t "\[DWX9\]|\[T26H\]"

# Multi-case IDs work too
pnpm vitest run --project compliance -t "\[L24T/00\]"
```

Note: Using unescaped `-t "229Q"` may match too broadly (any test
whose name contains that substring). Wrapping in `\[...\]` is safer.

**Checking for XFAIL tests that now pass after a fix:**

```bash
pnpm vitest run --project compliance --reporter=verbose 2>&1 \
  | grep "Expected.*to fail but"
```

If any appear, remove the entry from `XFAIL` in the skip map.

**Examining fixture bytes (for whitespace/encoding issues):**

```bash
xxd __test__/fixtures/yaml-test-suite/DWX9/in.yaml
xxd __test__/fixtures/yaml-test-suite/DWX9/in.json
```

**Adding targeted debug tests:**

When investigating a specific failure, add a focused unit test in the
relevant test file (`lexer.test.ts`, `composer.test.ts`) using the
exact input from the fixture. Compare lexer output vs composer output
to determine which layer has the bug. The composer has its own block
scalar decoder (`decodeBlockScalar`) separate from the lexer's
`scanBlockScalar`, so block scalar fixes must be applied in both.

## Badge Pipeline

### GitHub Action (`.github/workflows/compliance.yml`)

Runs on every push to `main`:

1. Checks out the repo with submodules
2. Runs both filtered (`compliance`) and raw (`compliance-raw`) test
   suites with `--reporter=json`
3. A Node.js script computes two percentages:
   - **Parse compliance** -- from filtered results: percentage of "should
     parse successfully" and "should reject invalid YAML" assertions
     passing
   - **Full compliance** -- from raw unfiltered results: percentage of
     all assertions passing across all 1226 test assertions (includes
     JSON, output, roundtrip, with no skip map filtering)
4. Writes `compliance.json` (data), `parse-badge.json`, and
   `full-badge.json` (shields.io endpoint format)
5. Pushes all three files to an orphan `badges` branch

### Badge Data Format

`compliance.json` contains the raw metrics:

```json
{
  "parse": { "passing": 373, "total": 402, "percentage": 93, "color": "brightgreen" },
  "full": { "passing": 1008, "total": 1226, "percentage": 82, "color": "yellow" },
  "lastUpdated": "2026-03-19T..."
}
```

`parse-badge.json` and `full-badge.json` use shields.io endpoint format:

```json
{ "schemaVersion": 1, "label": "YAML 1.2 parse", "message": "93%", "color": "brightgreen" }
```

Color thresholds: >90% brightgreen, >70% yellow, >50% orange, else red.

### shields.io Integration

README badges use shields.io endpoint badge URLs pointing at the
`*-badge.json` files on the `badges` branch. Endpoint badges support
dynamic colors from the JSON payload. The orphan branch keeps badge
data out of the main branch history.

## Open Compliance Gaps

GitHub issues categorize the known failures. Issue #10 was decomposed
into per-category issues (#15, #16).

| Issue | Title | Status |
| ----- | ----- | ------ |
| #6 | Fix multi-document test harness to use `parseAllDocuments` | **Resolved** |
| #7 | Fix tab handling in lexer for YAML 1.2 compliance | **Resolved** (all XFAIL cleared) |
| #8 | Fix block scalar content normalization | **Mostly resolved** (explicit indent fix) |
| #9 | Fix double-quoted and plain scalar folding rules | **Resolved** |
| #10 | Add stricter validation for invalid YAML rejection | Closed (decomposed into #15, #16) |
| #11 | Fix canonical output and roundtrip stringifier compliance | **Mostly resolved** (roundtrip 18->0, output 59->38) |
| #15 | Parser rejects valid YAML | **Resolved** (0 remaining XFAIL "rejects valid") |
| #16 | Parser accepts invalid YAML | Open (23 XFAIL "accepts invalid") |

Current compliance: 2374/2424 raw assertions passing (97.93%), 1188
filtered assertions passing, 23 XFAIL (all "accepts invalid"), 0 JSON
comparison failures, 0 roundtrip failures, ~28 SKIP_ASSERTIONS entries
(output only). Use `pnpm run test:compliance-raw` to see unfiltered
results.

Remaining canonical-output gaps cluster into a few categories:

- **Explicit `?` syntax for complex keys** (5WE3, 6SLA, M5DY, Q9WF, X38W) --
  emitting `? key\n: value` for non-scalar or multi-line keys in canonical
  block form.
- **Multi-document `...` end marker** (KSS4, PUW8) -- emitting the explicit
  document-end marker between or after documents when the source contained
  one.
- **Empty-value canonical `null` rendering** (4ABK) -- explicit `null`
  output for absent mapping values in canonical form.

### Key Compliance Improvements (feat/more-compliance)

The jump from 77% to 82.2% raw compliance came from several categories
of fixes:

- **All "rejects valid" XFAIL cleared**: Lexer block scalar explicit
  indent fix, parser implicit block mapping indent tracking,
  `afterQuotedScalar` flow context persistence, multi-line plain scalar
  continuation detection, explicit key block sequence handling
- **JSON comparison**: All JSON comparison failures resolved (0 remaining
  `"json"` entries in SKIP_ASSERTIONS)
- **Canonical output**: `stringifyDocument` with `forceDefaultStyles`
  produces output much closer to canonical form -- compact sequence
  notation, anchor/tag preservation, document-start markers
- **TAG directive resolution**: Full `%TAG` directive support with handle
  expansion throughout document composition
- **Block scalar indentation**: `findParentIndent()` in composer
  correctly computes explicit indent relative to parent context

### Key Compliance Improvements (feat/parser)

The jump from 82.2% to 93.3% raw compliance came from fixes across all
three pipeline layers:

- **Stringifier escape sequences**: YAML 1.2 named escapes (`\b`, `\0`,
  `\a`, `\v`, `\f`, `\e`), canonical unicode `\uXXXX` for non-ASCII
- **Tag normalization**: `normalizeTag()` resolves custom handles via
  `%TAG` directives to canonical shorthand (`!!str`) or verbatim form
- **Explicit key syntax**: Non-scalar keys (YamlSeq, YamlMap) render
  with `? key\n: value` syntax in block-style output
- **Block scalar edge cases**: Whitespace-only strings, empty block
  scalars, and leading empty lines handled with double-quoted fallback
  or explicit indent indicators
- **Multiline mapping keys**: Double-quoted with `\n` escapes
- **Quoting improvements**: Trailing whitespace, `"` and `'` indicators,
  `\t#` and `:\t` patterns, C0 control chars in multiline
- **Parser compact block-seq**: Handles `key:\n- val` at same indent
- **Parser nested seq-of-maps**: Checks for nested seq entry before
  implicit mapping detection in `parseSequenceEntryContent`
- **Parser implicit mapping indent**: `block-seq-start` at parent indent
  breaks out of `parseImplicitBlockMapping`
- **Composer flow collection keys**: `flow-seq` and `flow-map` at
  document level become implicit mapping keys when followed by block-map
- **Composer explicit `?` in flow**: `flattenFlowChildren` recognizes
  `?` as explicit key indicator; `buildPairs` consumes next node as key
- **Composer anchor-on-alias**: `checkAnchorOnAlias` validation produces
  `DuplicateAnchor` fatal error (resolves SR86, SU74)
- **All 18 roundtrip failures resolved** (0 remaining)
- **Multi-doc join**: Raw test harness concatenates parts directly

### Key Compliance Improvements (canonical stringifier)

The jump from 93.3% to 97.24% raw compliance (2327/2393 assertions, +16
canonical-output tests previously skipped) came from stringifier and test
harness improvements focused on canonical output for multi-line scalars:

- **Single-quoted multi-line scalar rendering**: New
  `renderSingleQuotedMultiline(s, indent)` helper in
  `src/utils/stringify.ts`. In canonical mode, multi-line plain or
  single-quoted source values are rendered as single-quoted with the
  inverse of YAML §7.4 line folding -- each literal newline in the value
  maps to N+1 source newlines, and continuation segments are indented to
  the value column. Falls back to block-literal when content has CR or
  non-tab control characters that single-quoted form cannot represent.
- **Inline placement of multi-line quoted scalars**: When a mapping value
  or sequence item is a multi-line quoted scalar, the first line is
  emitted directly after `:` or `-`, and subsequent lines are emitted
  as-is (already indented by the renderer). Detection uses
  `valNode instanceof YamlScalar` plus a quote-prefix check on the first
  line. Using a node-type check rather than an output-pattern match
  avoids false positives where nested mappings produce lines like
  `"key": value` that would otherwise be mistaken for quoted continuations.
- **Block-style to double-quoted conversion**: For canonical output, the
  stringifier now downgrades block-style scalars to double-quoted in two
  cases that block style cannot represent unambiguously:
  - Trailing whitespace before a non-trailing newline in multi-line
    content -- detected via `/[\t ]\n/` combined with a multi-line
    check (`s.replace(/\n+$/, "").includes("\n")`). Single-line content
    like `\t\n` is still fine for block style.
  - Mixed leading whitespace (space-then-tab) on continuation lines --
    detected via `/\n +\t/`.
- **Single-document scalar canonical**: `applySingleDocCanonical(output, root)`
  helper in `__test__/yaml-test-suite-raw.e2e.test.ts` and
  `__test__/yaml-test-suite.e2e.test.ts` strips the leading `---` from a
  single-doc scalar-rooted output when the value is multi-line and
  rendered as quoted (single- or double-quoted). Block scalars (`|`, `>`)
  and single-line scalars retain `---`.

Sixteen canonical-output tests removed from `SKIP_ASSERTIONS` in
`__test__/utils/yaml-test-suite-skip-map.ts`: 36F6, 4ZYM, 6FWR, 6WPF,
9TFX, 9YRD, DWX9, EX5H, H2RW, HS5T, MJS9, NB6Z, PRH3, Q8AD, T26H, T4YY.

### Key Compliance Improvements (composer anchor placement)

The jump from 97.24% to 97.47% raw compliance (2348/2409 assertions) came
from composer changes that fix anchor/tag placement when metadata spans a
newline between an outer container and its first inner key, and a
companion stringifier change that disambiguates anchor-only keys. Five
additional canonical-output tests now pass (26DV, 7BMT, U3XV, FH7J,
PW8X), bringing the total canonical-output tests removed from
`SKIP_ASSERTIONS` on this branch to 21 (16 from the canonical
stringifier subsection above + 5 new).

- **Outer/inner anchor split in `flattenBlockMapChildren`**
  (`src/utils/composer.ts`): The block-map flattener previously kept a
  single `pendingMeta` slot for anchor/tag tokens, so when both an outer
  container and its first inner key carried metadata
  (e.g. `&outer\nkey: ...` where `key` itself has `&inner`), the second
  anchor overwrote the first. New state -- `outerMeta`,
  `sawNewlineSincePending`, plus helpers `combinedPending()`,
  `commitOuterIfNewlineSeen()`, and `clearMeta()` -- splits this into
  two slots. When a newline is observed with `pendingMeta` set, the
  next anchor/tag/content commits the existing `pendingMeta` to
  `outerMeta` (it belonged to the outer container) and starts a fresh
  `pendingMeta` for the inner content. The "scalar followed by
  block-map" first-key path now routes `outerMeta` to the new map and
  `pendingMeta` to the first key. All other consumer sites (alias,
  block-map, block-seq, flow-map, flow-seq, scalar) call
  `combinedPending()` to merge outer+pending so callers without the
  split still pick up both layers.
- **Anchor-on-empty-scalar in `composeBlockSeq`** (`src/utils/composer.ts`):
  When `sawEntry` is true and a new `-` entry indicator arrives, the
  empty scalar pushed for the previous entry now picks up any pending
  anchor/tag. This fixes inputs like `- &a\n- b`, where `&a` previously
  attached to the second entry instead of anchoring an empty first
  entry (resolves PW8X).
- **Implicit empty-key with metadata in block maps** (`src/utils/composer.ts`):
  New helper `blockMapStartsWithValueSep(blockMap)` detects when an inner
  block-map begins with `:` (implicit empty key + value). Both
  `flattenBlockMapChildren` and `composeBlockSeq` now produce an empty
  scalar first key carrying the pending anchor/tag in this case, rather
  than attaching the metadata to the block map itself. Outer meta from
  across a newline still applies to the map. Resolves FH7J (tagged
  empty values in mappings) and the "anchor before `:`" portion of
  PW8X.
- **Space before `:` for anchor/tag-only keys** (`src/utils/stringify.ts`,
  `stringifyMapNodeLines`): The separator between key and `:` is now
  `<space>:` (a leading space, then colon) for keys whose only rendering
  is an anchor or tag (empty scalar with metadata, length 0). Previously
  only `YamlAlias` keys triggered this, leaving renders like `&a:` that
  were ambiguous (the colon could parse as part of the anchor name).

These fixes resolve the bugs originally surfaced by 7BMT, U3XV, 26DV
(anchor on outer line and anchor on inner key both lost), PW8X (anchor
on empty seq item moved to next item; anchor before `:` attached to map
instead of empty key; missing space before `:`), and FH7J (tagged empty
values in mappings).

Five canonical-output tests removed from `SKIP_ASSERTIONS` in
`__test__/utils/yaml-test-suite-skip-map.ts`: 26DV, 7BMT, FH7J, PW8X,
U3XV.

### Key Compliance Improvements (chomp preservation + numeric raw + meta split)

The jump from 97.47% to 97.93% raw compliance (2374/2424 assertions,
+26 assertions, +10 canonical-output tests previously skipped) came
from preserving block-scalar chomp metadata, preserving non-canonical
numeric source representations, and a document-level outer/inner
metadata split that mirrors the existing block-map and block-seq
splits.

The 10 newly-passing canonical-output tests removed from
`SKIP_ASSERTIONS` in `__test__/utils/yaml-test-suite-skip-map.ts`:
F8F9, JEF9/00, JEF9/01, JEF9/02, 6JWB, 735Y, C4HZ, UGM3, 9KAX, 6BFJ.

Categories of fixes:

- **Chomp preservation on `YamlScalar`** -- new optional fields
  `chomp: "strip" | "clip" | "keep"` and `raw: string` on
  `YamlScalar` (`src/schemas/YamlAstNodes.ts`). The composer's
  `getBlockChomp()` helper extracts the chomp indicator from the
  block-scalar header; `makeScalar()` stores it on the resulting node.
  `stripNodeComments()` and `normalizeNodeTags()` propagate `chomp`
  and `raw` when constructing replacement nodes so transformations
  do not lose round-trip metadata.
- **Value-driven chomp computation in `renderBlockLiteral`**
  (`src/utils/stringify.ts`) -- chomp is computed primarily from the
  value's trailing-newline structure (`+` for `\n\n`, `-` for no
  trailing `\n`, empty/clip for one trailing `\n`). The new
  `explicitChomp` parameter (sourced from `node.chomp` and routed
  through `renderString`) reserves `+` for newline-only values when
  the original chomp was `"keep"`, so an empty `|+` literal
  round-trips. The explicit indent indicator emission was also
  refined: for newline-only bodies the indicator is emitted only
  under keep-chomp.
- **Keep-chomp `...` document terminator** -- new `endsWithKeepChomp`
  helper detects when the rendered output ends with `|+` or `>+`. In
  canonical mode, `stringifyDocument()` emits an explicit `...\n`
  even when `doc.hasDocumentEnd` is false, because keep-chomp
  consumes any trailing blanks up to the next document marker --
  without `...` the reader cannot tell where the open-ended scalar
  ends. (Resolves F8F9, JEF9/00-02, 9KAX, 6BFJ.)
- **Numeric raw preservation** -- `makeScalar()` populates `raw` for
  plain scalars whose resolved value is a number and whose source
  spelling differs from `String(value)`. The decision is made by
  `shouldPreserveRaw(rawValue, value)`. The plain-scalar path inside
  `flattenBlockMapChildren()` (which builds `YamlScalar` directly
  for synthesized block-map keys/values) also populates `raw`.
  `stringifyScalarNodeLines()` prefers `node.raw` over
  `renderNumber(value)` so non-canonical formats (hex `0xFFEEBB`,
  octal, trailing zeros like `450.00`, leading `+`) survive
  round-trip. (Resolves UGM3 and several hex/octal canonical-output
  variants.)
- **Document-level outer/inner meta split in `composeDocument`** --
  parallel to the existing splits in `flattenBlockMapChildren` and
  `composeBlockSeq`. New `outerMeta` slot plus `sawNewlineSinceMeta`
  flag and `commitMetaAcrossNewline()` helper. When a tag/anchor at
  document level is followed by a newline and then more meta, the
  prior meta is committed to `outerMeta` (it belonged to the outer
  container). All six content-producing root paths (block-map,
  block-seq, flow-map, flow-seq, scalar-root, multi-line plain
  scalar) consult both slots. The flow-collection-as-key path
  splits outer (root map) vs inner (flow collection key) meta.
  (Resolves 6JWB, 735Y, C4HZ -- "tag-on-block-collection inline
  placement" -- by ensuring the tag attaches to the outer
  collection when separated by a newline, then naturally renders
  inline on the introducing line.)
- **Newline-aware tag/anchor split in `composeBlockSeq`** -- new
  `sawNewlineSincePending` flag. When a `-` entry is followed by a
  newline, then a flow-scalar-then-block-map (the implicit-map case),
  pending meta is routed to the outer map (`mapMeta`) rather than
  the first key. Resets on every meta-consuming code path.

### Dual Block Scalar Decoders

Block scalar fixes must be applied in **both** locations:

1. **Lexer** (`src/utils/lexer.ts` -- `scanBlockScalar()`): Produces the
   token value when lexing. Explicit indentation (e.g., `|2`) is computed
   relative to the parent block context (parent indent + explicit digit).
2. **Composer** (`src/utils/composer.ts` -- `decodeBlockScalar()`): Re-decodes
   from the CST `source` field. The composer does NOT use the lexer's
   decoded value; it re-parses the raw source independently. Uses
   `findParentIndent()` to scan backward through the full source text
   and locate the `:` or `-` that introduced the block scalar.

Both contain nearly identical logic for indent detection, line collection,
and chomp handling. Any fix to block scalar content must be applied to both.

### Canonical Output Testing Strategy

The compliance test harness uses `parseDocument()` +
`stringifyDocument({ forceDefaultStyles: true })` rather than
`parse()` + `stringify()` for canonical output comparison. This
preserves AST metadata (anchors, tags, document-start markers, scalar
styles) while normalizing collection styles to block defaults. This
approach resolved a large class of output comparison failures that were
caused by flow-style collections in the AST being stringified in their
original style rather than the canonical block form.

## Key Files

| File | Purpose |
| ---- | ------- |
| `__test__/yaml-test-suite.test.ts` | Filtered test runner with 4 assertion types |
| `__test__/yaml-test-suite-raw.test.ts` | Unfiltered test runner (no skip maps) |
| `__test__/utils/yaml-test-suite.ts` | Test data loader (flat + numbered subdirs) |
| `__test__/utils/yaml-test-suite-skip-map.ts` | SKIP, XFAIL, SKIP_ASSERTIONS maps |
| `__test__/debug-multiline.test.ts` | Multi-line plain scalar regression guards |
| `__test__/fixtures/yaml-test-suite/` | Git submodule (data-2022-01-17) |
| `vitest.config.ts` | Compliance + compliance-raw Vitest projects |
| `.github/workflows/compliance.yml` | Badge generation action |
| `.gitmodules` | Submodule configuration |
