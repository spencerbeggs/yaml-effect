---
title: Schemas
description: All Schema definitions including AST nodes, visitor events, CST nodes, tokens, options, and shared types.
status: current
module: yaml-effect
category: architecture
created: 2026-03-14
updated: 2026-03-19
last-synced: 2026-03-19
completeness: 85
related:
  - architecture.md
  - parsing.md
  - visitor.md
dependencies: []
---

All data structures are defined as `Schema.Class` or `Schema.TaggedClass`
instances from the Effect `Schema` module.

## Shared Types (`src/schemas/YamlShared.ts`)

### ScalarStyle

```typescript
const ScalarStyle = Schema.Literal(
  "plain", "single-quoted", "double-quoted", "block-literal", "block-folded"
)
```

### CollectionStyle

```typescript
const CollectionStyle = Schema.Literal("block", "flow")
```

### YamlRange

Zero-based character offset and length, measured in UTF-16 code units.

Fields: `offset: Int (>= 0)`, `length: Int (>= 0)`.

### YamlEdit

A non-mutating text edit. `offset` and `length` identify the span to
replace; `content` is the replacement string. Set `length` to 0 for insert,
`content` to `""` for delete.

Fields: `offset: Int (>= 0)`, `length: Int (>= 0)`, `content: String`.

### YamlPath

```typescript
type YamlPath = ReadonlyArray<string | number>
```

Path segments for navigating YAML document trees. Strings for object keys,
numbers for array indices.

## AST Nodes (`src/schemas/YamlAstNodes.ts`)

All AST nodes use `Schema.TaggedClass` with a `_tag` discriminant. The
`YamlNode` union is defined lazily via `Schema.suspend` to break circular
references (`YamlNode -> YamlMap -> YamlPair -> YamlNode`).

### YamlScalar

Tag: `"YamlScalar"`. Fields:

- `value: Unknown` -- resolved JS value (null, boolean, number, string)
- `style: ScalarStyle` -- presentation style from source
- `tag?: String` -- explicit YAML tag (e.g., `!!str`)
- `anchor?: String` -- anchor name
- `comment?: String` -- trailing/leading comment text
- `chomp?: Literal("strip", "clip", "keep")` -- block-scalar chomp
  indicator parsed from the source header (`-` strip, `+` keep, otherwise
  clip). Populated only for block-literal/block-folded scalars; absent for
  flow scalars. Used by the stringifier to round-trip `|+` / `|-` headers
  whose semantics cannot be inferred from the resolved value alone (e.g.
  newline-only content needs `|+` to preserve a trailing newline).
- `raw?: String` -- source representation of a numeric scalar when it
  differs from `String(value)`. Populated for plain scalars whose
  resolved value is `typeof "number"` and whose source form is
  non-canonical (hex `0xFFEEBB`, octal `0o755`, trailing zeros `450.00`,
  etc.). The stringifier prefers `raw` over `renderNumber(value)` so the
  original textual format survives a parse/stringify round-trip.
- `offset: Int (>= 0)`, `length: Int (>= 0)`

### YamlAlias

Tag: `"YamlAlias"`. Fields:

- `name: String` -- anchor name (without leading `*`)
- `offset: Int (>= 0)`, `length: Int (>= 0)`

### YamlPair

Tag: `"YamlPair"`. Fields:

- `key: YamlNode` -- the mapping key
- `value: YamlNode | null` -- the mapping value (null when absent)
- `comment?: String`

### YamlMap

Tag: `"YamlMap"`. Fields:

- `items: Array<YamlPair>` -- key-value entries
- `style: CollectionStyle`
- `tag?: String`, `anchor?: String`, `comment?: String`
- `offset: Int (>= 0)`, `length: Int (>= 0)`

### YamlSeq

Tag: `"YamlSeq"`. Fields:

- `items: Array<YamlNode>` -- sequence elements
- `style: CollectionStyle`
- `tag?: String`, `anchor?: String`, `comment?: String`
- `offset: Int (>= 0)`, `length: Int (>= 0)`

### YamlNode (Union)

```typescript
const YamlNode: Schema<YamlScalar | YamlMap | YamlSeq | YamlAlias>
```

## Document (`src/schemas/YamlDocument.ts`)

### YamlDirective

Fields: `name: Literal("YAML", "TAG")`, `parameters: Array<String>`.

### YamlDocument

Fields:

- `contents: YamlNode | null` -- root AST node (null for empty documents)
- `errors: Array<YamlErrorDetail>` -- parse errors
- `warnings: Array<YamlErrorDetail>` -- non-fatal warnings
- `directives: Array<YamlDirective>`
- `comment?: String` -- document-level comment
- `hasDocumentStart: Boolean` (default: `false`) -- whether `---` was
  present in the source. Used by `stringifyDocument()` to decide whether
  to emit a document-start marker in output

## Token (`src/schemas/YamlToken.ts`)

### YamlTokenKind

22 token kinds produced by the lexer:

```text
document-start, document-end, directive, tag, anchor, alias, scalar,
block-map-start, block-map-key, block-map-value,
block-seq-start, block-seq-entry,
flow-map-start, flow-map-end, flow-seq-start, flow-seq-end, flow-separator,
newline, whitespace, comment, byte-order-mark, error
```

### YamlToken

Fields: `kind: YamlTokenKind`, `value: String`, `offset: Int (>= 0)`,
`length: Int (>= 0)`, `line: Int (>= 0)`, `column: Int (>= 0)`.

## CST Node (`src/schemas/CstNode.ts`)

### CstNodeType

15 node types: `document`, `directive`, `comment`, `block-map`, `block-seq`,
`flow-map`, `flow-seq`, `block-scalar`, `flow-scalar`, `alias`, `anchor`,
`tag`, `whitespace`, `newline`, `error`.

### CstNode

Fields: `type: CstNodeType`, `source: String`, `offset: Int (>= 0)`,
`length: Int (>= 0)`, `children?: Array<CstNode>` (recursive).

## AST Visitor Events (`src/schemas/YamlVisitorEvent.ts`)

11 event variants, each a `Schema.TaggedClass`. All share
`path: Array<String | Number>` and `depth: Int (>= 0)`.

| Event | Additional Fields |
| ----- | ----------------- |
| DocumentStartEvent | `directives` |
| DocumentEndEvent | -- |
| MapStartEvent | `style`, `tag?`, `anchor?` |
| MapEndEvent | -- |
| SeqStartEvent | `style`, `tag?`, `anchor?` |
| SeqEndEvent | -- |
| PairEvent | `key`, `value` |
| ScalarEvent | `value`, `style`, `tag?`, `anchor?` |
| AliasEvent | `name` |
| CommentEvent | `text` |
| DirectiveEvent | `name`, `parameters` |

Type guard predicates are exported for each variant (e.g.,
`isDocumentStartEvent`, `isScalarEvent`).

## CST Visitor Events (`src/schemas/YamlCstVisitorEvent.ts`)

13 event variants, each a `Schema.TaggedClass`. All share
`path: Array<String | Number>` and `depth: Int (>= 0)`.

| Event | Tag | Additional Fields |
| ----- | --- | ----------------- |
| CstDocumentStartEvent | `"CstDocumentStartEvent"` | -- |
| CstDocumentEndEvent | `"CstDocumentEndEvent"` | -- |
| CstMapStartEvent | `"CstMapStartEvent"` | `source: String` |
| CstMapEndEvent | `"CstMapEndEvent"` | -- |
| CstSeqStartEvent | `"CstSeqStartEvent"` | `source: String` |
| CstSeqEndEvent | `"CstSeqEndEvent"` | -- |
| CstKeyEvent | `"CstKeyEvent"` | `source: String` |
| CstValueEvent | `"CstValueEvent"` | `source: String` |
| CstScalarEvent | `"CstScalarEvent"` | `source: String` |
| CstAliasEvent | `"CstAliasEvent"` | `source: String` |
| CstCommentEvent | `"CstCommentEvent"` | `source: String` |
| CstDirectiveEvent | `"CstDirectiveEvent"` | `source: String` |
| CstErrorEvent | `"CstErrorEvent"` | `source: String` |

Key differences from AST events:

- All content fields are `source: String` (raw text, no type resolution)
- No `Pair` event -- CST uses separate `Key` and `Value` events
- `Error` event for CST error nodes (AST visitor uses the error channel)
- Error channel is `never`

Type guard predicates exported for each (e.g., `isCstKeyEvent`,
`isCstErrorEvent`).

## Options

### YamlParseOptions (`src/schemas/YamlParseOptions.ts`)

- `strict: Boolean` (default: `true`) -- treat errors as failures
- `maxAliasCount: Int (>= 0)` (default: `100`) -- DoS protection
- `uniqueKeys: Boolean` (default: `true`) -- duplicate key enforcement

### YamlStringifyOptions (`src/schemas/YamlStringifyOptions.ts`)

- `indent: Int (>= 0)` (default: `2`)
- `lineWidth: Int (> 0)` (default: `80`)
- `defaultScalarStyle: ScalarStyle` (default: `"plain"`)
- `defaultCollectionStyle: CollectionStyle` (default: `"block"`)
- `sortKeys: Boolean` (default: `false`)
- `finalNewline: Boolean` (default: `true`)
- `forceDefaultStyles: Boolean` (default: `false`) -- when true, overrides
  AST node collection styles with the defaults from options. Multiline
  scalar sub-styles (block-literal, block-folded, double-quoted) are
  preserved. Primarily used for canonical output comparison in compliance
  testing

### YamlFormattingOptions (`src/schemas/YamlFormattingOptions.ts`)

Superset of `YamlStringifyOptions` with additional fields:

- `preserveComments: Boolean` (default: `true`)
- `range?: YamlRange` -- restrict formatting to a document region
