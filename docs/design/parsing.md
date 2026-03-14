---
title: Parsing
description: Lexer, parser, and composer -- how YAML text becomes AST.
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
  proper line folding
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
- `parseBlockValue()` -- content after `:` in a block mapping
- `parseSequenceEntryContent()` -- content after `-` in a sequence, with
  implicit mapping detection via `hasImplicitMapAhead()`
- `parseImplicitBlockMapping()` -- handles `- key: value` patterns

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

### CST-to-AST Mapping

The composer walks CST nodes and produces:

- `document` -> `YamlDocument` (with directives, errors, warnings, comment)
- `block-map` / `flow-map` -> `YamlMap` with `YamlPair` items
- `block-seq` / `flow-seq` -> `YamlSeq` with `YamlNode` items
- `flow-scalar` / `block-scalar` -> `YamlScalar` with resolved value and
  style detection
- `alias` -> `YamlAlias`
- `anchor` / `tag` -> applied to the next value node
- `comment` -> attached to parent node's `comment` field

### Anchor/Alias Handling

- `buildAnchorMap(node)` -- builds a `Map<string, YamlNode>` from anchor
  definitions in the AST
- Alias resolution in `getNodeValue()` uses the anchor map to substitute
  aliased values
- `maxAliasCount` option (default 100) prevents DoS via alias expansion

### Error Handling

Composition errors produce `YamlComposerError` containing:

- `errors: ReadonlyArray<YamlErrorDetail>` -- with code, message, offset,
  length, line, column
- `text: string` -- the original source

Error codes: `UndefinedAlias`, `DuplicateAnchor`, `CircularAlias`,
`UnresolvedTag`, `InvalidTagValue`, `AliasCountExceeded`.

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
