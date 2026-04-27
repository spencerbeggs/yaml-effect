---
title: Parsing
description: Lexer, parser, and composer -- how YAML text becomes AST.
status: current
module: yaml-effect
category: architecture
created: 2026-03-14
updated: 2026-03-19
last-synced: 2026-03-19
completeness: 85
related:
  - architecture.md
  - schemas.md
  - errors.md
dependencies:
  - schemas.md
---

The parsing pipeline has three stages: lexer (tokenization), parser (CST
construction), and composer (AST construction with type resolution).

## Lexer (`src/utils/lexer.ts`)

### Scanner (`createScanner`)

The core scanning engine is a stateful, imperative, synchronous scanner.
It is the only mutable module in the pipeline.

```typescript
interface YamlScanner {
  scan(): YamlTokenKind | null;
  getToken(): YamlTokenKind | null;
  getTokenValue(): string;
  getTokenOffset(): number;
  getTokenLength(): number;
  getTokenLine(): number;
  getTokenColumn(): number;
  getPosition(): number;
  setPosition(pos: number): void;
}

function createScanner(text: string): YamlScanner
```

Pull-based: call `scan()` to advance to the next token, then use
`getToken*()` methods to inspect it. `setPosition()` resets all scanner
state (indentation, flow depth, pending tokens) for incremental re-scanning.

The scanner tracks:

- `pos`, `line`, `col` -- current position
- `lineIndent`, `lineIndentLocked` -- block indentation tracking
- `flowDepth` -- flow context nesting depth
- `blockStarted: Map<number, "map" | "seq">` -- tracks emitted block-start
  markers per indent level
- `pending: YamlToken[]` -- buffer for synthetic tokens (block-map-start,
  block-seq-start) that must be emitted before the next real token

### Token Production

The scanner handles all YAML 1.2 constructs:

- **Newlines and whitespace** -- separate tokens; tab indentation produces
  `error` tokens per YAML 1.2 section 6.1
- **Comments** -- `#` to end of line
- **Document markers** -- `---` and `...` (only at column 0, followed by
  EOF/newline/whitespace)
- **Directives** -- `%` at column 0, consumes entire line
- **Block scalars** -- `|` (literal) and `>` (folded) with header parsing
  (chomp `+`/`-`, explicit indent `1`-`9`), auto-indent detection, and
  proper line folding. Explicit indentation (e.g., `|2`) is computed
  relative to the parent block context (parent indent + explicit digit),
  not just the digit alone
- **Quoted scalars** -- single-quoted (with `''` escape) and double-quoted
  (with full YAML 1.2 escape sequences: `\n`, `\t`, `\x`, `\u`, `\U`,
  `\N`, `\_`, `\L`, `\P`, line continuation)
- **Flow indicators** -- `{`, `}`, `[`, `]`, `,` with flow depth tracking
- **Anchors** (`&name`), **aliases** (`*name`), **tags** (`!`, `!!`, `!<>`)
- **Block structure** -- `?` (explicit key), `-` (sequence entry), `:`
  (value indicator). These emit synthetic `block-map-start` or
  `block-seq-start` tokens via the `ensureBlockMap`/`ensureBlockSeq` helpers
  when entering a new block scope
- **Plain scalars** -- fallback for unquoted text, with trailing whitespace
  trimming
- **Flow context quoted scalar handling** -- the `afterQuotedScalar` flag
  persists across whitespace, newlines, and comments so that `:` on the
  next line after a quoted key is recognized as a value indicator

### Stream API (`lex`)

```typescript
function lex(text: string): Stream.Stream<YamlToken, never>
```

Wraps `createScanner` in `Stream.unfold` for lazy token production. Error
channel is `never` -- lexer errors are embedded as `"error"` kind tokens.

```typescript
function lexAll(text: string): Effect.Effect<ReadonlyArray<YamlToken>, never>
```

Convenience: collects all tokens into an array.

## Parser (`src/utils/parser.ts`)

Transforms tokens into a CST (Concrete Syntax Tree). The CST preserves
every character of the original input.

### Implementation

Recursive descent parser operating on a collected token array (`ParserState`
with `tokens`, `text`, `pos`). Key functions:

- `parseDocuments()` -- top-level: splits input into document nodes
- `parseDocument()` -- directives, document-start marker, content
- `parseBlockMapping()` / `parseBlockSequence()` -- block structures with
  indent-based scoping
- `parseFlowMapping()` / `parseFlowSequence()` -- flow structures with
  bracket matching
- `parseBlockScalar()` -- wraps lexer-produced block scalar tokens
- `parseBlockValue()` -- content after `:` in a block mapping. Handles
  `block-seq-start`/`block-seq-entry` tokens after explicit keys (gated
  by `explicitKey` parameter)
- `parseSequenceEntryContent()` -- content after `-` in a sequence, with
  implicit mapping detection via `hasImplicitMapAhead()`. Checks for
  nested `block-seq-entry` at deeper indent before implicit mapping to
  prevent absorbing nested `- key: value` patterns
- `parseBlockMapping()` -- handles compact block sequences as mapping
  values when a `block-seq-entry` appears at the same indent and the
  last non-trivia child was a value separator `:`
- `parseImplicitBlockMapping()` -- handles `- key: value` patterns. Checks
  token column against parent sequence indent, breaking out when content
  returns to parent level
- `lastNonTriviaIsValueSep()` -- skips anchor and tag nodes (metadata, not
  values) when checking if the previous non-trivia token was a value
  separator
- `findFirstSeqEntryColumn()` -- helper for resolving indent level of the
  first sequence entry in a block

CST node construction:

- `makeContainerNode()` -- computes `source`, `offset`, `length` from
  children's span
- `makeLeafNode()` -- uses raw source text (NOT decoded `token.value`) for
  fidelity

### Public API

```typescript
function parseCST(text: string): Stream.Stream<CstNode, never>
function parseCSTAll(text: string): Effect.Effect<CstNode[], never>
```

## Composer (`src/utils/composer.ts`)

Transforms CST nodes into AST nodes (`YamlDocument`) with YAML 1.2 Core
Schema type resolution.

### Type Resolution

Implements spec chapter 10.3.2:

- `null`, `Null`, `NULL`, `~` -> `null`
- `true`/`True`/`TRUE` -> `true`, `false`/`False`/`FALSE` -> `false`
- Decimal integers, `0o` octal, `0x` hex -> `number`
- Decimal floats, `.inf`/`.Inf`/`.INF`, `-.inf`, `.nan`/`.NaN`/`.NAN` ->
  `number`
- Everything else -> `string`

### Scalar Flow Folding

The composer implements YAML 1.2 §6.5 flow line folding for all scalar
styles:

- **Plain scalars** (`decodePlainScalar`): Trims outer whitespace, then
  applies `foldFlowLines`. Multi-line plain scalars span multiple CST
  `flow-scalar` nodes (one per source line); `collectMultilinePlainScalar`
  merges consecutive plain scalars, stopping at block structure indicators
  (`?`, `:`, `-`), comments, and scalars followed by value-sep (mapping
  keys). Continuation line detection also handles non-scalar CST nodes
  (anchors, tags, aliases, directives at non-document-start positions)
  via `extractLineContent` and `skipChildrenOnLine` helpers. Multi-line
  explicit keys (`?` followed by indented continuation scalars) are
  merged via `collectMultilineKey`.
- **Single-quoted scalars** (`decodeSingleQuoted`): Unescapes `''` to
  `'`, then applies `foldFlowLines`.
- **Double-quoted scalars** (`decodeDoubleQuoted`): Processes escape
  sequences first, then applies folding inline. Uses `significantEnd`
  tracking to distinguish escape-produced content (preserved) from raw
  trailing whitespace (trimmed at fold points). Consecutive empty lines
  are consumed in a single pass to avoid double-processing.

`foldFlowLines` implements the core algorithm: bare newlines between
non-empty lines become spaces, empty lines are preserved as newline
characters, and leading whitespace on continuation lines is trimmed.

### CST-to-AST Mapping

The composer walks CST nodes and produces:

- `document` -> `YamlDocument` (with directives, errors, warnings, comment,
  hasDocumentStart)
- `block-map` / `flow-map` -> `YamlMap` with `YamlPair` items
- `block-seq` / `flow-seq` -> `YamlSeq` with `YamlNode` items
- `flow-scalar` / `block-scalar` -> `YamlScalar` with resolved value and
  style detection
- `alias` -> `YamlAlias`
- `anchor` / `tag` -> applied to the next value node
- `comment` -> attached to parent node's `comment` field

`hasDocumentStart` is detected by checking for a `whitespace` CST node
with `source === "---"` among the document's children.

### Scalar Construction (`makeScalar`)

`makeScalar()` builds a `YamlScalar` from a CST scalar node. In addition
to `value`, `style`, `tag`, `anchor`, and `comment`, it populates two
optional round-trip metadata fields:

- **`chomp`** -- for block scalars only, computed by `getBlockChomp(node)`.
  The helper trims leading whitespace from `node.source`, isolates the
  header line (text before the first newline), and returns `"keep"` if it
  contains `+`, `"strip"` if it contains `-`, otherwise `"clip"`. Returns
  `undefined` for non-block scalars. The chomp indicator is required for
  faithful round-tripping of `|+` headers because the resolved value alone
  cannot distinguish between "the value happened to end in a newline" and
  "the source explicitly requested all trailing newlines preserved".
- **`raw`** -- the source representation when `style === "plain"`,
  `typeof value !== "string"`, and the source form differs from
  `String(value)`. The check is performed by `shouldPreserveRaw(rawValue,
  value)`, which returns `true` only for numbers whose source spelling
  (hex `0xFFEEBB`, octal, `450.00`, etc.) does not equal `String(value)`.
  Populated by `makeScalar()` for normal scalar nodes and by the
  plain-scalar paths inside `flattenBlockMapChildren()` (which constructs
  `YamlScalar` instances directly when synthesizing block-map keys/values
  from concatenated `flow-scalar` children).

### TAG Directive Resolution

The composer processes `%TAG` directives to build a tag handle prefix
map (`tagMap` on `ComposerState`). The `resolveTagHandle()` function
expands tag handles when resolving scalars:

- `!!` shorthand is expanded via the `!!` mapping (defaults to
  `tag:yaml.org,2002:`)
- Named handles like `!e!` are expanded via their `%TAG` definition
- Primary `!` handle is expanded via the `!` mapping

The tag map is populated during `composeDocument` and threaded through
all `resolveScalar()` calls.

### Block Map Flattening

`flattenBlockMapChildren()` reorganizes raw CST children into a
structured key/value sequence. Notable behaviors:

- `?` whitespace nodes reset the `afterValueSep` flag
- `hasValueSepBetween` check prevents false scalar-before-block-map
  pattern matching (where a scalar sibling should not be absorbed as
  a key if a value separator appears between them)

### Anchor/Alias Handling

- `buildAnchorMap(node)` -- builds a `Map<string, YamlNode>` from anchor
  definitions in the AST
- Alias resolution in `getNodeValue()` uses the anchor map to substitute
  aliased values
- `maxAliasCount` option (default 100) prevents DoS via alias expansion
- `checkAnchorOnAlias()` validates that anchors are not applied to alias
  nodes (produces `DuplicateAnchor` fatal error). Aliases used as
  implicit mapping keys (followed by block-map) skip this check since
  the anchor applies to the map, not the alias.

### Newline-Aware Tag/Anchor Split in `composeBlockSeq`

`composeBlockSeq()` tracks `pendingMeta` (the most-recent uncomsumed
tag/anchor) plus a `sawNewlineSincePending` flag. The flag is set when
a `newline` CST child is encountered while `pendingMeta` is non-empty,
and cleared whenever the meta is consumed. When the next significant
content is a flow-scalar followed by a block-map (the implicit-map case
inside a sequence entry, e.g. `- !!map\n  key: value`), the helper
splits the meta:

- If `sawNewlineSincePending` is true, the pending meta belongs to the
  outer container (the implicit map). The first key is constructed
  with no meta, and `composeBlockMap(blockMap, state, key, mapMeta)`
  receives `mapMeta`.
- Otherwise, the pending meta attaches to the first key (legacy
  behavior: `&a key: value` anchors the key, not the map).

Without this split, a tag like `!!map` written above the first key on
its own line was incorrectly attached to the key (or silently dropped
when the next anchor overwrote it). The same flag is also reset on
every other code path that consumes `pendingMeta` (scalar, alias,
block-map, block-seq, empty-key cases).

### Flow Collection as Document-Level Key

When `composeDocument()` encounters a `flow-seq` or `flow-map` CST node
followed by a `block-map` sibling, the flow collection becomes the first
key of an implicit mapping via `composeBlockMap(blockMap, state, flowNode)`.
When metadata is present, the `outerMeta` split (described below) routes
it to the outer block-map; the remaining `meta` attaches to the flow
collection that becomes the inner first key. Both `flow-map`-as-key and
`flow-seq`-as-key paths use this split.

### Document-Level Outer/Inner Meta Split (`composeDocument`)

`composeDocument()` maintains two metadata slots:

- `meta` -- the most-recent uncommitted tag/anchor at document level.
- `outerMeta` -- meta that has crossed a newline boundary and therefore
  belongs to the outer container (the root collection), not to whatever
  inner key/scalar it precedes.

A `sawNewlineSinceMeta` flag is set whenever a `newline` CST child is
seen while `meta` is non-empty. When the next `anchor` or `tag` child
arrives, the helper `commitMetaAcrossNewline()` moves the existing
`meta` into `outerMeta` (because that meta crossed a newline) and
starts a fresh `meta` for the incoming token. Without this commit step,
a sequence like `&a !!t1\n&b !!t2 key: ...` would silently overwrite
the first pair when the second arrives.

When the document's root content is finally constructed, all six
content-producing paths consult both slots:

- **block-map** / **block-seq** / **flow-map** / **flow-seq** as root
  collection -- combine `outerMeta` and `meta` (both apply to the same
  collection at root level when there is no inner key).
- **flow-map** / **flow-seq as key** (followed by a `block-map`
  sibling) -- when `outerMeta` is set, route it to the outer
  `composeBlockMap` call as `mapMeta`; route remaining `meta` to the
  flow collection (the inner first key). When `outerMeta` is empty,
  combine both into the flow collection's meta.
- **scalar root** (including the multi-line plain scalar path via
  `collectMultilinePlainScalar`) -- combine `outerMeta` and `meta` and
  apply to the scalar.
- **scalar as block-map key** -- when `outerMeta` is set, it becomes
  the map meta and `meta` becomes the key meta. When `outerMeta` is
  empty, the legacy `hasDocStart && hasMeta(meta)` rule still treats
  `meta` as map-level (otherwise it attaches to the key). The same
  three-branch resolution is applied to both the `block-map` follow-on
  case and the flat (`hasValueSepAfter`) case.

After the root content is built, both `meta` and `outerMeta` are
cleared and `sawNewlineSinceMeta` is reset.

### Explicit Key `?` in Flow Mappings

`flattenFlowChildren()` recognizes `?` whitespace nodes as explicit key
indicators, emitting `{ kind: "key" }` semantic items. `buildPairs()`
handles key items without an attached node by consuming the next node
item as the explicit key. Trailing `?` with no content creates a
null-key entry.

### Error Handling

Composition errors produce `YamlComposerError` containing:

- `errors: ReadonlyArray<YamlErrorDetail>` -- with code, message, offset,
  length, line, column
- `text: string` -- the original source

Error codes: `UndefinedAlias`, `DuplicateAnchor`, `CircularAlias`,
`UnresolvedTag`, `InvalidTagValue`, `AliasCountExceeded`.

### Block Scalar Decoding

The composer's `decodeBlockScalar()` re-decodes block scalar content from
the CST `source` field independently of the lexer. Explicit indentation
is computed using `findParentIndent()`, which scans backward through the
full source text to find the `:` or `-` that introduced the block scalar,
then adds the explicit indent digit to that parent indent level. This
ensures correct content extraction when block scalars are nested inside
mappings or sequences.

See also the "Dual Block Scalar Decoders" note in
[compliance-testing.md](./compliance-testing.md) -- any block scalar fix
must be applied in both the lexer and composer.

### Composer Public API

```typescript
function parse(
  text: string,
  options?: Partial<YamlParseOptions>,
): Effect.Effect<unknown, YamlComposerError>

function parseDocument(
  text: string,
  options?: Partial<YamlParseOptions>,
): Effect.Effect<YamlDocument, YamlComposerError>

function parseAllDocuments(
  text: string,
  options?: Partial<YamlParseOptions>,
): Effect.Effect<YamlDocument[], YamlComposerError>
```

`parse()` returns the plain JS value (first document). `parseDocument()`
returns the full `YamlDocument` AST. `parseAllDocuments()` returns all
documents for multi-document streams.

## AST Navigation (`src/utils/ast.ts`)

Utilities for traversing the AST after parsing:

```typescript
// Type guards
function isScalar(node: unknown): node is YamlScalar
function isMap(node: unknown): node is YamlMap
function isSeq(node: unknown): node is YamlSeq
function isPair(node: unknown): node is YamlPair
function isAlias(node: unknown): node is YamlAlias
function isNode(node: unknown): node is YamlNode
function isDocument(node: unknown): node is YamlDocument

// Navigation (all Fn.dual(2, ...))
const findNode: (root, path) => Effect<Option<YamlNode>>
const findNodeAtOffset: (root, offset) => Effect<Option<YamlNode>>
const getNodePath: (root, offset) => Effect<Option<YamlPath>>

// Value extraction
function getNodeValue(node: YamlNode): Effect<unknown>
```

`findNode` navigates by string keys (YamlMap) and numeric indices (YamlSeq).
`findNodeAtOffset` finds the deepest node containing a character offset.
`getNodePath` returns the path segments leading to a node at a given offset.
`getNodeValue` recursively extracts plain JS values (aliases return the
anchor name, not the resolved value).
