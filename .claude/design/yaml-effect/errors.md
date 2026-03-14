---
title: Errors
description: Error taxonomy, tagged error pattern, and error handling.
status: current
module: yaml-effect
category: architecture
created: 2026-03-14
updated: 2026-03-14
last-synced: 2026-03-14
completeness: 85
related:
  - architecture.md
  - parsing.md
  - stringify.md
  - format-modify.md
dependencies: []
---

Directory: `src/errors/`

## Error Pattern

Every error is a `Data.TaggedError` subclass with a `_tag` string
discriminant. This enables `Effect.catchTag` dispatching:

```typescript
parse(yaml).pipe(
  Effect.catchTag("YamlComposerError", (e) => /* handle */),
)
```

### The `*Base` Pattern

Each error exports both a `*Base` constant and a concrete class:

```typescript
export const YamlComposerErrorBase = Data.TaggedError("YamlComposerError");
export class YamlComposerError extends YamlComposerErrorBase<{ ... }> { }
```

The base is exported as `@internal`. This exists because `Data.TaggedError`
produces complex intersection types with branded generics that api-extractor
cannot roll up into a single `.d.ts` bundle. The concrete class extends the
base with typed fields, giving api-extractor a simple class declaration.

## Error Types

### YamlLexError

Tag: `"YamlLexError"`. Raised when lexing encounters tokenization errors.

Fields:

- `errors: ReadonlyArray<YamlErrorDetail>` -- positioned error details
- `text: string` -- full source text

### YamlParseError

Tag: `"YamlParseError"`. Raised when parsing encounters structural errors.

Fields:

- `errors: ReadonlyArray<YamlErrorDetail>`
- `text: string`

### YamlComposerError

Tag: `"YamlComposerError"`. Raised when composition encounters semantic
errors (undefined aliases, duplicate anchors, unresolved tags, etc.).

Fields:

- `errors: ReadonlyArray<YamlErrorDetail>`
- `text: string`

### YamlStringifyError

Tag: `"YamlStringifyError"`. Raised when stringification fails (circular
references, etc.).

Fields:

- `value: unknown` -- the value that could not be stringified
- `reason: string`

### YamlFormatError

Tag: `"YamlFormatError"`. Raised when formatting fails (unparseable input).

Fields:

- `text: string` -- the input that could not be formatted
- `reason: string`

### YamlModificationError

Tag: `"YamlModificationError"`. Raised when path-based modification fails
(invalid path, empty document, etc.).

Fields:

- `path: ReadonlyArray<string | number>` -- the path that was attempted
- `reason: string`

### YamlNodeNotFoundError

Tag: `"YamlNodeNotFoundError"`. Raised when AST navigation fails to find a
node.

Fields:

- `path: ReadonlyArray<string | number>`
- `rootNodeType: string`

### YamlSchemaError

Tag: `"YamlSchemaError"`. Raised when Schema validation fails.

Fields:

- `text: string`
- `cause: unknown`

## YamlError Union

```typescript
type YamlError =
  | YamlLexError
  | YamlParseError
  | YamlComposerError
  | YamlStringifyError
  | YamlFormatError
  | YamlModificationError
  | YamlNodeNotFoundError
  | YamlSchemaError;
```

## YamlErrorDetail

A Schema class for individual error details within multi-error types:

```typescript
class YamlErrorDetail extends Schema.Class("YamlErrorDetail")({
  code: YamlErrorCode,
  message: Schema.String,
  offset: Schema.Int.pipe(Schema.nonNegative()),
  length: Schema.Int.pipe(Schema.nonNegative()),
  line: Schema.Int.pipe(Schema.nonNegative()),
  column: Schema.Int.pipe(Schema.nonNegative()),
})
```

## Error Codes

### YamlLexErrorCode

`UnexpectedCharacter`, `UnterminatedString`, `InvalidEscapeSequence`,
`InvalidUnicode`, `UnterminatedBlockScalar`, `UnterminatedFlowCollection`,
`InvalidDirective`, `InvalidTagHandle`, `InvalidAnchorName`,
`UnexpectedByteOrderMark`.

### YamlParseErrorCode

`InvalidIndentation`, `DuplicateKey`, `UnexpectedToken`, `MissingValue`,
`MissingKey`, `TabIndentation`, `InvalidBlockStructure`,
`MalformedFlowCollection`.

### YamlComposerErrorCode

`UndefinedAlias`, `DuplicateAnchor`, `CircularAlias`, `UnresolvedTag`,
`InvalidTagValue`, `AliasCountExceeded`.

## Error-to-Function Mapping

| Function(s) | Error Type |
| ----------- | ---------- |
| `lex` | Errors embedded as `"error"` tokens (never fails) |
| `parseCST` | Never fails |
| `parse`, `parseDocument`, `parseAllDocuments` | `YamlComposerError` |
| `stringify`, `stringifyDocument` | `YamlStringifyError` |
| `format`, `formatAndApply`, `stripComments` | `YamlFormatError` |
| `modify`, `modifyAndApply` | `YamlModificationError` |
| `applyEdits` | `never` (pure text operation) |
| `equals`, `equalsValue` | `YamlComposerError` |
| `visit`, `visitCollect` | `YamlComposerError` |
| `visitCST`, `visitCSTCollect` | `never` |
| `findNode`, `findNodeAtOffset`, `getNodePath` | `never` (returns Option) |
| Schema decode/encode | `ParseResult.Type` (wraps original error message) |
