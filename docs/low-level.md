# Low-Level APIs

The low-level APIs expose the individual stages of the YAML processing pipeline:
lexing (tokenization), scanning (pull-based token access), and CST (Concrete
Syntax Tree) construction. Most users should use the high-level `parse`,
`stringify`, and `format` functions instead.

## When to Use Low-Level APIs

Use the low-level APIs when you need to:

- Build custom YAML processing tools (linters, formatters, analyzers)
- Inspect the raw token stream for debugging or diagnostics
- Work with the CST for source-preserving transformations
- Implement incremental parsing with position-based rescanning
- Process YAML at a level below semantic interpretation

For typical parse/stringify workflows, use the functions in
[Parsing](./parsing.md) and [Stringification](./stringify.md) instead.

## `lex(text)`

Tokenizes a YAML source string into an Effect `Stream` of `YamlToken` values.
Lexer errors are embedded as `"error"` tokens in the success channel rather
than causing stream failure.

```typescript
import { Effect, Stream } from "effect";
import { lex } from "yaml-effect";

const yaml = "name: Alice\nage: 30\n";

const program = Effect.gen(function* () {
  const tokens = yield* Stream.runCollect(lex(yaml)).pipe(
    Effect.map((chunk) => [...chunk])
  );

  for (const token of tokens) {
    console.log(
      `${token.kind}: ${JSON.stringify(token.value)} ` +
      `at ${token.line}:${token.column} (offset ${token.offset})`
    );
  }
});

Effect.runSync(program);
```

## `createScanner(text)`

Creates a pull-based, stateful YAML scanner. Unlike `lex` which returns a
stream, the scanner provides imperative token-by-token access. This is useful
for tools that need fine-grained control over token consumption or need to
reposition the scanner.

```typescript
import type { YamlScanner } from "yaml-effect";
import { createScanner } from "yaml-effect";

const scanner: YamlScanner = createScanner("name: Alice\nage: 30");

let kind = scanner.scan();
while (kind !== null) {
  console.log(
    `${kind}: ${JSON.stringify(scanner.getTokenValue())} ` +
    `at ${scanner.getTokenLine()}:${scanner.getTokenColumn()}`
  );
  kind = scanner.scan();
}
```

### `YamlScanner` Interface

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `scan()` | `YamlTokenKind` or `null` | Advance to next token; `null` at end |
| `getToken()` | `YamlTokenKind` or `null` | Current token kind without advancing |
| `getTokenValue()` | `string` | Value string of current token |
| `getTokenOffset()` | `number` | Zero-based character offset |
| `getTokenLength()` | `number` | Character length of current token |
| `getTokenLine()` | `number` | Zero-based line number |
| `getTokenColumn()` | `number` | Zero-based column |
| `getPosition()` | `number` | Current scanner position |
| `setPosition(pos)` | `void` | Reset scanner to a character offset |

### Repositioning the Scanner

The `setPosition` method resets the scanner to a specific character offset and
clears all internal state (indentation tracking, flow depth, pending tokens).
For reliable results, pass an offset previously returned by `getTokenOffset`.

```typescript
import { createScanner } from "yaml-effect";

const scanner = createScanner("a: 1\nb: 2\nc: 3");

// Scan a few tokens
scanner.scan(); // "scalar" (a)
scanner.scan(); // "block-map-value" (:)
const savedOffset = scanner.getTokenOffset();

// Continue scanning...
scanner.scan();
scanner.scan();

// Reset back to the saved position
scanner.setPosition(savedOffset);
const kind = scanner.scan();
console.log(kind, scanner.getTokenValue()); // Rescans from saved position
```

## `parseCST(text)`

Parses YAML source text into a `Stream` of `CstNode` values, one per document.
The CST preserves every character of the original input, including whitespace,
comments, and structural indicators. No value interpretation occurs.

```typescript
import { Effect, Stream } from "effect";
import { parseCST } from "yaml-effect";

const yaml = "name: Alice\nage: 30\n";

const program = Effect.gen(function* () {
  const documents = yield* Stream.runCollect(parseCST(yaml)).pipe(
    Effect.map((chunk) => [...chunk])
  );

  for (const doc of documents) {
    console.log(doc.type);   // "document"
    console.log(doc.source); // Full source text of the document
    if (doc.children) {
      for (const child of doc.children) {
        console.log(`  ${child.type}: ${JSON.stringify(child.source)}`);
      }
    }
  }
});

Effect.runSync(program);
```

## Token Types

The 22 token kinds produced by the YAML lexer:

| Token Kind | Description |
| ---------- | ----------- |
| `document-start` | `---` marker |
| `document-end` | `...` marker |
| `directive` | `%YAML` or `%TAG` directive |
| `tag` | Tag handle (e.g., `!!str`, `!<tag>`) |
| `anchor` | Anchor definition (`&name`) |
| `alias` | Alias reference (`*name`) |
| `scalar` | Scalar value (plain, quoted, or block) |
| `block-map-start` | Zero-width block mapping start marker |
| `block-map-key` | Explicit key indicator (`?`) |
| `block-map-value` | Value indicator (`:`) |
| `block-seq-start` | Zero-width block sequence start marker |
| `block-seq-entry` | Sequence entry indicator (`-`) |
| `flow-map-start` | Flow mapping open (`{`) |
| `flow-map-end` | Flow mapping close (`}`) |
| `flow-seq-start` | Flow sequence open (`[`) |
| `flow-seq-end` | Flow sequence close (`]`) |
| `flow-separator` | Flow collection separator (`,`) |
| `newline` | Line break |
| `whitespace` | Spaces or tabs |
| `comment` | Comment (from `#` to end of line) |
| `byte-order-mark` | Unicode BOM |
| `error` | Lexer error token |

## CST Node Types

The 15 node types produced by the CST parser:

| Node Type | Description |
| --------- | ----------- |
| `document` | A complete YAML document |
| `directive` | A YAML directive |
| `comment` | A comment node |
| `block-map` | A block-style mapping |
| `block-seq` | A block-style sequence |
| `flow-map` | A flow-style mapping |
| `flow-seq` | A flow-style sequence |
| `block-scalar` | A block scalar (literal or folded) |
| `flow-scalar` | A flow scalar (plain or quoted) |
| `alias` | An alias reference |
| `anchor` | An anchor definition |
| `tag` | A tag handle |
| `whitespace` | Whitespace and structural punctuation |
| `newline` | A line break |
| `error` | An error node |

### `CstNode` Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `type` | `CstNodeType` | The node type |
| `source` | `string` | Raw text slice from the source document |
| `offset` | `number` | Zero-based character offset |
| `length` | `number` | Character length of the node span |
| `children` | `Array<CstNode>` (optional) | Recursive child nodes |
