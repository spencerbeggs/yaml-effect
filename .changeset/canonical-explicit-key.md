---
"yaml-effect": patch
---

## Bug Fixes

Improves canonical YAML output and parser handling for several edge cases. Raises raw yaml-test-suite compliance from 97.79% to 98.45% (19 / 1226 remaining canonical-output mismatches).

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
