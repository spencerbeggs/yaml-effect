# yaml-effect

## 0.1.3

### Bug Fixes

* [`8c2859c`](https://github.com/spencerbeggs/yaml-effect/commit/8c2859cc084f7f8c63c05f4557e7ee4b5d34dc9b) Fix parser to accept valid YAML previously rejected (2JQS, HS5T, KK5P, S3PD, V9D5). Fixes include tab handling as separation whitespace in plain scalars, block sequence consumption as mapping values, and null-key value pairing in implicit block mappings. Compliance test harness now uses uniqueKeys: false to match YAML spec semantics.

Implement YAML 1.2 §6.5 flow line folding for plain, double-quoted, and single-quoted scalars. Bare newlines between non-empty lines fold to spaces, empty lines are preserved as newlines, and leading/trailing whitespace is properly trimmed. Multi-line plain scalars spanning multiple CST nodes are now correctly merged. Escape-produced content in double-quoted scalars is preserved during whitespace trimming. Fixes 18 additional compliance test assertions (3RLN, DE56, DK95/02, 4CQQ, HS5T).

Implement YAML 1.2 §8.1 block scalar folding for "more indented" lines. Lines with extra indentation beyond the base content indent preserve their newlines instead of being folded to spaces. Empty lines adjacent to more-indented content correctly produce double newlines. Zero-indent block scalars at document level (e.g., `--- >`) are now parsed correctly. Fixes 8 additional compliance test assertions (6VJK, 7T8X, MJS9, FP8R, DK3J, F6MC, 82AN, NB6Z).

## 0.1.2

### Bug Fixes

* [`88b0d81`](https://github.com/spencerbeggs/yaml-effect/commit/88b0d81d74b64c3bb37235639814529ba37b84b3) Fix tab handling in lexer and composer for YAML 1.2 compliance
  * Allow backslash-tab escape (`\<TAB>`) in double-quoted scalars
  * Allow tabs on blank separator lines and before flow-opening indicators
  * Reject tabs after block indicators (`-`, `?`, `:`)
  * Reject mixed tab+space indentation in block context
  * Reject tabs on continuation lines in double-quoted scalars
  * Propagate error CST nodes through all composer functions

Fixes 17 yaml-test-suite compliance failures (9 valid YAML + 8 invalid YAML).

## 0.1.1

### Features

* [`a3536be`](https://github.com/spencerbeggs/yaml-effect/commit/a3536befc8429b9a72d34ca7a5f2ae39ee5ec77f) Add official yaml-test-suite integration for YAML 1.2 compliance validation. The suite runs \~440 test cases from the community-standard test suite against our parser, checking parse correctness, JSON output, canonical stringifier output, and roundtrip fidelity. Known gaps are tracked via skip maps. A compliance GitHub Action generates dynamic badges showing parse and full compliance percentages.

### Bug Fixes

* [`900dc66`](https://github.com/spencerbeggs/yaml-effect/commit/900dc663d173b23e692c5ea1d468fcdc34485b8b) Fix tagged empty values: flush pending tag/anchor metadata as empty scalar when no value follows (e.g., `!!str` in flow maps and sequences)
* Allow colon and other spec-permitted characters in anchor/alias names per YAML 1.2 `ns-anchor-char`
* Preserve trailing whitespace-only lines in literal block scalars per spec section 8.1.3
* Use `parseAllDocuments` for multi-document compliance test cases

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
