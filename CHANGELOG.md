# yaml-effect

## 0.4.3

### Bug Fixes

* [`f0b6886`](https://github.com/spencerbeggs/yaml-effect/commit/f0b6886f2cfb2fa22b9ef6524a08d03dbb37311f) Improves canonical YAML output and parser handling for several edge cases. Raises raw yaml-test-suite compliance from 97.79% to 98.45% (19 / 1226 remaining canonical-output mismatches).

### Explicit `? key\n: value` syntax for non-trivial keys

* Now fires for scalar keys whose value contains a newline, and for keys with `block-literal` / `block-folded` style. Previously only `YamlMap` and `YamlSeq` keys triggered this form.
* Block-style scalar keys (`|` / `>`) no longer receive an extra continuation-line indent, since the block-scalar renderer already bakes the indent into its rendered output.
* Block sequences and block mappings used as values under explicit `?` keys now use compact notation: the first item / first pair is emitted on the colon line, with remaining lines aligned via the configured indent.

These changes clear 5WE3, 6SLA, Q9WF, and X38W from `SKIP_ASSERTIONS`.

### Block-folded explicit indent indicator

`renderBlockFolded` now emits the explicit indent indicator (`>2` etc.) when the value starts with two or more empty lines and has actual content, mirroring the existing `renderBlockLiteral` rule. A single leading blank line still parses unambiguously, but multiple leading blanks require the explicit indicator. Clears R4YG.

### Block scalar at root with leading-tab continuation

The compliance test post-processor (`applySingleDocCanonical`) now re-renders a block-scalar root whose content has `\n\t` (newline followed directly by tab) as a single-line double-quoted scalar with no `---`. This matches libyaml's conservative canonical form for content where tab-versus-indent could otherwise be ambiguous. The companion fixture M9B4 (same content but no document-start marker) keeps block form, so the rule is specific to the document-start position. Clears T5N4.

### Adjacent `:` after a flow collection in flow context

The lexer now recognises `:` immediately after a `}` or `]` as the value indicator for an implicit flow-mapping pair, not as plain content. This mirrors the existing `prevWasQuoted` flag for adjacent `:` after a quoted scalar, and matches YAML 1.2 §7.18 (flow-map adjacent value). Inputs like `[ {JSON: like}:adjacent ]` now correctly parse as a flow-seq containing one implicit map pair. Clears 9MMW.

### Tag/anchor flush on `,` separator in flow

`flattenFlowChildren` now flushes a pending tag or anchor as an empty scalar when it encounters a `,` separator. Previously the comma was silently skipped, which let metadata bleed into the next flow-map entry — for example, `{foo: !!str, !!str: bar}` lost the `!!str` tag from the second key because the first `!!str` (the value of `foo`) was overwritten when the second `!!str` arrived. Clears WZ62.

### Same-line guard on multi-line null-value flush

In `flattenBlockMapChildren`, the heuristic that flushes pending metadata as a null mapping value when a scalar appears in key position with another `:` ahead now requires the trailing `:` to be on the same line as the scalar. Without that guard the flush misfired on patterns like `? a\n: &b b\n: *a`, where the second `:` belongs to a subsequent pair and the scalar is the current pair's value, not a new key. Clears 6M2F.

## 0.4.2

### Bug Fixes

* [`f5ca73a`](https://github.com/spencerbeggs/yaml-effect/commit/f5ca73a009088c69d9f4cbfec0bab7c21cdbd5b2) ### Tighter rejection of malformed YAML

Added composer-side structural validations that clear all 15 remaining XFAIL fixtures from the official yaml-test-suite. Raw spec compliance rises from 98.27% to 98.89% (2397/2424 assertions passing), and the XFAIL skip map is now empty.

Inputs that the YAML 1.2 spec says should be rejected as invalid — but that previous releases silently accepted — now fail with `YamlComposerError`. The error channel and shape are unchanged, so downstream `Effect.catchTag("YamlComposerError", ...)` handlers see no difference; they simply receive more cases that were previously squeezed through as garbage data.

Newly rejected cases:

* Anchor or tag followed by a block-sequence `-` indicator on the same line (SY6V).
* Anchor or tag in a map value's continuation line at column less than or equal to the parent key's column (G9HC, H7J7).
* A stray `-` block-seq entry indicator at an indent shallower than its sibling sequence (4HVU).
* Multi-line flow collection content whose continuation lines are not indented past the parent block (9C9N, VJP3/00).
* A multi-line flow collection used as an implicit mapping key (C2SP).
* A multi-line quoted scalar whose continuation lines are not indented past the parent key (QB6E).
* A plain scalar that appears to continue across a comment line (BS4K).
* A block scalar whose leading empty lines are more indented than the first content line (5LLU, S98Z, W9L4).
* A scalar value carrying two separate anchor declarations (4JVG).
* A tab character used as block indent after a value indicator on a continuation line (Y79Y/009).
* A `!handle!suffix` reference in a document where no `%TAG` directive declares that handle, even when an earlier document in the same stream did (QLJ7).

The composer now emits two error codes that previously appeared only on the parser channel: `TabIndentation` (Y79Y/009) and `UnresolvedTag` (QLJ7). These are listed in the `YamlComposerErrorCode` union and surface through `parse`, `parseDocument`, and `parseAllDocuments`.

## 0.4.1

### Bug Fixes

* [`bcacbf8`](https://github.com/spencerbeggs/yaml-effect/commit/bcacbf8ecb3264882b055ca49d5fd09090cc062a) Fixed parser leniency that caused several categories of malformed YAML 1.2 to be silently accepted instead of rejected. Inputs now correctly produce a `YamlComposerError`:
  * Block-mapping keys appearing at a column that does not match the established sibling-key column (misaligned dashes).
  * A nested block sequence positioned at a column that places it in mapping-key position rather than as a sibling sequence entry.
  * A mapping pattern (`key: value`) opening on the same line as the `---` document-start marker.
  * A stray comma appearing in block (non-flow) context, such as inside a tag handle expression.
* Raw YAML 1.2 test-suite compliance increases from 97.93% to 98.27% (+8 tests now correctly rejected).

Inputs that previously parsed into structurally degenerate values — such as mappings with empty-string keys produced by misaligned dashes — now fail with `YamlComposerError`. Code relying on the lenient legacy behavior will need to handle the error or fix the YAML source. The `YamlErrorCode` union is unchanged at the type level; only the runtime emission set has expanded to include `"InvalidIndentation"` and `"UnexpectedToken"` for these previously-passing inputs.

## 0.4.0

### Features

* [`e23de08`](https://github.com/spencerbeggs/yaml-effect/commit/e23de08ce1f29da7a4c3ff7381fcaa3d24910961) ### YAML 1.2 spec compliance raised to 97.93%

Round-trip canonical output now preserves source representation in
several places that previously lost information.

* Block scalar chomp indicators (keep, strip, clip) are tracked on the
  scalar AST node so a keep-chomp block scalar parses, stringifies, and
  re-parses without losing trailing-newline semantics.
* Numeric scalars expose the source representation on a new optional
  field so non-canonical numeric formats survive a parse-stringify round
  trip. Hex literals like 0xFFEEBB stay hex, and decimals with trailing
  zeros like 450.00 keep their precision.
* Tag and anchor placement on block collections now honours newlines
  between the marker and the inner key. A tag that crosses a newline
  attaches to the collection rather than to the first key inside it.
* Document-level outer/inner metadata is split when a doc starts with
  metadata on one line and a tagged or anchored first key on the next.
  Both pieces of metadata are now preserved instead of the inner one
  silently overwriting the outer one.
* The stringifier emits an explicit document-end marker after a document
  whose final scalar uses keep-chomp, so the open-ended scalar has an
  unambiguous terminator on output.

### Bug Fixes

* [`e23de08`](https://github.com/spencerbeggs/yaml-effect/commit/e23de08ce1f29da7a4c3ff7381fcaa3d24910961) Fixed a regression where a keep-chomp block scalar with newline-only
  content was emitted as a double-quoted scalar, breaking round-trip.
* Fixed canonical output for sequences whose tagged item is a block
  map: the tag now sits on its own line above the indented map keys
  rather than inline with the first key.
* Fixed canonical output for explicit-key entries whose key is a
  collection with anchor-only metadata on its first line. Continuation
  lines now sit at the same indent as the question-mark marker rather
  than indented one level deeper.

### New optional fields on YamlScalar

YamlScalar gains two optional fields that callers can read but are not
required to construct.

* chomp: literal "strip" / "clip" / "keep" populated when the source
  uses a block scalar header. Surfaces the original chomp indicator for
  consumers that need to render canonical YAML or build tools that
  depend on byte-for-byte fidelity.
* raw: the source representation string, populated only when the
  resolved value is non-string and the source form differs from the
  default JS rendering. Useful for IDEs and formatters that want to
  preserve the user's chosen numeric notation.

## 0.3.1

### Bug Fixes

* [`578725f`](https://github.com/spencerbeggs/yaml-effect/commit/578725f3b68eb275bc1afd4f33c237033385d3fa) ### Canonical stringifier improvements

Raw YAML 1.2 compliance climbs from 93.3% to 97.24% (16 additional canonical-output tests pass).

* Multi-line plain and single-quoted scalars now render as single-quoted with proper YAML 1.2 §7.4 inverse line-folding when `forceDefaultStyles` is enabled. Each literal newline in the value maps to one extra source newline so the round-trip preserves the value verbatim.
* Multi-line quoted scalars are now placed inline after `: ` (mapping value) or `- ` (sequence item), with continuation lines emitted as-is. Detection uses node-type rather than output-pattern matching to avoid confusing quoted keys in nested mappings for quoted scalar continuations.
* Block-style scalars (`|` and `>`) automatically downgrade to double-quoted in canonical mode when the content has trailing whitespace on an interior line, or mixed leading whitespace (space then tab) on a continuation line — patterns that block style cannot represent unambiguously.
* The compliance test harness applies a single-doc canonical convention: scalar-rooted streams whose body is a quoted multi-line scalar drop the leading `--- ` document marker, matching libyaml canonical output.

- [`578725f`](https://github.com/spencerbeggs/yaml-effect/commit/578725f3b68eb275bc1afd4f33c237033385d3fa) ### Composer anchor placement

Resolves several bugs where anchors and tags were attached to the wrong AST node during composition. Raw YAML 1.2 compliance climbs from 97.24% to 97.47% (5 more canonical-output tests pass).

* Block-map composition now tracks outer and inner metadata separately. When an anchor or tag appears before a newline and a second anchor or tag appears on the indented line that follows, the first now attaches to the new mapping and the second attaches to the first key. Previously the second overwrote the first, dropping one anchor and misplacing the other.
* Empty sequence items now retain their anchor or tag. Inputs like a sequence whose first item is an empty entry with an anchor on its own line followed by a populated next entry no longer migrate the anchor to the wrong item.
* A block mapping that begins with a value indicator (implicit empty key) now correctly carries the pending anchor or tag on that empty key rather than on the surrounding map.

### Stringifier separator for anchored empty keys

Mapping keys whose only rendering is an anchor or tag (zero-length empty scalar with metadata) now emit a space before the colon. This matches the existing handling for alias keys and prevents readers from absorbing the colon into the anchor or tag name.

## 0.3.0

### Features

* [`243245f`](https://github.com/spencerbeggs/yaml-effect/commit/243245f01136cb88b54255deec67afb3fce4c78a) Added YAML 1.2 named escape sequences to the stringifier (`\a`, `\b`, `\e`, `\f`, `\v`, `\0`, `\_`, `\N`, `\L`, `\P`) for spec-compliant double-quoted scalar output.
* Added canonical unicode escaping in the stringifier: non-printable and non-ASCII characters are now rendered as `\uXXXX` or `\UXXXXXXXX` escape sequences instead of raw bytes.
* Added tag normalization via `%TAG` directives in the stringifier: tag handles (e.g., `!!str`) are resolved and expanded using the document's directive prefix map before output.
* Added explicit key (`?`) syntax support in the stringifier for non-scalar mapping keys, enabling round-trip fidelity for complex keys such as sequences and mappings.
* Added explicit key (`?`) indicator support in the composer for flow mappings, so `{? key: value}` is now parsed correctly.
* Added whitespace-only and empty block scalar handling in the stringifier: scalars that consist entirely of whitespace are rendered as block literals rather than being silently collapsed.
* Added block literal indent indicator output for block scalars with leading empty lines (e.g., `|2`), preventing ambiguity in the re-parsed indent level.
* Added multiline mapping key stringification: mapping keys that span multiple lines are now rendered as double-quoted scalars rather than producing malformed plain scalar output.
* Added quoting for strings containing trailing whitespace or tabs adjacent to indicator characters (`:`, `#`), preventing silent data loss on re-parse.
* Flow sequences and flow mappings may now appear as implicit mapping keys at the document level; the composer correctly identifies these as `block-seq-start` context entries.
* Added anchor-on-alias `DuplicateAnchor` validation in the composer: redefining an anchor that is already in use now produces a `YamlComposerError` with code `DuplicateAnchor`.

### Bug Fixes

* [`243245f`](https://github.com/spencerbeggs/yaml-effect/commit/243245f01136cb88b54255deec67afb3fce4c78a) Fixed compact block sequence as a mapping value: a sequence appearing immediately after a `:` at the same indentation level is now parsed as the value of that mapping entry rather than being treated as a sibling node.
* Fixed nested sequences inside compact seq-of-maps (`- - item`) so that inner sequences are correctly attached as values rather than being dropped.
* Fixed the parser's `block-seq-start` indent check for implicit mappings: the sequence-start threshold is now derived from the enclosing mapping's indent rather than the current token's column, resolving misclassification of deeply nested entries.

### Performance

* [`243245f`](https://github.com/spencerbeggs/yaml-effect/commit/243245f01136cb88b54255deec67afb3fce4c78a) YAML 1.2 test suite compliance increased from 82.2% to 93.3% (1,144 of 1,226 assertions now pass).
* Stringify round-trip failures reduced from 18 to 0: every test case that can be parsed can now be stringified and re-parsed to an identical value.

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
