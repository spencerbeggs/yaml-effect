# Parsing

`yaml-effect` provides three parsing functions at different levels of
abstraction. All implement YAML 1.2 Core Schema type resolution.

## `parse(text, options?)`

Parses a YAML string and returns the first document as a plain JavaScript value.
Anchors and aliases are fully resolved.

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = Effect.gen(function* () {
  const value = yield* parse("name: Alice\nage: 30");
  console.log(value);
  // { name: "Alice", age: 30 }
});

Effect.runSync(program);
```

**Signature:**

```typescript
function parse(
  text: string,
  options?: Partial<YamlParseOptions>
): Effect.Effect<unknown, YamlComposerError>
```

## `parseDocument(text, options?)`

Parses a YAML string into a `YamlDocument` AST node. The AST preserves style
metadata, comments, anchors, tags, and source positions -- everything needed
for round-trip processing.

```typescript
import type { YamlNode } from "yaml-effect";
import { Effect } from "effect";
import { isMap, isScalar, parseDocument } from "yaml-effect";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument("name: Alice\nage: 30");

  const root: YamlNode | null = doc.contents;
  if (root && isMap(root)) {
    for (const pair of root.items) {
      if (isScalar(pair.key)) {
        console.log(pair.key.value, pair.key.style);
      }
    }
  }

  console.log(doc.errors.length);   // 0
  console.log(doc.warnings.length); // 0
});

Effect.runSync(program);
```

**Signature:**

```typescript
function parseDocument(
  text: string,
  options?: Partial<YamlParseOptions>
): Effect.Effect<YamlDocument, YamlComposerError>
```

### `YamlDocument` Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `contents` | `YamlNode` or `null` | Root AST node, or `null` for empty documents |
| `errors` | `ReadonlyArray<YamlErrorDetail>` | Parse errors with position info |
| `warnings` | `ReadonlyArray<YamlErrorDetail>` | Non-fatal warnings |
| `directives` | `ReadonlyArray<YamlDirective>` | YAML directives (e.g., `%YAML 1.2`) |
| `comment` | `string` or `undefined` | Document-level comment text |

## `parseAllDocuments(text, options?)`

Parses a multi-document YAML stream (documents separated by `---`) into an
array of `YamlDocument` instances.

```typescript
import { Effect } from "effect";
import { parseAllDocuments } from "yaml-effect";

const multiDoc = `
---
name: Alice
age: 30
---
name: Bob
age: 25
`;

const program = Effect.gen(function* () {
  const docs = yield* parseAllDocuments(multiDoc);
  console.log(docs.length); // 2
});

Effect.runSync(program);
```

**Signature:**

```typescript
function parseAllDocuments(
  text: string,
  options?: Partial<YamlParseOptions>
): Effect.Effect<ReadonlyArray<YamlDocument>, YamlComposerError>
```

## `YamlParseOptions`

Control parsing behavior with these options.

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `strict` | `boolean` | `true` | Treat parse errors as failures |
| `maxAliasCount` | `number` | `100` | Maximum alias nodes per document (DoS protection) |
| `uniqueKeys` | `boolean` | `true` | Treat duplicate mapping keys as errors |

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = Effect.gen(function* () {
  // Allow duplicate keys (last value wins)
  const value = yield* parse("a: 1\na: 2", { uniqueKeys: false });
  console.log(value); // { a: 2 }
});

Effect.runSync(program);
```

## YAML 1.2 Core Schema Type Resolution

Plain scalars are resolved according to the YAML 1.2 Core Schema
(spec section 10.3.2).

### Null Values

| YAML | JavaScript |
| ---- | ---------- |
| `null` | `null` |
| `Null` | `null` |
| `NULL` | `null` |
| `~` | `null` |
| (empty) | `null` |

### Boolean Values

| YAML | JavaScript |
| ---- | ---------- |
| `true`, `True`, `TRUE` | `true` |
| `false`, `False`, `FALSE` | `false` |

### Integer Values

| YAML | JavaScript |
| ---- | ---------- |
| `42` | `42` |
| `-17` | `-17` |
| `+5` | `5` |
| `0o17` | `15` (octal) |
| `0xff` | `255` (hex) |

### Float Values

| YAML | JavaScript |
| ---- | ---------- |
| `3.14` | `3.14` |
| `-0.5` | `-0.5` |
| `1.2e3` | `1200` |
| `.inf` | `Infinity` |
| `-.inf` | `-Infinity` |
| `.nan` | `NaN` |

### String Values

Any plain scalar that does not match the patterns above is left as a string.
Quoted scalars (single or double) are always strings regardless of content.

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = Effect.gen(function* () {
  const value = yield* parse(`
    plain: hello
    quoted_true: "true"
    quoted_number: '42'
    actual_true: true
    actual_number: 42
  `);
  console.log(value);
  // {
  //   plain: "hello",
  //   quoted_true: "true",    <-- string, not boolean
  //   quoted_number: "42",    <-- string, not number
  //   actual_true: true,      <-- boolean
  //   actual_number: 42       <-- number
  // }
});

Effect.runSync(program);
```

## Anchor and Alias Support

YAML anchors (`&name`) and aliases (`*name`) are resolved during composition.

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = Effect.gen(function* () {
  const value = yield* parse(`
    defaults: &defaults
      adapter: postgres
      host: localhost
    development:
      database: dev_db
      <<: *defaults
    production:
      database: prod_db
      <<: *defaults
  `);
  console.log(value);
});

Effect.runSync(program);
```

The `maxAliasCount` option limits alias expansion to prevent denial-of-service
attacks from deeply nested alias chains:

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = parse("a: *lots_of_aliases", { maxAliasCount: 10 }).pipe(
  Effect.catchTag("YamlComposerError", (error) => {
    console.error(error.message);
    return Effect.succeed(null);
  })
);

Effect.runSync(program);
```

## Error Handling

Parsing can fail with `YamlComposerError`, which contains an array of
`YamlErrorDetail` entries with precise position information.

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = parse("a: *missing_anchor").pipe(
  Effect.catchTag("YamlComposerError", (error) => {
    for (const detail of error.errors) {
      console.error(`[${detail.code}] ${detail.message}`);
      console.error(`  at line ${detail.line}, column ${detail.column}`);
      console.error(`  offset ${detail.offset}, length ${detail.length}`);
    }
    return Effect.succeed(null);
  })
);

Effect.runSync(program);
```

### Composer Error Codes

| Code | Description |
| ---- | ----------- |
| `UndefinedAlias` | Alias references a non-existent anchor |
| `DuplicateAnchor` | Two anchors with the same name |
| `CircularAlias` | Alias chain forms a cycle |
| `UnresolvedTag` | Explicit tag cannot be resolved |
| `InvalidTagValue` | Value does not match its explicit tag |
| `AliasCountExceeded` | Too many aliases (exceeds `maxAliasCount`) |
| `InvalidIndentation` | Key column or block-seq position violates indentation rules |
| `TabIndentation` | Tab character used where indentation must use spaces |
| `UnexpectedToken` | Mapping starts on the document-start (`---`) line, or other structural violation |

When `uniqueKeys` is `true` (the default), duplicate key warnings are promoted
to errors via `YamlComposerError`.
