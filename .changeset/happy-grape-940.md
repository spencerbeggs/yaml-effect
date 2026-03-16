---
"yaml-effect": patch
---

## Bug Fixes

Fix parser to accept valid YAML previously rejected (2JQS, HS5T, KK5P, S3PD, V9D5). Fixes include tab handling as separation whitespace in plain scalars, block sequence consumption as mapping values, and null-key value pairing in implicit block mappings. Compliance test harness now uses uniqueKeys: false to match YAML spec semantics.

Implement YAML 1.2 §6.5 flow line folding for plain, double-quoted, and single-quoted scalars. Bare newlines between non-empty lines fold to spaces, empty lines are preserved as newlines, and leading/trailing whitespace is properly trimmed. Multi-line plain scalars spanning multiple CST nodes are now correctly merged. Escape-produced content in double-quoted scalars is preserved during whitespace trimming. Fixes 18 additional compliance test assertions (3RLN, DE56, DK95/02, 4CQQ, HS5T).

Implement YAML 1.2 §8.1 block scalar folding for "more indented" lines. Lines with extra indentation beyond the base content indent preserve their newlines instead of being folded to spaces. Empty lines adjacent to more-indented content correctly produce double newlines. Zero-indent block scalars at document level (e.g., `--- >`) are now parsed correctly. Fixes 8 additional compliance test assertions (6VJK, 7T8X, MJS9, FP8R, DK3J, F6MC, 82AN, NB6Z).
