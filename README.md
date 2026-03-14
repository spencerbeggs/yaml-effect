# yaml-effect

[![npm version](https://img.shields.io/npm/v/yaml-effect)](https://www.npmjs.com/package/yaml-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A pure [Effect](https://effect.website)-based YAML 1.2 parser, stringifier, and
toolkit for TypeScript. Every operation returns an `Effect`, giving you typed
errors, composability, and seamless integration with Effect-based applications.

## Features

- **Full YAML 1.2 Core Schema** — null, bool, int (decimal/octal/hex), float
  (including `.inf` and `.nan`), and string type resolution
- **Effect-native** — all operations return `Effect` values with typed error
  channels
- **Schema integration** — bidirectional Effect Schema composition for typed
  YAML-to-domain roundtrips
- **AST & CST access** — full Abstract and Concrete Syntax Tree access for
  advanced use cases
- **Non-destructive formatting** — re-indent, sort keys, and strip comments via
  character-level edits
- **Path-based modification** — insert, replace, or remove values by JSONPath-
  like segments
- **Semantic equality** — compare YAML documents ignoring formatting and key
  order
- **Visitor pattern** — SAX-style streaming traversal at both AST and CST levels
- **Multi-document support** — parse and stringify YAML streams with multiple
  `---` separated documents
- **Round-trip fidelity** — preserve comments, styles, and anchors through the
  Document AST

## Installation

```bash
npm install yaml-effect effect
```

> **Peer dependency:** `effect` (>= 3.x) must be installed alongside
> yaml-effect.

## Quick Start

### Parse YAML to JavaScript

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

### Stringify JavaScript to YAML

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify({ greeting: "hello", count: 42 });
  console.log(yaml);
  // greeting: hello
  // count: 42
});

Effect.runSync(program);
```

### Typed Schema Integration

```typescript
import { Effect, Schema } from "effect";
import { makeYamlSchema } from "yaml-effect";

const UserSchema = makeYamlSchema(
  Schema.Struct({ name: Schema.String, age: Schema.Number }),
);

const program = Effect.gen(function* () {
  const user = yield* Schema.decode(UserSchema)("name: Alice\nage: 30");
  console.log(user); // { name: "Alice", age: 30 }

  const yaml = yield* Schema.encode(UserSchema)({ name: "Bob", age: 25 });
  console.log(yaml); // "name: Bob\nage: 25\n"
});

Effect.runSync(program);
```

### Error Handling

All errors are typed with `Data.TaggedError` and can be caught precisely:

```typescript
import { Effect } from "effect";
import type { YamlComposerError } from "yaml-effect";
import { parse } from "yaml-effect";

const program = parse("key: *undefined_alias").pipe(
  Effect.catchTag("YamlComposerError", (e: YamlComposerError) => {
    for (const detail of e.errors) {
      console.error(`[${detail.code}] ${detail.message}`);
    }
    return Effect.succeed(null);
  }),
);
```

## API Overview

### Core Operations

| Function | Description |
| --- | --- |
| `parse(text)` | Parse YAML to a plain JavaScript value |
| `parseDocument(text)` | Parse YAML to a full `YamlDocument` AST |
| `parseAllDocuments(text)` | Parse multi-document YAML to `YamlDocument[]` |
| `stringify(value)` | Convert a JavaScript value to YAML text |
| `stringifyDocument(doc)` | Serialize a `YamlDocument` AST back to YAML |

### Formatting & Modification

| Function | Description |
| --- | --- |
| `format(text, opts)` | Compute formatting edits (indent, sort, etc.) |
| `formatAndApply(text, opts)` | Format and return the result directly |
| `modify(text, path, value)` | Compute edits to insert/replace/remove by path |
| `modifyAndApply(text, path, value)` | Modify and return the result directly |
| `applyEdits(text, edits)` | Apply an array of `YamlEdit` to text |
| `stripComments(text)` | Remove all comments from YAML |

### Equality

| Function | Description |
| --- | --- |
| `equals(a, b)` | Semantic equality between two YAML strings |
| `equalsValue(yaml, value)` | Compare a YAML string against a JS value |

### Schema Integration

| Export | Description |
| --- | --- |
| `YamlFromString` | Schema: YAML string ↔ unknown |
| `YamlAllFromString` | Schema: multi-doc YAML string ↔ unknown[] |
| `makeYamlSchema(schema)` | Compose a typed Schema from YAML to domain type |
| `makeYamlFromString(opts)` | Create `YamlFromString` with custom options |
| `makeYamlDocumentSchema(opts)` | Schema: YAML string ↔ `YamlDocument` |

### Visitor Pattern

| Function | Description |
| --- | --- |
| `visit(text)` | Stream of AST visitor events |
| `visitCollect(text, pred)` | Collect matching AST events |
| `visitCST(text)` | Stream of CST visitor events |
| `visitCSTCollect(text, pred)` | Collect matching CST events |

### Low-Level APIs

| Function | Description |
| --- | --- |
| `lex(text)` | Stream of YAML tokens |
| `createScanner(text)` | Pull-based incremental scanner |
| `parseCST(text)` | Stream of CST document nodes |

### AST Navigation

| Function | Description |
| --- | --- |
| `findNode(root, path)` | Navigate to a node by path segments |
| `findNodeAtOffset(root, offset)` | Find the deepest node at a character offset |
| `getNodePath(root, offset)` | Get the path to the node at an offset |
| `getNodeValue(node)` | Extract a plain JS value from an AST node |

### Type Guards

`isScalar`, `isMap`, `isSeq`, `isPair`, `isAlias`, `isNode`, `isDocument`

## Pipeline Architecture

```text
YAML text
  │
  ├─ lex() ─────────── Stream<YamlToken>
  │
  ├─ parseCST() ────── Stream<CstNode>
  │
  ├─ parseDocument() ─ Effect<YamlDocument>
  │   └─ parse() ───── Effect<unknown>  (convenience)
  │
  ├─ stringify() ───── Effect<string>   (from JS value)
  │
  └─ stringifyDocument() ── Effect<string>  (from YamlDocument AST)
```

## Dual Calling Convention

Functions built with `Fn.dual` support both direct and pipeline styles:

```typescript
import { Effect, pipe } from "effect";
import { equals, modify } from "yaml-effect";

// Direct style
const result1 = equals("a: 1", "a: 1");

// Pipeline style
const result2 = pipe("a: 1", equals("a: 1"));

// Modify with pipeline
const result3 = pipe("key: old\n", modify(["key"], "new"));
```

## Error Types

| Error | Raised By |
| --- | --- |
| `YamlLexError` | Token-level errors |
| `YamlParseError` | Structural parse errors |
| `YamlComposerError` | Semantic composition errors |
| `YamlStringifyError` | Stringification failures |
| `YamlFormatError` | Formatting failures |
| `YamlModificationError` | Path modification failures |
| `YamlNodeNotFoundError` | AST path navigation failures |
| `YamlSchemaError` | Schema validation failures |

All errors extend `Data.TaggedError` and carry detailed context (source text,
error position, human-readable messages). Use `Effect.catchTag` to handle
specific error types.

## Documentation

For detailed guides, configuration options, and advanced usage, see the
[docs](./docs/) folder:

- [Getting Started](./docs/getting-started.md) -- installation, first examples
- [Parsing](./docs/parsing.md) -- `parse`, `parseDocument`, `parseAllDocuments`
- [Stringification](./docs/stringify.md) -- `stringify`, `stringifyDocument`
- [Schema Integration](./docs/schema-integration.md) -- Effect Schema composition
- [Formatting](./docs/formatting.md) -- `format`, `formatAndApply`, `stripComments`
- [Modification](./docs/modification.md) -- `modify`, `modifyAndApply`
- [Equality](./docs/equality.md) -- `equals`, `equalsValue`
- [Visitor](./docs/visitor.md) -- AST and CST streaming traversal
- [AST Navigation](./docs/ast-navigation.md) -- `findNode`, `findNodeAtOffset`, type guards
- [Low-Level APIs](./docs/low-level.md) -- `lex`, `createScanner`, `parseCST`
- [Errors](./docs/errors.md) -- error taxonomy and handling patterns

## License

[MIT](LICENSE)
