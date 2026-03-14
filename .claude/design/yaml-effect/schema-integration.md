---
title: Schema Integration
description: Effect Schema bridges for typed YAML-to-domain roundtrips.
status: current
module: yaml-effect
category: integration
created: 2026-03-14
updated: 2026-03-14
last-synced: 2026-03-14
completeness: 75
related:
  - architecture.md
  - schemas.md
  - parsing.md
  - stringify.md
dependencies:
  - parsing.md
  - stringify.md
  - schemas.md
---

File: `src/utils/schema-integration.ts`

Bridges YAML parse/stringify with Effect Schema decode/encode for fully
typed YAML-to-domain roundtrips.

## YamlFromString

```typescript
const YamlFromString: Schema.Schema<unknown, string>
```

A Schema that decodes a YAML string into an unknown value via `parse()` and
encodes an unknown value back into a YAML string via `stringify()`. Errors
are mapped to `ParseResult.Type`.

## makeYamlFromString

```typescript
function makeYamlFromString(
  parseOptions?: Partial<YamlParseOptions>,
  stringifyOptions?: Partial<YamlStringifyOptions>,
): Schema.Schema<unknown, string>
```

Creates a `YamlFromString` schema with custom parse and stringify options.

## makeYamlSchema

```typescript
function makeYamlSchema<A, I, R>(
  targetSchema: Schema.Schema<A, I, R>,
  options?: {
    parseOptions?: Partial<YamlParseOptions>;
    stringifyOptions?: Partial<YamlStringifyOptions>;
  },
): Schema.Schema<A, string, R>
```

Creates a fully typed Schema pipeline: YAML string -> unknown -> domain
type `A`. Uses `Schema.compose` with `{ strict: false }` to bridge the
`unknown` intermediate type to the target schema's input type `I`.

Example:

```typescript
const schema = makeYamlSchema(Schema.Struct({ name: Schema.String }));
const result = Schema.decode(schema)("name: Alice");
// Effect<{ name: string }, ParseError>
```

## YamlAllFromString / makeYamlAllFromString

```typescript
const YamlAllFromString: Schema.Schema<ReadonlyArray<unknown>, string>

function makeYamlAllFromString(
  parseOptions?: Partial<YamlParseOptions>,
): Schema.Schema<ReadonlyArray<unknown>, string>
```

Multi-document Schema. Decode: parses multi-document YAML into an array of
plain values via `parseAllDocuments()`, resolving anchors/aliases via
`buildAnchorMap()` and `getNodeValue()`.

Encode: stringifies each value as a separate YAML document. Conventions:

- No leading `---` before the first document (bare document)
- `---` separator between subsequent documents
- Trailing newline after each document
- Empty array encodes to empty string `""`

## makeYamlDocumentSchema

```typescript
function makeYamlDocumentSchema(
  parseOptions?: Partial<YamlParseOptions>,
): Schema.Schema<YamlDocument, string>
```

Document-preserving Schema. Preserves the full `YamlDocument` structure
(directives, comments, errors, warnings). Decode uses `parseDocument()`.
Encode uses `stringifyDocument()` for round-trip fidelity.

## Error Handling

All Schema transformations use `Schema.transformOrFail`. Parse/stringify
errors are mapped to `ParseResult.Type` for integration with Effect's
Schema error model. The original error message is preserved in the
`ParseResult.Type` message field.
