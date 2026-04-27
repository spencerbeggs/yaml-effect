# Errors

All `yaml-effect` functions return `Effect` values with typed error channels.
Errors are structured using `Data.TaggedError` from the Effect library, enabling
precise error handling with `Effect.catchTag`.

## Error Taxonomy

| Error Type | Tag | Raised By |
| ---------- | --- | --------- |
| `YamlLexError` | `"YamlLexError"` | Lexer stage (tokenization) |
| `YamlParseError` | `"YamlParseError"` | CST parser stage |
| `YamlComposerError` | `"YamlComposerError"` | `parse`, `parseDocument`, `parseAllDocuments` |
| `YamlStringifyError` | `"YamlStringifyError"` | `stringify`, `stringifyDocument` |
| `YamlFormatError` | `"YamlFormatError"` | `format`, `formatAndApply`, `stripComments` |
| `YamlModificationError` | `"YamlModificationError"` | `modify`, `modifyAndApply` |
| `YamlNodeNotFoundError` | `"YamlNodeNotFoundError"` | AST navigation functions |
| `YamlSchemaError` | `"YamlSchemaError"` | Schema validation |

## The `YamlError` Union Type

The `YamlError` type is a union of all eight error types. Use it when you want
to handle any YAML error generically.

```typescript
import type { YamlError } from "yaml-effect";
```

## `YamlErrorDetail`

Parse-stage errors (`YamlLexError`, `YamlParseError`, `YamlComposerError`)
carry an `errors` array of `YamlErrorDetail` instances with precise position
information.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `code` | `YamlErrorCode` | Error code identifying the kind |
| `message` | `string` | Human-readable description |
| `offset` | `number` | Zero-based character offset |
| `length` | `number` | Character length of the problematic span |
| `line` | `number` | Zero-based line number |
| `column` | `number` | Zero-based column within the line |

## Error Codes by Stage

### Lex Error Codes

| Code | Description |
| ---- | ----------- |
| `UnexpectedCharacter` | Unexpected character in input |
| `UnterminatedString` | String literal not closed |
| `InvalidEscapeSequence` | Invalid escape in double-quoted string |
| `InvalidUnicode` | Invalid Unicode escape sequence |
| `UnterminatedBlockScalar` | Block scalar not properly terminated |
| `UnterminatedFlowCollection` | Flow collection (`{`, `[`) not closed |
| `InvalidDirective` | Malformed YAML directive |
| `InvalidTagHandle` | Invalid tag handle syntax |
| `InvalidAnchorName` | Invalid anchor name |
| `UnexpectedByteOrderMark` | BOM in unexpected position |

### Parse Error Codes

| Code | Description |
| ---- | ----------- |
| `InvalidIndentation` | Incorrect indentation level |
| `DuplicateKey` | Duplicate key in a mapping |
| `UnexpectedToken` | Token not valid in this context |
| `MissingValue` | Expected value not found |
| `MissingKey` | Expected key not found |
| `TabIndentation` | Tab used for indentation (YAML 1.2 forbids this) |
| `InvalidBlockStructure` | Block structure is malformed |
| `MalformedFlowCollection` | Flow collection syntax error |

### Composer Error Codes

| Code | Description |
| ---- | ----------- |
| `UndefinedAlias` | Alias references a non-existent anchor |
| `DuplicateAnchor` | Two anchors share the same name |
| `CircularAlias` | Alias chain forms a cycle |
| `UnresolvedTag` | Explicit tag cannot be resolved |
| `InvalidTagValue` | Value does not match its explicit tag |
| `AliasCountExceeded` | Alias count exceeds `maxAliasCount` |
| `InvalidIndentation` | Key column or block-seq position violates indentation rules |
| `TabIndentation` | Tab used for indentation (YAML 1.2 forbids this) |
| `UnexpectedToken` | Mapping starts on the document-start (`---`) line, or other structural violation |

## Handling Errors with `Effect.catchTag`

Each error type has a unique `_tag` field, enabling precise pattern matching.

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = parse("a: *undefined_alias").pipe(
  Effect.catchTag("YamlComposerError", (error) => {
    for (const detail of error.errors) {
      console.error(
        `[${detail.code}] ${detail.message} at ${detail.line}:${detail.column}`
      );
    }
    return Effect.succeed(null);
  })
);

Effect.runSync(program);
```

### Handling Multiple Error Types

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const program = modifyAndApply("name: John\n", ["address", "street"], "Main St").pipe(
  Effect.catchTag("YamlModificationError", (error) => {
    console.error(`Modification failed at [${error.path.join(", ")}]`);
    console.error(`Reason: ${error.reason}`);
    return Effect.succeed("name: John\n");
  })
);

Effect.runSync(program);
```

## Inspecting Errors with `Effect.either`

Use `Effect.either` to convert the error channel into an `Either` value for
inspection without crashing.

```typescript
import { Effect, Either } from "effect";
import { parse } from "yaml-effect";

const program = Effect.gen(function* () {
  const result = yield* Effect.either(parse("invalid: [unclosed"));

  if (Either.isLeft(result)) {
    const error = result.left;
    console.error("Parse failed:", error.message);
    console.error("Error count:", error.errors.length);
    for (const detail of error.errors) {
      console.error(`  [${detail.code}] ${detail.message}`);
    }
  } else {
    console.log("Parsed:", result.right);
  }
});

Effect.runSync(program);
```

## Error Type Details

### `YamlLexError`

Raised when tokenization encounters errors (unterminated strings, invalid
escapes).

| Field | Type | Description |
| ----- | ---- | ----------- |
| `errors` | `ReadonlyArray<YamlErrorDetail>` | Position-annotated error details |
| `text` | `string` | The full source text |

### `YamlParseError`

Raised when CST parsing encounters structural errors (invalid indentation,
malformed flow collections).

| Field | Type | Description |
| ----- | ---- | ----------- |
| `errors` | `ReadonlyArray<YamlErrorDetail>` | Position-annotated error details |
| `text` | `string` | The full source text |

### `YamlComposerError`

Raised when AST composition encounters semantic errors (undefined aliases,
duplicate anchors, alias count exceeded) or structural-validation errors
detected during composition (key-column indentation mismatches, block-seq
in key position, mapping content on the document-start line).

| Field | Type | Description |
| ----- | ---- | ----------- |
| `errors` | `ReadonlyArray<YamlErrorDetail>` | Position-annotated error details |
| `text` | `string` | The full source text |

### `YamlStringifyError`

Raised when stringification fails (circular references).

| Field | Type | Description |
| ----- | ---- | ----------- |
| `value` | `unknown` | The value that could not be stringified |
| `reason` | `string` | Human-readable failure explanation |

### `YamlFormatError`

Raised when formatting fails (malformed input YAML).

| Field | Type | Description |
| ----- | ---- | ----------- |
| `text` | `string` | The input text that could not be formatted |
| `reason` | `string` | Human-readable failure explanation |

### `YamlModificationError`

Raised when a path-based modification fails (path not found, invalid index).

| Field | Type | Description |
| ----- | ---- | ----------- |
| `path` | `ReadonlyArray<string or number>` | The path where modification was attempted |
| `reason` | `string` | Human-readable failure explanation |

### `YamlNodeNotFoundError`

Raised when AST navigation fails to find a node at the given path.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `path` | `ReadonlyArray<string or number>` | The path that was searched |
| `rootNodeType` | `string` | The type of the root node |

### `YamlSchemaError`

Raised when Schema-based YAML validation fails.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `text` | `string` | The YAML text that failed validation |
| `cause` | `unknown` | The underlying validation failure |
