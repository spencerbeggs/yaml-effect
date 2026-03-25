# yaml-effect

## 0.2.3

### Tests

* [`ca5be43`](https://github.com/spencerbeggs/yaml-effect/commit/ca5be436369d4c809e8376b3abcbb315b27780f2) Aligns with new test harness

- [`b033f39`](https://github.com/spencerbeggs/yaml-effect/commit/b033f39df74b2d45f57338a3679521a048851cfa) Migrates compliance test harness to `@savvy-web/vitest` v1.0.0 auto-discovery API. Compliance tests now use the `.e2e.test.ts` suffix convention for automatic project classification, replacing manually configured custom projects.

* Renames `yaml-test-suite.test.ts` and `yaml-test-suite-raw.test.ts` with `.e2e.test` suffix
* Simplifies `vitest.config.ts` to use `VitestConfig.create()` with e2e kind override
* Updates compliance badge workflow to match new project structure

## 0.2.2

### Bug Fixes

* [`87b0494`](https://github.com/spencerbeggs/yaml-effect/commit/87b0494d68460edf07b920cb859ee42ffb8552a4) 1100 tests now passing

## 0.2.1

### Bug Fixes

* [`3b3765e`](https://github.com/spencerbeggs/yaml-effect/commit/3b3765e535da893f2c16162a5f75483426aab6e0) Improve YAML 1.2 compliance from 82% to 86% with stringifier and canonical output fixes.

- Strip comments in canonical/forceDefaultStyles mode
- Inline scalar values after document start marker (`--- value`)
- Place anchor/tag metadata on own line before block collections
- Fix anchor/tag ordering to canonical form (`&anchor !!tag`)
- Render empty scalars without trailing space or spurious `null`
- Add `hasDocumentEnd` tracking and `...` marker emission
- Preserve block scalar styles (literal/folded) in canonical mode
- Emit truly empty lines in block scalars (no indent whitespace)
- Indent nested block mapping values on next line
- Add space before colon for alias keys (`*a :` not `*a:`)

## 0.2.0

### Features

* [`a1c667a`](https://github.com/spencerbeggs/yaml-effect/commit/a1c667ad80d8955900a76140d74e58d64d398d05) Emit `---` document start marker when present in source
* Preserve anchor definitions (`&name`) and alias references (`*name`) in stringifyDocument
* Preserve tags (`!!type`) on AST nodes in stringifyDocument
* Preserve block-literal vs block-folded scalar styles in forceDefaultStyles mode
* Prefer single-quotes over double-quotes when no escape sequences needed
* Add `forceDefaultStyles` option to override AST node styles
* Add `hasDocumentStart` field to YamlDocument schema

### Bug Fixes

* [`a1c667a`](https://github.com/spencerbeggs/yaml-effect/commit/a1c667ad80d8955900a76140d74e58d64d398d05) Fix all 15 JSON match failures (explicit keys, multi-line plain scalars, flow mapping colons, block scalar explicit indentation, anchor/tag placement, block scoping, custom tag handles)
* Fix flow mapping colon on next line after key
* Reduce over-quoting of indicator characters (`:foo`, `?foo`, `-foo` no longer quoted)
* Fix double-indentation in block scalar content
* Use compact notation for block sequences as mapping values
* Quote strings starting with `---` or `...` document markers
* Resolve 1 XFAIL (ZXT5 now correctly rejects invalid YAML)

## 0.1.7

### Bug Fixes

* [`bff2841`](https://github.com/spencerbeggs/yaml-effect/commit/bff2841384d55dccb34dfbe4e9fd96e8f9d594d2) Fix YAML 1.2 compliance issues: block scalar document marker termination,
  multi-document stream parsing, incremental anchor resolution, flow tab
  handling, and flow collection structural validation. Resolves 9 expected
  test failures bringing filtered compliance to 100% parse pass rate.

## 0.1.6

### Bug Fixes

* [`4b7704c`](https://github.com/spencerbeggs/yaml-effect/commit/4b7704c334398d1967ca70c39e709fa4b8516b89) Adds composer-level validation to reject 25 invalid YAML inputs that the parser
  previously accepted. Implements six validation groups covering document markers,
  comment spacing, trailing content after quoted scalars and flow collections,
  nested same-line mappings, and trailing block content.

- Reject stray scalars after block mappings and sequences (236B, 6S55, 9CWY, BD7L, TD5N, 7MNF)
- Reject nested mapping indicators on the same line (ZCZ6, ZL4Z, HU3P, 2CMS, 5U3A)
- Reject trailing content after quoted scalars (Q4CL, JY7Z)
- Reject trailing content after flow collections (P2EQ, 62EZ, KS4U)
- Reject comments without preceding whitespace (9JBA, CVW2)
- Reject content on document marker lines (3HFZ, LHL4)
- Reject other invalid patterns (8XDJ, BF9H, G7JE, GDY7, GT5M)

XFAIL map reduced from 47 to 36 entries. Raw compliance: 932/1226 (was 907/1226).

## 0.1.5

### Bug Fixes

* [`1369d85`](https://github.com/spencerbeggs/yaml-effect/commit/1369d85758bc83307d608ba2df00a9b0d7d59263) Enforce YAML 1.2 directive rules, comment whitespace validation, block scalar syntax, document markers in quoted strings, and multiline implicit key rejection. Adds composer-level validation for directive placement, lexer-level validation for comment whitespace requirements, document marker detection inside quoted scalars, block scalar indent-0 rejection, and multiline implicit key detection for quoted scalars and flow context key-to-colon line alignment. Resolves 21 compliance test failures.

## 0.1.4

### Bug Fixes

* [`3275fd1`](https://github.com/spencerbeggs/yaml-effect/commit/3275fd195d170c452d6506db72494e5f8c79b4b7) Improve parse-level correctness for multiple YAML 1.2 spec compliance
  test cases, recovering 12 JSON assertion failures:

- Implicit mapping after bare sequence entry
- Multi-line plain scalar keys in flow mappings
- Alias-as-mapping-key with anchor resolution
- Anchor on empty value in block mappings
- Flow scalar line folding for trailing empty lines
- Empty block scalar with explicit indent and keep chomp
- Explicit key with comments before value separator
- Multi-line plain scalar continuation in block sequences

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
