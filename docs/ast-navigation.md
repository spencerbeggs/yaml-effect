# AST Navigation

Path-based and offset-based navigation within parsed YAML AST trees. All
navigation functions support both direct and pipeline calling conventions.

## `findNode(root, path)`

Navigates to a node within the AST by following a path of string keys (for
mappings) and numeric indices (for sequences). Returns `Option.Some` with the
node if found, `Option.None` otherwise.

This function is a dual.

### Direct Style

```typescript
import { Effect, Option } from "effect";
import { findNode, isScalar, parseDocument } from "yaml-effect";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument(
    "server:\n  host: localhost\n  ports:\n    - 8080\n    - 8443"
  );
  const root = doc.contents!;

  const host = yield* findNode(root, ["server", "host"]);
  if (Option.isSome(host) && isScalar(host.value)) {
    console.log(host.value.value); // "localhost"
  }

  const missing = yield* findNode(root, ["server", "missing"]);
  console.log(Option.isNone(missing)); // true
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, Option, pipe } from "effect";
import { findNode, isScalar, parseDocument } from "yaml-effect";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument(
    "server:\n  host: localhost\n  ports:\n    - 8080\n    - 8443"
  );
  const root = doc.contents!;

  const port = yield* pipe(root, findNode(["server", "ports", 0]));
  if (Option.isSome(port) && isScalar(port.value)) {
    console.log(port.value.value); // 8080
  }
});

Effect.runSync(program);
```

## `findNodeAtOffset(root, offset)`

Finds the deepest AST node that contains the given character offset. Returns
`Option.Some` with the node if found, `Option.None` if the offset falls
outside the tree.

This function is a dual.

### Direct Style

```typescript
import { Effect, Option } from "effect";
import { findNodeAtOffset, isScalar, parseDocument } from "yaml-effect";

const yaml = "name: Alice";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument(yaml);
  const root = doc.contents!;

  // Offset 6 points into the value "Alice"
  const node = yield* findNodeAtOffset(root, 6);
  if (Option.isSome(node) && isScalar(node.value)) {
    console.log(node.value.value); // "Alice"
  }
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, Option, pipe } from "effect";
import { findNodeAtOffset, isScalar, parseDocument } from "yaml-effect";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument("name: Alice");
  const root = doc.contents!;

  const node = yield* pipe(root, findNodeAtOffset(6));
  if (Option.isSome(node) && isScalar(node.value)) {
    console.log(node.value.value); // "Alice"
  }
});

Effect.runSync(program);
```

## `getNodePath(root, offset)`

Returns the path segments leading to the node at the given character offset.
The path is an array of string keys and numeric indices.

This function is a dual.

### Direct Style

```typescript
import { Effect, Option } from "effect";
import { getNodePath, parseDocument } from "yaml-effect";

const yaml = "server:\n  host: localhost\n  ports:\n    - 8080";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument(yaml);
  const root = doc.contents!;

  // Offset pointing into "localhost" value
  const path = yield* getNodePath(root, 16);
  if (Option.isSome(path)) {
    console.log(path.value); // ["server", "host"]
  }
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, Option, pipe } from "effect";
import { getNodePath, parseDocument } from "yaml-effect";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument(
    "server:\n  host: localhost\n  ports:\n    - 8080"
  );
  const root = doc.contents!;

  const path = yield* pipe(root, getNodePath(16));
  if (Option.isSome(path)) {
    console.log(path.value);
  }
});

Effect.runSync(program);
```

## `getNodeValue(node)`

Extracts the plain JavaScript value from a YAML AST node.

- `YamlScalar` returns its `value` field
- `YamlMap` returns a plain JS object built from its pairs
- `YamlSeq` returns a plain JS array built from its items
- `YamlAlias` returns the anchor name string (not resolved)

```typescript
import { Effect, Option } from "effect";
import { findNode, getNodeValue, parseDocument } from "yaml-effect";

const yaml = "server:\n  host: localhost\n  port: 8080";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument(yaml);
  const root = doc.contents!;

  // Extract the entire document as a plain JS object
  const fullValue = yield* getNodeValue(root);
  console.log(fullValue);
  // { server: { host: "localhost", port: 8080 } }

  // Extract a nested node's value
  const hostNode = yield* findNode(root, ["server", "host"]);
  if (Option.isSome(hostNode)) {
    const hostValue = yield* getNodeValue(hostNode.value);
    console.log(hostValue); // "localhost"
  }
});

Effect.runSync(program);
```

## Type Guards

Type guards narrow an unknown value to a specific AST node type.

```typescript
import type { YamlNode } from "yaml-effect";
import { Effect } from "effect";
import {
  isAlias,
  isDocument,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
} from "yaml-effect";

const program = Effect.gen(function* () {
  const doc = yield* parseDocument("name: Alice\nitems:\n  - one\n  - two");
  const root = doc.contents!;

  console.log(isDocument(doc));  // true
  console.log(isNode(root));     // true
  console.log(isMap(root));      // true
  console.log(isSeq(root));      // false
  console.log(isAlias(root));    // false

  if (isMap(root)) {
    const pair = root.items[0];
    console.log(isPair(pair));   // true

    if (isScalar(pair.key)) {
      console.log(pair.key.value); // "name"
    }
  }
});

Effect.runSync(program);
```

### Available Type Guards

| Guard | Matches |
| ----- | ------- |
| `isScalar(node)` | `YamlScalar` -- leaf values (string, number, boolean, null) |
| `isMap(node)` | `YamlMap` -- mapping collections |
| `isSeq(node)` | `YamlSeq` -- sequence collections |
| `isPair(node)` | `YamlPair` -- key-value pair within a mapping |
| `isAlias(node)` | `YamlAlias` -- alias reference to an anchor |
| `isNode(node)` | Any of the four AST node types |
| `isDocument(node)` | `YamlDocument` instance |

## AST Node Types

### `YamlScalar`

A leaf value: string, number, boolean, or null.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `value` | `unknown` | The resolved JavaScript value |
| `style` | `ScalarStyle` | Presentation style (plain, single-quoted, etc.) |
| `tag` | `string` (optional) | Explicit YAML tag |
| `anchor` | `string` (optional) | Anchor name for aliasing |
| `comment` | `string` (optional) | Trailing or leading comment |
| `chomp` | `"strip"` \| `"clip"` \| `"keep"` (optional) | Block scalar chomping indicator (`-`, default, or `+`) preserved from source |
| `raw` | `string` (optional) | Original source text, used to round-trip non-canonical numeric formats and block scalar headers |
| `offset` | `number` | Zero-based character offset |
| `length` | `number` | Character length of the span |

The `chomp` and `raw` fields are populated by the composer when parsing and
read by the stringifier to preserve fidelity on round-trip. They are optional
on construction — manually built `YamlScalar` instances do not need to set
them.

### `YamlMap`

A mapping collection of key-value pairs.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `items` | `Array<YamlPair>` | Key-value pair entries |
| `style` | `CollectionStyle` | `"block"` or `"flow"` |
| `tag` | `string` (optional) | Explicit YAML tag |
| `anchor` | `string` (optional) | Anchor name |
| `comment` | `string` (optional) | Comment text |
| `offset` | `number` | Zero-based character offset |
| `length` | `number` | Character length of the span |

### `YamlSeq`

A sequence (ordered list) of values.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `items` | `Array<YamlNode>` | Sequence elements |
| `style` | `CollectionStyle` | `"block"` or `"flow"` |
| `tag` | `string` (optional) | Explicit YAML tag |
| `anchor` | `string` (optional) | Anchor name |
| `comment` | `string` (optional) | Comment text |
| `offset` | `number` | Zero-based character offset |
| `length` | `number` | Character length of the span |

### `YamlPair`

A key-value pair within a mapping.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `key` | `YamlNode` | The mapping key |
| `value` | `YamlNode` or `null` | The mapping value |
| `comment` | `string` (optional) | Comment text |

### `YamlAlias`

An alias reference to a previously defined anchor.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `name` | `string` | Anchor name (without leading `*`) |
| `offset` | `number` | Zero-based character offset |
| `length` | `number` | Character length of the span |

### `YamlDocument`

A parsed YAML document containing the root AST node and metadata.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `contents` | `YamlNode` or `null` | Root AST node |
| `errors` | `ReadonlyArray<YamlErrorDetail>` | Parse errors |
| `warnings` | `ReadonlyArray<YamlErrorDetail>` | Non-fatal warnings |
| `directives` | `ReadonlyArray<YamlDirective>` | YAML directives |
| `comment` | `string` (optional) | Document-level comment |
