---
"yaml-effect": patch
---

## Bug Fixes

Improve parse-level correctness for multiple YAML 1.2 spec compliance
test cases, recovering 12 JSON assertion failures:

- Implicit mapping after bare sequence entry
- Multi-line plain scalar keys in flow mappings
- Alias-as-mapping-key with anchor resolution
- Anchor on empty value in block mappings
- Flow scalar line folding for trailing empty lines
- Empty block scalar with explicit indent and keep chomp
- Explicit key with comments before value separator
- Multi-line plain scalar continuation in block sequences
