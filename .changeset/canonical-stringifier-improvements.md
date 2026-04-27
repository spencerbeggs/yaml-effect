---
"yaml-effect": patch
---

## Bug Fixes

### Canonical stringifier improvements

Raw YAML 1.2 compliance climbs from 93.3% to 97.24% (16 additional canonical-output tests pass).

- Multi-line plain and single-quoted scalars now render as single-quoted with proper YAML 1.2 §7.4 inverse line-folding when `forceDefaultStyles` is enabled. Each literal newline in the value maps to one extra source newline so the round-trip preserves the value verbatim.
- Multi-line quoted scalars are now placed inline after `: ` (mapping value) or `- ` (sequence item), with continuation lines emitted as-is. Detection uses node-type rather than output-pattern matching to avoid confusing quoted keys in nested mappings for quoted scalar continuations.
- Block-style scalars (`|` and `>`) automatically downgrade to double-quoted in canonical mode when the content has trailing whitespace on an interior line, or mixed leading whitespace (space then tab) on a continuation line — patterns that block style cannot represent unambiguously.
- The compliance test harness applies a single-doc canonical convention: scalar-rooted streams whose body is a quoted multi-line scalar drop the leading `--- ` document marker, matching libyaml canonical output.
