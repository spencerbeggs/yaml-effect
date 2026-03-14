# Stringification

Convert JavaScript values and YAML AST documents back into YAML text.

## `stringify(value, options?)`

Converts a JavaScript value into a YAML text string.

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify({
    name: "Alice",
    tags: ["admin", "user"],
    active: true,
  });
  console.log(yaml);
  // name: Alice
  // tags:
  //   - admin
  //   - user
  // active: true
});

Effect.runSync(program);
```

**Signature:**

```typescript
function stringify(
  value: unknown,
  options?: YamlStringifyOptions | Partial<{ ... }>
): Effect.Effect<string, YamlStringifyError>
```

Handles all primitive types, arrays, and plain objects. Special numbers are
rendered as their YAML equivalents:

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify({
    pos_inf: Infinity,
    neg_inf: -Infinity,
    not_a_number: NaN,
  });
  console.log(yaml);
  // pos_inf: .inf
  // neg_inf: -.inf
  // not_a_number: .nan
});

Effect.runSync(program);
```

## `stringifyDocument(doc, options?)`

Converts a `YamlDocument` AST into a YAML text string, preserving the style
metadata encoded in each AST node. This is the function to use for round-trip
processing.

```typescript
import { Effect } from "effect";
import { parseDocument, stringifyDocument } from "yaml-effect";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument("name: Alice\nage: 30");
  const yaml = yield* stringifyDocument(doc);
  console.log(yaml);
  // name: Alice
  // age: 30
});

Effect.runSync(program);
```

**Signature:**

```typescript
function stringifyDocument(
  doc: YamlDocument,
  options?: YamlStringifyOptions | Partial<{ ... }>
): Effect.Effect<string, YamlStringifyError>
```

Scalar nodes use their `style` field to control rendering. Collection nodes
use their `style` field (`"block"` or `"flow"`). Nodes without an explicit
style fall back to the defaults in `options`.

## `YamlStringifyOptions`

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `indent` | `number` | `2` | Spaces per indentation level |
| `lineWidth` | `number` | `80` | Preferred maximum line width |
| `defaultScalarStyle` | `ScalarStyle` | `"plain"` | Default scalar output style |
| `defaultCollectionStyle` | `CollectionStyle` | `"block"` | Default collection output style |
| `sortKeys` | `boolean` | `false` | Sort mapping keys alphabetically |
| `finalNewline` | `boolean` | `true` | Append trailing newline to output |

### Example: Custom Options

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const data = { b: 2, a: 1, c: 3 };

const program = Effect.gen(function* () {
  const yaml = yield* stringify(data, {
    indent: 4,
    sortKeys: true,
    finalNewline: false,
  });
  console.log(yaml);
  // a: 1
  // b: 2
  // c: 3
});

Effect.runSync(program);
```

## Scalar Styles

The `defaultScalarStyle` option controls how string values are rendered.

| Style | Syntax | Example |
| ----- | ------ | ------- |
| `"plain"` | Unquoted | `hello world` |
| `"single-quoted"` | Single quotes | `'hello world'` |
| `"double-quoted"` | Double quotes, escape sequences | `"hello world"` |
| `"block-literal"` | Pipe indicator, preserves newlines | see below |
| `"block-folded"` | Greater-than indicator, folds newlines | see below |

### Block Literal (`|`)

Preserves newlines exactly as written.

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify(
    { description: "line one\nline two\nline three\n" },
    { defaultScalarStyle: "block-literal" }
  );
  console.log(yaml);
  // description: |
  //   line one
  //   line two
  //   line three
});

Effect.runSync(program);
```

### Block Folded (`>`)

Folds single newlines into spaces; blank lines become paragraph breaks.

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify(
    { description: "line one\nline two\nline three\n" },
    { defaultScalarStyle: "block-folded" }
  );
  console.log(yaml);
  // description: >
  //   line one
  //   line two
  //   line three
});

Effect.runSync(program);
```

## Collection Styles

The `defaultCollectionStyle` option controls how mappings and sequences are
rendered.

### Block Style (default)

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify({
    users: [{ name: "Alice" }, { name: "Bob" }],
  });
  console.log(yaml);
  // users:
  //   - name: Alice
  //   - name: Bob
});

Effect.runSync(program);
```

### Flow Style

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify(
    { users: [{ name: "Alice" }, { name: "Bob" }] },
    { defaultCollectionStyle: "flow" }
  );
  console.log(yaml);
  // {users: [{name: Alice}, {name: Bob}]}
});

Effect.runSync(program);
```

## Error Handling

`stringify` fails with `YamlStringifyError` when it encounters an
unstringifiable value, such as a circular reference.

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const circular: Record<string, unknown> = { name: "test" };
circular.self = circular;

const program = stringify(circular).pipe(
  Effect.catchTag("YamlStringifyError", (error) => {
    console.error(`Stringify failed: ${error.reason}`);
    return Effect.succeed("# error\n");
  })
);

Effect.runSync(program);
```

The `YamlStringifyError` contains:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `value` | `unknown` | The value that could not be stringified |
| `reason` | `string` | Human-readable explanation of the failure |
