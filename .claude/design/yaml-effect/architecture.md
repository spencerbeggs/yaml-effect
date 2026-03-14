---
title: Architecture
description: Overall architecture, pipeline stages, Effect integration, and module layout.
---

## Overview

`@spencerbeggs/yaml-effect` is a YAML 1.2 parser, stringifier, and toolkit
built entirely on the Effect ecosystem. It provides a complete YAML processing
pipeline with typed errors, streaming APIs, and Effect Schema integration.

The library has its own YAML implementation -- it does NOT depend on
`eemeli/yaml` or any other YAML library at runtime. The only runtime
dependency is `effect`.

## Pipeline Stages

YAML processing follows a four-stage pipeline:

```text
Text --> Lex --> Parse --> Compose --> AST
         |         |          |
     YamlToken  CstNode  YamlDocument
```

### 1. Lexer (`src/utils/lexer.ts`)

Tokenizes raw YAML text into a stream of `YamlToken` values. This is the
only mutable module in the pipeline -- the scanner uses imperative
character-by-character scanning with position tracking.

Two APIs:

- `lex(text)` -- returns an Effect `Stream<YamlToken, never>` (push-based)
- `createScanner(text)` -- returns a `YamlScanner` interface (pull-based,
  imperative, synchronous)

Both share the same scanning logic. Lexer errors are embedded as `"error"`
kind tokens rather than stream failures.

### 2. Parser (`src/utils/parser.ts`)

Transforms the token stream into a Concrete Syntax Tree (CST). The CST
preserves every character of the original input including whitespace,
comments, and structural indicators. No value interpretation occurs.

- `parseCST(text)` -- returns `Stream<CstNode, never>`
- `parseCSTAll(text)` -- returns `Effect<CstNode[]>`

Implemented as a recursive descent parser over the collected token array.

### 3. Composer (`src/utils/composer.ts`)

Transforms CST nodes into AST nodes with typed values. Implements YAML 1.2
Core Schema type resolution (spec chapter 10.3.2):

- Null: `null`, `Null`, `NULL`, `~`
- Boolean: `true`/`false` (case variants)
- Integer: decimal, octal (`0o`), hex (`0x`)
- Float: decimal, `.inf`, `.nan`
- String: everything else

Produces `YamlDocument` instances containing the root `YamlNode` tree.

Public API:

- `parse(text, options?)` -- returns `Effect<unknown, YamlComposerError>`
- `parseDocument(text, options?)` -- returns
  `Effect<YamlDocument, YamlComposerError>`
- `parseAllDocuments(text, options?)` -- returns
  `Effect<YamlDocument[], YamlComposerError>`

### 4. Stringify (`src/utils/stringify.ts`)

Converts JavaScript values and AST nodes back to YAML text. Supports
configurable formatting with block/flow styles, scalar quoting rules, key
sorting, and round-trip preservation of AST node styles.

- `stringify(value, options?)` -- JS value to YAML string
- `stringifyDocument(doc, options?)` -- `YamlDocument` AST to YAML string

## Module Layout

```text
src/
  index.ts                    -- Public API barrel export
  errors/
    index.ts                  -- Error barrel export + YamlError union type
    YamlComposerError.ts      -- Composition errors (aliases, tags)
    YamlErrorDetail.ts        -- Error detail schema + error code enums
    YamlFormatError.ts        -- Formatting errors
    YamlLexError.ts           -- Lexer errors
    YamlModificationError.ts  -- Path modification errors
    YamlNodeNotFoundError.ts  -- AST navigation errors
    YamlParseError.ts         -- Parser errors
    YamlSchemaError.ts        -- Schema validation errors
    YamlStringifyError.ts     -- Stringify errors
  schemas/
    CstNode.ts                -- CST node schema (15 node types)
    YamlAstNodes.ts           -- AST node schemas (Scalar, Map, Seq, Pair, Alias)
    YamlCstVisitorEvent.ts    -- 13 CST visitor event schemas
    YamlDocument.ts           -- Document + Directive schemas
    YamlFormattingOptions.ts  -- Formatting options schema
    YamlParseOptions.ts       -- Parse options schema
    YamlShared.ts             -- ScalarStyle, CollectionStyle, YamlEdit, etc.
    YamlStringifyOptions.ts   -- Stringify options schema
    YamlToken.ts              -- Token schema (22 token kinds)
    YamlVisitorEvent.ts       -- 11 AST visitor event schemas
  utils/
    ast.ts                    -- AST navigation (findNode, findNodeAtOffset, etc.)
    composer.ts               -- CST-to-AST composer + type resolution
    cst-visitor.ts            -- CST visitor (visitCST, visitCSTCollect)
    equality.ts               -- equals, equalsValue
    format.ts                 -- format, modify, applyEdits, stripComments
    lexer.ts                  -- Lexer + scanner (lex, createScanner)
    parser.ts                 -- CST parser (parseCST, parseCSTAll)
    schema-integration.ts     -- Effect Schema bridges (YamlFromString, etc.)
    stringify.ts              -- Stringifier (stringify, stringifyDocument)
    visitor.ts                -- AST visitor (visit, visitCollect)
```

## Effect Integration Patterns

### Error Model

Every error is a `Data.TaggedError` subclass with a `_tag` discriminant for
`Effect.catchTag` dispatching. See [errors.md](./errors.md) for the full
taxonomy.

The `*Base` pattern (e.g., `YamlComposerErrorBase`) exists because
`Data.TaggedError` produces complex intersection types that api-extractor
cannot roll up. The base is exported as `@internal`, and the concrete class
extends it with typed fields.

### Fn.dual Calling Convention

Functions that operate on data support both direct and pipeline styles via
`Fn.dual`:

```typescript
// Direct
equals("a: 1", "a: 1")

// Pipeline
pipe("a: 1", equals("a: 1"))
```

Functions using `Fn.dual(2, ...)`: `applyEdits`, `equals`, `equalsValue`,
`findNode`, `findNodeAtOffset`, `getNodePath`.

Functions using `Fn.dual(3, ...)`: `modify`, `modifyAndApply`.

Functions NOT using dual (text is always the primary input): `format`,
`formatAndApply`, `stripComments`, `stringify`, `parse`, etc.

### Stream APIs

The lexer and both visitors return Effect `Stream` values for lazy,
composable processing:

- `lex(text)` -- `Stream<YamlToken, never>`
- `parseCST(text)` -- `Stream<CstNode, never>`
- `visit(text)` -- `Stream<YamlVisitorEvent, YamlComposerError>`
- `visitCST(text)` -- `Stream<YamlCstVisitorEvent, never>`

Streams support early termination via `Stream.take` / `Stream.takeWhile`.

### Schema.Class and Schema.TaggedClass

All data structures are defined as `Schema.Class` or `Schema.TaggedClass`
instances, providing built-in encode/decode, structural equality, and
type-safe construction. AST nodes use `Schema.TaggedClass` for discriminated
union support via the `_tag` field. Options classes use `Schema.Class` with
`Schema.optionalWith` for defaults.

## Architectural Decisions

### Decision 1: Clean-Room Implementation (vs. Port or Wrapper)

**Context:** Need a YAML parser that integrates natively with Effect types.

**Chosen:** Clean-room Effect-native implementation. Official yaml-test-suite
provides compliance validation. jsonc-effect proved this zero-dep pattern
works. Alternatives (structural port of eemeli/yaml, or wrapper around it)
were rejected because clean-room allows architecture designed for Effect from
the start.

### Decision 2: Three-Stage Pipeline (vs. Two-Stage)

**Context:** Need to support round-trip editing with comment/whitespace
preservation.

**Chosen:** Lexer -> Parser/CST -> Composer/AST. The CST layer is essential
for format/modify operations. Without it, whitespace reconstruction is
heuristic. A two-stage scanner->AST approach (like jsonc-effect) cannot
support formatting/modification requirements.

### Decision 3: YAML 1.2 Only (No 1.1 Compatibility)

YAML 1.2 Core Schema only. No YAML 1.1 compatibility mode. Primary consumers
(pnpm v9+, yarn berry lockfiles) use 1.2-compatible syntax. YAML 1.1 features
(`yes`/`no` booleans, `<<` merge keys) are legacy.

### Decision 4: Hybrid Schema.TaggedClass / Schema.Class Model

`Schema.TaggedClass` for AST nodes (YamlScalar, YamlMap, YamlSeq, YamlPair,
YamlAlias) to enable discriminated union pattern matching. `Schema.Class` for
structural types (YamlDocument, options, error details) that do not need
discrimination.

### Decision 5: Fine-Grained Error Types

8 separate `Data.TaggedError` types: 3 pipeline stage errors (YamlLexError,
YamlParseError, YamlComposerError) plus 5 operation errors
(YamlStringifyError, YamlFormatError, YamlModificationError,
YamlNodeNotFoundError, YamlSchemaError). Maximum type safety and precise
`catchTag` targeting.

### Decision 6: Bidirectional Schema Integration

Encode direction uses `stringify` (not `JSON.stringify`), so round-tripping
through Schema produces valid YAML output. Includes multi-document support
(`YamlAllFromString`) and document-preserving schemas
(`makeYamlDocumentSchema`).

## Design Patterns

- **Tagged Error Pattern:** `Data.TaggedError` with `catchTag` discrimination
- **Schema.Class / Schema.TaggedClass:** Effect schemas for structural
  equality and validation
- **Function.dual:** Pipeline-friendly APIs (data-first and data-last)
- **Stream Composition:** Pipeline stages as Stream transformers
- **Edit-Based Mutation:** Non-destructive modifications via computed edits
  applied in reverse offset order
- **Mutable Scanner, Pure Everything Else:** Lexer state machine is the only
  mutable module

## Constraints and Trade-offs

- **YAML 1.2 complexity:** ~200 pages spec with complex indentation rules,
  multi-line scalars, and flow/block disambiguation
- **No parent pointers in AST:** Avoids circular references for
  equality/serialization safety
- **Lazy alias resolution:** YamlAlias stores anchor name, not resolved node.
  Preserves round-trip fidelity but consumers must handle aliases explicitly
