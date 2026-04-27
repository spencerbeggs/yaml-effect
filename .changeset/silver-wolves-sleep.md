---
"yaml-effect": patch
---

## Bug Fixes

- Fixed parser leniency that caused several categories of malformed YAML 1.2 to be silently accepted instead of rejected. Inputs now correctly produce a `YamlComposerError`:
  - Block-mapping keys appearing at a column that does not match the established sibling-key column (misaligned dashes).
  - A nested block sequence positioned at a column that places it in mapping-key position rather than as a sibling sequence entry.
  - A mapping pattern (`key: value`) opening on the same line as the `---` document-start marker.
  - A stray comma appearing in block (non-flow) context, such as inside a tag handle expression.
- Raw YAML 1.2 test-suite compliance increases from 97.93% to 98.27% (+8 tests now correctly rejected).

Inputs that previously parsed into structurally degenerate values — such as mappings with empty-string keys produced by misaligned dashes — now fail with `YamlComposerError`. Code relying on the lenient legacy behavior will need to handle the error or fix the YAML source. The `YamlErrorCode` union is unchanged at the type level; only the runtime emission set has expanded to include `"InvalidIndentation"` and `"UnexpectedToken"` for these previously-passing inputs.
