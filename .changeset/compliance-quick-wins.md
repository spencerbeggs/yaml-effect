---
"yaml-effect": patch
---

## Bug Fixes

- Fix tagged empty values: flush pending tag/anchor metadata as empty scalar when no value follows (e.g., `!!str` in flow maps and sequences)
- Allow colon and other spec-permitted characters in anchor/alias names per YAML 1.2 `ns-anchor-char`
- Preserve trailing whitespace-only lines in literal block scalars per spec section 8.1.3
- Use `parseAllDocuments` for multi-document compliance test cases
