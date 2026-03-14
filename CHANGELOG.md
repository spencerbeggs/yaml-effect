# yaml-effect

## 0.1.0

### Features

* [`29f0954`](https://github.com/spencerbeggs/yaml-effect/commit/29f0954084098902942e91b73a1908c6c10e6614) Initial release of yaml-effect — a pure Effect-based YAML 1.2 parser and stringifier for TypeScript.

- **Core Operations:** `parse` / `parseDocument` / `parseAllDocuments` for parsing YAML strings into plain JS values or full AST documents; `stringify` / `stringifyDocument` for converting back to YAML strings. Three-stage pipeline: lexer (tokenization) → parser (CST) → composer (AST with YAML 1.2 Core Schema type resolution).
- **Schema Integration:** `YamlFromString` / `makeYamlFromString` for bidirectional YAML string ↔ unknown value transformation; `makeYamlSchema` for composing YAML parsing with any Effect Schema for fully typed roundtrips; `YamlAllFromString` / `makeYamlAllFromString` for multi-document support; `makeYamlDocumentSchema` for AST-preserving schemas.
- **Formatting & Modification:** `format` for reformatting YAML with customizable indent, line width, quote style, and flow level; `sortKeys` for sorting mapping keys; `setIn` / `deleteIn` / `mergeIn` for immutable deep path-based document modification.
- **Equality:** `equals` for semantic comparison of two YAML strings (ignores comments, whitespace, key order); `equalsValue` for comparing a YAML string against a JavaScript value.
- **Visitor Pattern:** `visit` for walking and transforming the AST with enter/leave callbacks per node type; `visitCST` for low-level token-aware CST processing.
- **AST Navigation:** `findNode` / `findNodeAtOffset` / `getNodePath` for navigating the AST by path or offset; type guards `isScalar`, `isMap`, `isSeq`, `isPair`, `isAlias`, `isNode`, `isDocument`.
- **Low-Level APIs:** `lex` / `lexAll` / `createScanner` for tokenization with pull-based scanner; `parseCST` for CST stream production.
- **Error Handling:** Typed errors via Effect's tagged error pattern (`YamlComposerError`, `YamlLexError`, `YamlParseError`, `YamlFormatError`, `YamlStringifyError`, `YamlModificationError`, `YamlNodeNotFoundError`, `YamlSchemaError`). All operations return `Effect` values with precise error channels.
- **Design:** Zero dependencies beyond Effect. All public APIs support dual calling convention (direct and pipeline via `Fn.dual`). Full YAML 1.2 Core Schema support including anchors, aliases, tags, multi-document streams, block scalars, and all escape sequences.
