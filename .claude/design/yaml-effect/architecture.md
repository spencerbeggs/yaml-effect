---
status: draft
module: yaml-effect
category: architecture
created: 2026-03-13
updated: 2026-03-13
last-synced: never
completeness: 90
related: []
dependencies: []
---

# YAML Effect - Architecture

Pure Effect-based YAML 1.2 parser, stringifier, and document manipulation
library for TypeScript. Sister module to jsonc-effect.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [Integration Points](#integration-points)
7. [Testing Strategy](#testing-strategy)
8. [Future Enhancements](#future-enhancements)
9. [Related Documentation](#related-documentation)

---

## Overview

`@spencerbeggs/yaml-effect` provides a complete, spec-compliant YAML 1.2
Core Schema implementation with zero external dependencies beyond the `effect`
package. It is a clean-room implementation following a three-stage pipeline
architecture (Lexer, Parser, Composer) with full streaming support.

**Key Design Principles:**

- Full YAML 1.2 Core Schema compliance, validated against the official
  yaml-test-suite
- Pure Effect types throughout: tagged errors, Schema integration, Stream APIs
- Zero external parser dependencies; `effect` as sole peer dependency
- Three-stage pipeline: Lexer (tokens) -> Parser (CST) -> Composer (AST)
- Bidirectional Schema integration (decode parses YAML, encode stringifies)
- Round-trip document editing via edit-based mutations
- Streaming/incremental parsing at Lexer, Parser, and Visitor stages

**When to reference this document:**

- When designing or modifying the core parsing/serialization API
- When adding new YAML features or format support
- When integrating with Effect ecosystem libraries
- When debugging YAML processing issues

---

## Current State

### System Components

#### Lexer (Stateful Scanner)

**Location:** `src/utils/lexer.ts`

**Purpose:** Tokenizes raw YAML text into a stream of typed tokens.

**Responsibilities:**

- Character-by-character scanning with indentation tracking
- String escape sequence handling
- Block scalar chomping indicator processing
- Flow indicator detection (`{`, `[`, `,`, `}`, `]`)
- Directive marker recognition (`%YAML`, `%TAG`, `---`, `...`)
- Chunked input support for incremental parsing

**Key interfaces/APIs:**

```typescript
lex(text: string): Stream<YamlToken>
createScanner(): YamlScanner  // chunked input API
```

**Dependencies:**

- Depends on: `YamlToken` schema, `YamlLexError`
- Used by: Parser, `lex()` public API

#### Parser (CST Builder)

**Location:** `src/utils/parser.ts`

**Purpose:** Transforms token stream into a Concrete Syntax Tree that
preserves every character of the original input.

**Responsibilities:**

- Block and flow collection structure recognition
- Indentation-based nesting
- CST node construction with full source spans
- Comment and whitespace preservation

**Key interfaces/APIs:**

```typescript
parseCST(text: string): Stream<CstNode>
```

**Dependencies:**

- Depends on: Lexer, `CstNode` schema, `YamlParseError`
- Used by: Composer, `parseCST()` public API

#### Composer (AST Builder)

**Location:** `src/utils/composer.ts`

**Purpose:** Transforms CST into user-friendly Document with typed AST nodes.

**Responsibilities:**

- Anchor/alias resolution
- Tag resolution via YAML 1.2 Core Schema
- Scalar type coercion (null, bool, int, float, string)
- Error and warning collection
- Multi-document stream handling

**Key interfaces/APIs:**

```typescript
parseDocument(text: string, options?: YamlParseOptions):
  Effect<YamlDocument, YamlLexError | YamlParseError | YamlComposerError>

parseAllDocuments(text: string, options?: YamlParseOptions):
  Effect<ReadonlyArray<YamlDocument>,
         YamlLexError | YamlParseError | YamlComposerError>
```

**Dependencies:**

- Depends on: Parser, AST schemas, `YamlComposerError`
- Used by: `parse()`, `parseDocument()`, `parseAllDocuments()` public APIs

#### Stringify

**Location:** `src/utils/stringify.ts`

**Purpose:** Converts JavaScript values and YamlDocument instances to YAML
text.

**Responsibilities:**

- Value-to-YAML serialization with configurable formatting
- Document-aware stringification preserving style metadata
- Block and flow style selection
- Scalar style selection (plain, quoted, block)

**Key interfaces/APIs:**

```typescript
stringify(value: unknown, options?: YamlStringifyOptions):
  Effect<string, YamlStringifyError>

stringifyDocument(doc: YamlDocument, options?: YamlStringifyOptions):
  Effect<string, YamlStringifyError>
```

#### Format & Modify

**Location:** `src/utils/format.ts`

**Purpose:** Non-destructive YAML formatting and value modification via
computed edits.

**Responsibilities:**

- Indentation normalization
- Style consistency enforcement
- Path-based value insertion, replacement, and removal
- Edit computation in reverse offset order

**Key interfaces/APIs:**

```typescript
format(text: string, range?: YamlRange, options?: YamlFormattingOptions):
  Effect<ReadonlyArray<YamlEdit>, YamlFormatError>

modify(text: string, path: YamlPath, value: unknown,
  options?: YamlFormattingOptions):
  Effect<ReadonlyArray<YamlEdit>, YamlModificationError>

applyEdits(text: string, edits: ReadonlyArray<YamlEdit>):
  Effect<string>
```

#### Visitor

**Location:** `src/utils/visitor.ts`

**Purpose:** SAX-style streaming event API over the composed AST.

**Responsibilities:**

- Lazy event emission (no full AST materialization required)
- 11 event types: `document-start`, `document-end`, `map-start`, `map-end`,
  `seq-start`, `seq-end`, `pair`, `scalar`, `alias`, `comment`, `directive`
- Composable with Effect Stream operations

**Key interfaces/APIs:**

```typescript
visit(text: string, options?: YamlParseOptions):
  Stream<YamlVisitorEvent>

visitCollect<A>(text: string,
  predicate: (event: YamlVisitorEvent) => Option<A>, options?):
  Effect<ReadonlyArray<A>>
```

`YamlVisitorEvent` (Schema.TaggedClass) carries: kind, node (optional),
path (array of string | number), depth.

#### AST Navigation

**Location:** `src/utils/ast.ts`

**Purpose:** Path-based node lookup and traversal helpers.

**Responsibilities:**

- Find nodes by path or offset
- Extract node values via `getNodeValue`
- All functions support `Function.dual` for pipeline composition

**Key interfaces/APIs:**

```typescript
findNode(root: YamlNode, path: YamlPath):
  Effect<Option<YamlNode>, YamlNodeNotFoundError>

findNodeAtOffset(root: YamlNode, offset: number):
  Effect<Option<YamlNode>>

getNodePath(root: YamlNode, offset: number):
  Effect<Option<YamlPath>>

getNodeValue(node: YamlNode):
  Effect<unknown>
```

#### Equality

**Location:** `src/utils/equality.ts`

**Purpose:** Semantic YAML comparison ignoring formatting, comments, and
key order.

**Key interfaces/APIs:**

```typescript
equals(self: string, that: string):
  Effect<boolean, YamlLexError | YamlParseError | YamlComposerError>

equalsValue(self: string, value: unknown):
  Effect<boolean, YamlLexError | YamlParseError | YamlComposerError>
```

Both support `Function.dual` for pipeline composition.

#### Schema Integration

**Location:** `src/utils/schema-integration.ts`

**Purpose:** Bidirectional Effect Schema composition for typed YAML pipelines.

### Architecture Diagram

```text
Input String
    |
    v
+----------+     Stream<YamlToken>
|  Lexer   | --------------------------->
+----------+
    |
    v
+----------+     Stream<CstNode>
|  Parser  | --------------------------->
+----------+
    |
    v
+----------+     Effect<YamlDocument>
| Composer | --------------------------->
+----------+
```

### Current Limitations

- New project: placeholder code from template needs replacing
- Not yet implemented: all components are at design stage

---

## Rationale

### Architectural Decisions

#### Decision 1: Clean-Room Implementation (vs. Port or Wrapper)

**Context:** Need a YAML parser that integrates natively with Effect types.

**Options considered:**

1. **Clean-Room Effect-Native Implementation (Chosen):**
   - Pros: Full control, native Effect types throughout, consistent with
     jsonc-effect zero-dep philosophy, architecture designed for Effect from
     the start
   - Cons: Larger scope, risk of spec non-compliance, longer development
   - Why chosen: Official yaml-test-suite provides compliance validation.
     Existing test cases from eemeli/yaml and the test suite reduce risk.
     jsonc-effect proved this pattern works.

2. **Structural Port of eemeli/yaml:**
   - Pros: Battle-tested algorithms, lower spec-compliance risk
   - Cons: Must deeply understand eemeli/yaml internals, some imperative
     patterns need awkward adaptation
   - Why rejected: Clean-room allows architecture designed for Effect from the
     start rather than adapting imperative code.

3. **Effect Wrapper Around eemeli/yaml:**
   - Pros: Fastest, automatic compliance
   - Cons: Not pure Effect, breaks jsonc-effect pattern, limited streaming
     integration, workspaces-effect already does this ad-hoc
   - Why rejected: Limited value add over status quo.

#### Decision 2: Three-Stage Pipeline (vs. Two-Stage)

**Context:** Need to support round-trip editing with comment/whitespace
preservation.

**Options considered:**

1. **Three-Stage: Lexer -> Parser/CST -> Composer/AST (Chosen):**
   - Pros: CST layer enables round-trip modification, each stage maps to an
     independent Stream transformation, clean separation of concerns
   - Cons: More code than two-stage
   - Why chosen: CST is essential for format/modify operations. Without it,
     whitespace reconstruction is heuristic.

2. **Two-Stage: Scanner -> Parser/AST (like jsonc-effect):**
   - Pros: Simpler
   - Cons: Loses exact source positioning for round-trip editing
   - Why rejected: Cannot support formatting/modification requirements.

#### Decision 3: YAML 1.2 Only (No 1.1 Compatibility)

**Context:** Scope the specification compliance level.

**Decision:** YAML 1.2 Core Schema only. No YAML 1.1 compatibility mode.

**Reasoning:** Primary consumers (pnpm v9+, yarn berry lockfiles) use
1.2-compatible syntax. YAML 1.1 features (`yes`/`no` booleans, `<<` merge
keys) are legacy. Reduces implementation scope significantly.

#### Decision 4: Hybrid Schema.TaggedClass / Schema.Class Model

**Context:** How to represent AST nodes in Effect terms.

**Decision:** `Schema.TaggedClass` for AST nodes (YamlScalar, YamlMap,
YamlSeq, YamlPair, YamlAlias) to enable discriminated union pattern matching.
`Schema.Class` for structural types (YamlDocument, options, error details)
that do not need discrimination.

#### Decision 5: Fine-Grained Error Types

**Context:** Error granularity for the tagged error model.

**Decision:** 8 separate `Data.TaggedError` types: 3 pipeline stage errors
(YamlLexError, YamlParseError, YamlComposerError) plus 5 operation errors
(YamlStringifyError, YamlFormatError, YamlModificationError,
YamlNodeNotFoundError, YamlSchemaError). Maximum type safety and precise
`catchTag` targeting.

#### Decision 6: Bidirectional Schema Integration

**Context:** How Schema encode direction should work.

**Decision:** Encode direction uses `stringify` (not `JSON.stringify`), so
round-tripping through Schema produces valid YAML output. Includes
multi-document support (`YamlAllFromString`) and document-preserving schemas
(`makeYamlDocumentSchema`).

### Design Patterns Used

- **Tagged Error Pattern:** `Data.TaggedError` for all error types with
  `catchTag` discrimination
- **Schema.Class / Schema.TaggedClass:** All data types defined as Effect
  schemas for structural equality and validation
- **Function.dual:** Pipeline-friendly APIs (data-first and data-last)
- **Stream Composition:** Pipeline stages as Stream transformers for
  incremental processing
- **Edit-Based Mutation:** Non-destructive modifications via computed edits
  applied in reverse offset order
- **Mutable Scanner, Pure Everything Else:** Lexer state machine is the only
  mutable module; parser, composer, and all other modules are pure

### Constraints and Trade-offs

- **YAML 1.2 complexity:** The spec is ~200 pages with complex indentation
  rules, multi-line scalars, and flow/block disambiguation. This is
  significantly more complex than JSONC.
- **No parent pointers in AST:** Avoids circular references for
  equality/serialization safety. Traversal via explicit paths adds some API
  complexity.
- **Lazy alias resolution:** YamlAlias stores anchor name, not resolved node.
  Preserves round-trip fidelity but consumers must handle aliases explicitly
  when traversing.

---

## System Architecture

### Source Layout

```text
__tests__/
+-- fixtures/                  # YAML test data, yaml-test-suite cases
+-- utils/                     # Test helpers, matchers, runners
+-- lexer.test.ts
+-- parser.test.ts
+-- composer.test.ts
+-- stringify.test.ts
+-- format.test.ts
+-- visitor.test.ts
+-- equality.test.ts
+-- schema-integration.test.ts
+-- index.test.ts              # Public API integration tests
src/
+-- errors/
|   +-- YamlLexError.ts
|   +-- YamlParseError.ts
|   +-- YamlComposerError.ts
|   +-- YamlStringifyError.ts
|   +-- YamlFormatError.ts
|   +-- YamlModificationError.ts
|   +-- YamlNodeNotFoundError.ts
|   +-- YamlSchemaError.ts
+-- schemas/
|   +-- YamlToken.ts
|   +-- CstNode.ts
|   +-- YamlScalar.ts
|   +-- YamlMap.ts
|   +-- YamlSeq.ts
|   +-- YamlPair.ts
|   +-- YamlAlias.ts
|   +-- YamlDocument.ts
|   +-- YamlParseOptions.ts
|   +-- YamlStringifyOptions.ts
|   +-- YamlFormattingOptions.ts
+-- utils/
|   +-- lexer.ts
|   +-- parser.ts
|   +-- composer.ts
|   +-- stringify.ts
|   +-- format.ts
|   +-- ast.ts
|   +-- visitor.ts
|   +-- equality.ts
|   +-- equality.ts
|   +-- schema-integration.ts
+-- index.ts
```

### Component Interactions

The pipeline stages compose linearly: Lexer feeds Parser, Parser feeds
Composer. Each stage can be accessed independently via public API for
consumers who need lower-level access.

The formatter and modifier operate on raw text plus CST, bypassing the
Composer for round-trip fidelity. The visitor operates on composed AST.

Schema integration wraps the full pipeline (Lexer + Parser + Composer) into
`Schema.transformOrFail` for bidirectional typed parsing.

### Error Handling Strategy

Errors propagate through the Effect error channel using 8 tagged error types.
Each pipeline stage defines its own error type with an array of
`YamlErrorDetail` entries containing position information (offset, length,
line, column) and a domain-specific error code.

There are two categories of errors:

- **Recoverable errors:** Accumulated in the Document's `errors` and
  `warnings` arrays during parsing. The parser continues past these,
  producing a best-effort Document. Examples: duplicate keys, unresolved
  tags, spec-mandated warnings.
- **Fatal errors:** Surfaced via the Effect error channel (the tagged error
  types). These occur when the input is too malformed to produce any
  meaningful Document. Examples: completely invalid YAML structure,
  unterminated flow collections at top level.

Consumers use `Effect.catchTag` or `Effect.catchTags` for precise error
handling. Schema integration maps YAML errors into `ParseResult.Type` for
natural composition with other Schema transformations.

---

## Data Flow

### Token Model

22 token kinds as string literals:

`document-start`, `document-end`, `directive`, `tag`, `anchor`, `alias`,
`scalar`, `block-map-start`, `block-map-key`, `block-map-value`,
`block-seq-start`, `block-seq-entry`, `flow-map-start`, `flow-map-end`,
`flow-seq-start`, `flow-seq-end`, `flow-separator`, `newline`, `whitespace`,
`comment`, `byte-order-mark`, `error`

Each `YamlToken` (Schema.Class) carries: kind, value, offset, length, line,
column.

### CST Model

15 CST node types preserving full source text:

- `document` — Top-level document container (children: directives, content)
- `directive` — `%YAML` or `%TAG` directive line
- `comment` — Comment text (from `#` to end of line)
- `block-map` — Block-style mapping (children: key-value entries)
- `block-seq` — Block-style sequence (children: entries)
- `flow-map` — Flow-style mapping `{ ... }` (children: key-value entries)
- `flow-seq` — Flow-style sequence `[ ... ]` (children: entries)
- `block-scalar` — Literal `|` or folded `>` block scalar with header
- `flow-scalar` — Plain, single-quoted, or double-quoted scalar
- `alias` — Alias reference `*name`
- `anchor` — Anchor definition `&name`
- `tag` — Tag indicator `!`, `!!`, or `!<verbatim>`
- `whitespace` — Significant whitespace (indentation, spacing)
- `newline` — Line break characters
- `error` — Unrecognized or malformed content

Each CstNode (Schema.Class) carries: type, source (raw text span), offset,
length, children (via `Schema.suspend` for recursion). No interpretation
occurs at the CST level — `true` is still the string `"true"`.

### AST Model

5 tagged AST node types forming a discriminated union:

- **YamlScalar** (Schema.TaggedClass): value, tag, style (5 variants),
  anchor, comment, offset, length
- **YamlPair** (Schema.TaggedClass): key (YamlNode), value
  (YamlNode | null), comment
- **YamlMap** (Schema.TaggedClass): items (YamlPair[]), tag, anchor, style
  (block/flow), comment, offset, length
- **YamlSeq** (Schema.TaggedClass): items (YamlNode[]), tag, anchor, style
  (block/flow), comment, offset, length
- **YamlAlias** (Schema.TaggedClass): name, offset, length

**YamlNode** = Union of YamlScalar, YamlMap, YamlSeq, YamlAlias

**YamlDocument** (Schema.Class): contents (YamlNode | null), errors,
warnings, directives, comment

**YamlDirective** (Schema.Class): name (`"YAML"` | `"TAG"`), parameters
(ReadonlyArray of string)

### Shared Types

**YamlPath** = `ReadonlyArray<string | number>` — Path into a YAML
structure. Strings are mapping keys, numbers are sequence indices.

**YamlRange** (Schema.Class): offset (number), length (number) — A span
within the source text for partial formatting.

**YamlEdit** (Schema.Class): offset (number), length (number), content
(string) — A text replacement. Applied in reverse offset order to preserve
position validity.

### Error Model

**YamlErrorDetail** (Schema.Class): code, message, offset, length, line,
column

**Error code unions** scoped per stage:

- Lex: UnexpectedCharacter, UnterminatedString, InvalidEscapeSequence,
  InvalidUnicode, UnterminatedBlockScalar, UnterminatedFlowCollection,
  InvalidDirective, InvalidTagHandle, InvalidAnchorName,
  UnexpectedByteOrderMark
- Parse: InvalidIndentation, DuplicateKey, UnexpectedToken, MissingValue,
  MissingKey, TabIndentation, InvalidBlockStructure,
  MalformedFlowCollection
- Composer: UndefinedAlias, DuplicateAnchor, CircularAlias, UnresolvedTag,
  InvalidTagValue, AliasCountExceeded

### Data Flow Diagrams

**Parse flow:**

```text
YAML string -> Lexer -> Stream<YamlToken>
  -> Parser -> Stream<CstNode>
  -> Composer -> Effect<YamlDocument>
  -> getNodeValue -> unknown
```

**Schema decode flow:**

```text
YAML string
  -> Schema.transformOrFail (parse)
  -> unknown
  -> Schema.compose(targetSchema)
  -> Typed value A
```

**Schema encode flow:**

```text
Typed value A
  -> targetSchema.encode
  -> unknown
  -> stringify
  -> YAML string
```

**Modification flow:**

```text
YAML string + path + value
  -> parse to CST
  -> compute YamlEdit[]
  -> apply edits (reverse offset order)
  -> modified YAML string
```

### Options Schemas

**YamlParseOptions** (Schema.Class): Controls parsing behavior.

- `strict` (boolean, default true) — Fail on spec violations vs. best-effort
- `maxAliasCount` (number, default 100) — Limit alias expansion to prevent
  DoS
- `uniqueKeys` (boolean, default true) — Error on duplicate mapping keys

**YamlStringifyOptions** (Schema.Class): Controls stringify output.

- `indent` (number, default 2) — Indentation width
- `lineWidth` (number, default 80) — Preferred line width for wrapping
- `defaultScalarStyle` (ScalarStyle, default "plain") — Default scalar
  presentation
- `defaultCollectionStyle` (CollectionStyle, default "block") — Default
  collection presentation
- `sortKeys` (boolean, default false) — Sort mapping keys alphabetically
- `finalNewline` (boolean, default true) — Ensure trailing newline

**YamlFormattingOptions** extends YamlStringifyOptions with:

- `preserveComments` (boolean, default true) — Retain comments during format
- `range` (optional YamlRange) — Format only a specific text range

### Dependency Strategy

The `effect` package is declared as a `peerDependency` to avoid version
conflicts when consumers use Effect in their own code. The library has zero
runtime `dependencies`. Platform independence is maintained: no `node:`
imports anywhere. The library runs in any ES module environment.

### State Management

The Lexer is the only stateful component (character cursor, indentation
stack, flow context tracking). All other components are pure functions wrapped
in `Effect.sync` or `Stream` transformers.

---

## Integration Points

### Internal Integrations

- **Effect Schema:** Bidirectional `Schema<A, string>` via
  `Schema.transformOrFail`. Errors mapped to `ParseResult.Type`. Pre-built
  schemas: `YamlFromString`, `YamlAllFromString`, `makeYamlSchema`,
  `makeYamlDocumentSchema`.
- **Effect Stream:** Lexer, Parser, and Visitor expose `Stream` APIs for
  incremental processing.
- **Effect Data:** `Data.TaggedError` for all error types,
  `Schema.TaggedClass` for AST nodes.
- **Function.dual:** AST navigation and equality functions support both
  data-first and data-last calling.

### External Integrations

- **yaml-test-suite:** Official YAML compliance test suite (~300+ cases) for
  validation.
- **@spencerbeggs/workspaces-effect:** Primary consumer. Replaces `yaml` npm
  dependency for lockfile parsing. Eliminates brittle regex-based
  pnpm-workspace.yaml parser.
- **@spencerbeggs/jsonc-effect:** Sister module. Shares architectural
  patterns, conventions, and API design philosophy.

---

## Testing Strategy

### Unit Tests

**Location:** `__tests__/*.test.ts` (segregated from source)

**Shared infrastructure:** `__tests__/fixtures/` for YAML test data,
`__tests__/utils/` for helpers and runners.

**Coverage target:** 90%+

**What to test:**

- Lexer token emission for all 22 token kinds
- Parser CST construction for block and flow structures
- Composer tag resolution and anchor/alias handling
- Stringify output for all scalar and collection styles
- Formatter indentation and style normalization
- Modifier path-based insertion, replacement, removal
- Error construction, codes, and positional accuracy
- Schema integration roundtrips
- Equality with formatting/comment/key-order differences
- Edge cases: empty documents, multi-document streams, deeply nested structures

### Integration Tests

**Location:** `src/index.test.ts`

**Strategy:**

- Full pipeline roundtrip tests: parse -> stringify -> parse -> equals
- yaml-test-suite compliance validation (~300+ cases)
- Real-world YAML files: pnpm-lock.yaml, yarn.lock, pnpm-workspace.yaml
- Schema composition with complex target schemas
- Streaming API consumption patterns

---

## Future Enhancements

### Phase 1: Core (Initial Release)

- Lexer, Parser, Composer pipeline
- parse/stringify/parseDocument/parseAllDocuments
- AST navigation (findNode, findNodeAtOffset, getNodePath, getNodeValue)
- All 8 error types with positional details
- Schema integration (YamlFromString, makeYamlSchema, bidirectional)
- Type guards (isScalar, isMap, isSeq, isPair, isAlias)
- yaml-test-suite compliance

### Phase 2: Streaming & Visitor

- Stream-based lex/parseCST/visit APIs
- visitCollect convenience function
- Chunked/incremental parsing (createScanner)
- YamlAllFromString and makeYamlDocumentSchema

### Phase 3: Formatting & Modification

- format/formatAndApply with YamlFormattingOptions
- modify with path-based edits
- applyEdits with reverse offset ordering
- equals/equalsValue semantic comparison
- stripComments utility

---

## Related Documentation

**Package Documentation:**

- `README.md` - Package overview

**Sister Module:**

- [@spencerbeggs/jsonc-effect](https://github.com/spencerbeggs/jsonc-effect) -
  Architectural reference and pattern blueprint

**External Resources:**

- [YAML 1.2.2 Specification](https://yaml.org/spec/1.2.2/)
- [yaml-test-suite](https://github.com/yaml/yaml-test-suite)
- [Effect Documentation](https://effect.website/)
- [eemeli/yaml](https://github.com/eemeli/yaml) - Reference implementation

---

**Document Status:** Draft. Design approved, ready for implementation
planning.
