---
title: Stringify
description: How AST nodes and JS values become YAML text.
status: current
module: yaml-effect
category: architecture
created: 2026-03-14
updated: 2026-04-27
last-synced: 2026-04-27
completeness: 87
related:
  - architecture.md
  - schemas.md
  - format-modify.md
dependencies:
  - schemas.md
---

File: `src/utils/stringify.ts`

## Overview

The stringifier converts JavaScript values and YAML AST nodes back into
YAML text. It supports configurable formatting with block/flow styles,
scalar quoting rules, key sorting, and round-trip preservation of AST node
styles.

## Public API

```typescript
function stringify(
  value: unknown,
  options?: YamlStringifyOptions | Partial<...>,
): Effect.Effect<string, YamlStringifyError>

function stringifyDocument(
  doc: YamlDocument,
  options?: YamlStringifyOptions | Partial<...>,
): Effect.Effect<string, YamlStringifyError>
```

`stringify()` handles all JS primitives, arrays, and plain objects.
`stringifyDocument()` preserves style metadata from AST nodes (scalar
`style`, collection `style`).

Both accept `YamlStringifyOptions` with defaults: indent 2, lineWidth 80,
plain scalars, block collections, no key sorting, trailing newline,
forceDefaultStyles false.

## Scalar Rendering

### Type-Conflict Detection

Before emitting a plain scalar, the stringifier checks if the string would
be mis-resolved as a non-string type by the YAML 1.2 Core Schema. Patterns
checked: null variants, boolean variants, integers (decimal/octal/hex),
floats (decimal/inf/nan). If a conflict exists, the string is quoted.

### Quoting Rules

A string requires quoting when:

- Empty string
- Contains newlines (prefers block literal)
- Would be resolved as non-string (see above)
- Starts with a YAML indicator character (`:`, `#`, `{`, `}`, `[`, `]`,
  `,`, `&`, `*`, `?`, `|`, `-`, `<`, `>`, `=`, `!`, `%`, `@`, `` ` ``)
- Starts with space or tab
- Starts with `---` or `...` (document markers)
- `:`, `?`, `-` at start require quoting only when followed by whitespace
  or when the string is a single character
- Contains `#` (always quoted)

When quoting is needed but the string contains no escape sequences
(no `\n`, `\r`, `\t`, `\`, `"`, `'`, or C0 control chars -- checked
via the `needsEscapes()` helper), the stringifier prefers single-quoted
style over double-quoted to produce cleaner output.

### Rendering Functions

- `renderDoubleQuoted(s)` -- escapes `\`, `"`, `\n`, `\r`, `\t`
- `renderSingleQuoted(s)` -- escapes `'` as `''`
- `renderBlockLiteral(s, indent, explicitChomp?)` -- `|` with chomp
  computed primarily from the value's trailing-newline structure: `+`
  for values ending in `\n\n`, `-` for values with no trailing `\n`,
  empty (clip) for exactly one trailing `\n`. The optional
  `explicitChomp` parameter (sourced from `YamlScalar.chomp`) reserves
  `+` for newline-only values (`/^\n+$/`) when the original chomp was
  `"keep"`, so that an empty `|+` literal round-trips correctly. The
  explicit indent indicator (`|2`, etc.) is emitted when the first
  content line starts with a space, or when the value starts with empty
  lines and has actual content; for newline-only values the indicator
  is emitted only under keep-chomp because the trailing blanks form the
  entire body and the reader has no other way to detect block
  indentation.
- `renderBlockFolded(s, indent)` -- `>` with the same value-driven
  chomp detection (no `explicitChomp` parameter currently). The
  explicit indent indicator (`>2`, etc.) is emitted both when the
  first content line starts with a space AND when the value begins
  with two or more empty lines followed by actual content. This
  differs from `renderBlockLiteral`'s rule, which fires on a single
  leading empty line: folded scalars have stricter auto-detect
  semantics, so a single leading blank still parses unambiguously
  via the next non-empty content line, but two or more leading
  blanks introduce enough ambiguity that libyaml's canonical form
  requires the indicator.
- `renderString(s, style, indent, ignoreType?, canonical?, explicitChomp?)`
  -- dispatches to the appropriate renderer, falling back to
  double-quoted for unsafe styles. Threads `explicitChomp` through to
  `renderBlockLiteral` for both the explicit `block-literal` style
  branch and the canonical-mode fallback used for plain/single-quoted
  multi-line content.
- `endsWithKeepChomp(rendered)` -- scans the rendered output for the
  most recent `|` or `>` block-scalar header (matching
  `[|>][1-9]?[+-]?` at end-of-string or before a newline) and returns
  true if its chomp indicator is `+`. Used by `stringifyDocument()` to
  decide whether to emit a closing `...` document-end marker (see
  below).

### Number Rendering

- `NaN` -> `.nan`
- `Infinity` -> `.inf`
- `-Infinity` -> `-.inf`
- Otherwise `String(n)`

When stringifying a `YamlScalar` whose `value` is a number,
`stringifyScalarNodeLines()` prefers `node.raw` when set over
`renderNumber(value)`. This preserves non-canonical source spellings
that resolve to the same JS number (hex `0xFFEEBB`, octal, trailing
zeros like `450.00`, leading `+`, etc.) across a parse/stringify
round-trip.

## Collection Rendering

### Arrays

- Empty: `[]`
- Flow style: `[item1, item2]`
- Block style: `- item` entries with proper indentation for nested
  block scalars and collections

### Objects

- Empty: `{}`
- Flow style: `{key: value, key: value}`
- Block style: `key: value` entries. Block collection values go on the
  next line with indentation; block scalar headers go on the same line
  as the key.

The `isBlockCollection()` helper ensures non-empty block collections are
never placed inline after a key colon.

### Compact Notation

Block sequence values under a mapping key use compact notation -- the
first sequence entry appears at the same indent level as the key rather
than being indented relative to it. This matches the canonical YAML
style expected by the yaml-test-suite:

```yaml
key:
- item1
- item2
```

Block scalar content lines are emitted without an extra indent prefix
relative to the key (the block scalar header already establishes the
indent level).

## AST Node Stringification

When stringifying `YamlDocument` via `stringifyDocument()`, the stringifier
reads style metadata from each AST node:

- `YamlScalar.style` determines the scalar rendering style
- `YamlMap.style` / `YamlSeq.style` determines block vs flow
- `YamlAlias` renders as `*name`
- Nodes without explicit style fall back to the options defaults

### AST Metadata Preservation

`stringifyDocument()` preserves additional AST metadata:

- **Anchors**: `&name` is prepended to the first line of scalar, map, and
  seq node output
- **Tags**: tag string is prepended before anchors (ordering:
  `!!tag &anchor value`)
- **Document start**: `---\n` is emitted when `doc.hasDocumentStart` is
  true. When the root node has a tag, the inline form `--- content` is
  used instead
- **Document end**: `...\n` is emitted when `doc.hasDocumentEnd` is
  true. In canonical mode (`forceDefaultStyles`), the terminator is
  also emitted automatically when `endsWithKeepChomp(result)` reports
  that the rendered body ends with an open-ended block scalar (`|+` or
  `>+`). Without the explicit `...`, the reader has no way to know
  where the open-ended scalar ends, since keep-chomp consumes any
  trailing blank lines up to the next document marker.
- **Chomp**: `node.chomp` is threaded through `renderString` to
  `renderBlockLiteral` so that `|+` / `|-` headers round-trip
  correctly even when the resolved value alone cannot disambiguate
  them.
- **Numeric raw**: `node.raw` is preferred over `renderNumber(value)`
  when stringifying numeric scalars (see Number Rendering).

`stripNodeComments()` and `normalizeNodeTags()` propagate the new
`chomp` and `raw` fields when constructing replacement scalar nodes,
so neither comment-stripping nor tag normalization loses round-trip
metadata.

### Explicit `? key\n: value` Syntax

`stringifyMapNodeLines()` emits explicit-key block syntax (`? key\n: value`
rather than implicit `key: value`) when the key cannot be expressed on a
single line in front of the colon. The trigger is the `isComplexKey`
predicate, computed via the new `keyIsScalarWithNewline` helper:

- Key is a `YamlMap` or `YamlSeq` (existing trigger -- non-scalar keys must
  be hoisted onto a `?` line).
- Key is a `YamlScalar` whose value is a `string` containing `\n` (new) --
  multi-line scalar values cannot be inlined as `key:` because the colon
  would land mid-content.
- Key is a `YamlScalar` whose `style` is `block-literal` or `block-folded`
  (new) -- the rendered key always begins with a `|` / `>` header line, so
  the implicit form would emit `|...:` and corrupt the header.

When `isComplexKey` is true the renderer emits `? <first-line>` for the
key, then the continuation lines, then a `: <value>` line.

### Complex-Key Continuation Indent

Continuation lines after the first key line are indented by `pad`
(matching the `?` column) by default. Two exceptions suppress the pad:

- **Metadata-only first line**: when the first line contains only metadata
  tokens (`&anchor` and/or `!tag`, with no value text), the continuation
  lines are the actual collection body and are emitted with **no extra
  padding** -- they sit at the same column as `?`. This produces the
  compact canonical form for keys like `? &a !!map\nkey: value`, where
  `key: value` is the map body, not an indented continuation of the key.
  The metadata-only test (`firstIsMetaOnly`) splits the first line on
  whitespace and checks that every non-empty token starts with `&` or
  `!`.
- **Block-style scalar key** (new): when the key is a `YamlScalar` with
  style `block-literal` or `block-folded` (`keyIsBlockScalar`), the
  continuation lines are already indented by `renderBlockLiteral` /
  `renderBlockFolded` themselves -- the renderer bakes the block-scalar
  body indent into each line it produces. Adding another `pad` here would
  double-indent the body. So `contPad = ""` for block-scalar keys.

For all other complex keys, `contPad = pad`.

### Compact Value Placement Under Explicit Keys

When the explicit-key path emits the `:` line, the renderer uses compact
notation (matching libyaml canonical output) for non-empty block
collection values:

- **Block-sequence value** (first item starts with `-`): the first item
  appears on the colon line as `: <first-item>`, and remaining items are
  indented by `pad` to align under the first item. Previously the
  renderer fell through to `:\n<items>`, leaving the colon on its own
  line.
- **Block-mapping value**: detected via `valNode instanceof YamlMap` with
  non-empty items and resolved style `"block"`. The first pair appears on
  the colon line as `: <first-pair>`, and remaining pairs are indented by
  `pad`. This is a new branch -- previously block-mapping values fell
  through to the indented `:\n<pairs>` form.
- **Block-scalar header / inline-quoted value** (existing): first line on
  the colon line, continuation lines emitted as-is (the renderer already
  baked in the necessary indentation).
- **Single-line value**: on the colon line as `: <value>`.

This compact placement resolved several yaml-test-suite canonical-output
mismatches (5WE3, 6SLA, Q9WF cleared from `SKIP_ASSERTIONS`).

### forceDefaultStyles Option

When `forceDefaultStyles` is `true`, node collection styles (block/flow)
are overridden with the options defaults. However, multiline scalar
sub-styles (block-literal, block-folded, double-quoted) are preserved to
maintain content fidelity. This option is primarily used for canonical
output comparison in compliance testing.

Document-level comments are prepended as `# comment\n`.

## Circular Reference Detection

The `detectCircular()` function tracks object ancestors via a `Set<object>`.
Circular references cause `YamlStringifyError`.

## Error Handling

All errors are caught and wrapped as `YamlStringifyError` with `value`
(the input) and `reason` (the error message).
