# yaml-effect Documentation

A pure [Effect](https://effect.website)-based YAML 1.2 parser, stringifier,
and toolkit for TypeScript. Every operation returns an `Effect`, giving you
typed errors, composability, and seamless integration with Effect-based
applications.

## Installation

```bash
npm install yaml-effect effect
```

> **Peer dependency:** `effect` (>= 3.x) must be installed alongside
> yaml-effect.

## Quick Start

```typescript
import { Effect } from "effect";
import { parse, stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const value = yield* parse("name: Alice\nage: 30");
  console.log(value); // { name: "Alice", age: 30 }

  const yaml = yield* stringify(value);
  console.log(yaml); // "name: Alice\nage: 30\n"
});

Effect.runSync(program);
```

## Guides

| Guide | Description |
| ----- | ----------- |
| [Getting Started](./getting-started.md) | Installation, first examples, error handling |
| [Parsing](./parsing.md) | `parse`, `parseDocument`, `parseAllDocuments`, options |
| [Stringification](./stringify.md) | `stringify`, `stringifyDocument`, scalar and collection styles |
| [Schema Integration](./schema-integration.md) | Effect Schema composition for typed YAML roundtrips |
| [Formatting](./formatting.md) | `format`, `formatAndApply`, `stripComments`, range formatting |
| [Modification](./modification.md) | `modify`, `modifyAndApply`, path-based insert/replace/remove |
| [Equality](./equality.md) | `equals`, `equalsValue`, semantic comparison |
| [Visitor](./visitor.md) | AST and CST streaming traversal with `visit` and `visitCST` |
| [AST Navigation](./ast-navigation.md) | `findNode`, `findNodeAtOffset`, `getNodePath`, type guards |
| [Low-Level APIs](./low-level.md) | `lex`, `createScanner`, `parseCST`, token and CST node types |
| [Errors](./errors.md) | Error taxonomy, error codes, `Effect.catchTag` patterns |

## API at a Glance

### Core Operations

- `parse(text)` -- Parse YAML to a plain JavaScript value
- `parseDocument(text)` -- Parse to a full `YamlDocument` AST
- `parseAllDocuments(text)` -- Parse multi-document YAML
- `stringify(value)` -- Convert a JavaScript value to YAML
- `stringifyDocument(doc)` -- Serialize a `YamlDocument` AST to YAML

### Schema Integration

- `YamlFromString` -- Schema: YAML string to/from unknown
- `makeYamlSchema(schema)` -- Compose a typed Schema from YAML to domain type
- `YamlAllFromString` -- Schema: multi-document YAML string to/from unknown[]
- `makeYamlDocumentSchema()` -- Schema: YAML string to/from `YamlDocument`

### Formatting and Modification

- `format(text, opts)` / `formatAndApply(text, opts)` -- Reformat YAML
- `modify(text, path, value)` / `modifyAndApply(text, path, value)` -- Edit by path
- `applyEdits(text, edits)` -- Apply computed edits to text
- `stripComments(text)` -- Remove all comments

### Equality

- `equals(a, b)` -- Semantic equality (ignores formatting, key order)
- `equalsValue(yaml, value)` -- Compare YAML string against a JS value

### Visitor Pattern

- `visit(text)` -- Stream of AST visitor events
- `visitCollect(text, pred)` -- Collect matching AST events
- `visitCST(text)` -- Stream of CST visitor events
- `visitCSTCollect(text, pred)` -- Collect matching CST events

### AST Navigation

- `findNode(root, path)` -- Navigate to a node by path
- `findNodeAtOffset(root, offset)` -- Find the deepest node at a character offset
- `getNodePath(root, offset)` -- Get the path to a node at an offset
- `getNodeValue(node)` -- Extract a plain JS value from an AST node

### Type Guards

`isScalar`, `isMap`, `isSeq`, `isPair`, `isAlias`, `isNode`, `isDocument`

### Low-Level

- `lex(text)` -- Stream of YAML tokens
- `createScanner(text)` -- Pull-based incremental scanner
- `parseCST(text)` -- Stream of CST document nodes

## Error Types

All errors extend `Data.TaggedError` and can be caught with `Effect.catchTag`:

| Error | Source |
| ----- | ------ |
| `YamlComposerError` | Semantic composition (aliases, tags) |
| `YamlParseError` | Structural parse errors |
| `YamlLexError` | Token-level errors |
| `YamlStringifyError` | Stringification failures |
| `YamlFormatError` | Formatting failures |
| `YamlModificationError` | Path modification failures |
| `YamlNodeNotFoundError` | AST path navigation failures |
| `YamlSchemaError` | Schema validation failures |

## Pipeline Architecture

```text
YAML text
  |
  +-- lex() ----------- Stream<YamlToken>
  |
  +-- parseCST() ------ Stream<CstNode>
  |
  +-- parseDocument() - Effect<YamlDocument>
  |     +-- parse() --- Effect<unknown>  (convenience)
  |
  +-- stringify() ----- Effect<string>   (from JS value)
  |
  +-- stringifyDocument() -- Effect<string>  (from YamlDocument AST)
```

## Dual Calling Convention

Functions built with `Fn.dual` support both direct and pipeline styles:

```typescript
import { pipe } from "effect";
import { equals } from "yaml-effect";

// Direct
equals("a: 1", "a: 1");

// Pipeline
pipe("a: 1", equals("a: 1"));
```
