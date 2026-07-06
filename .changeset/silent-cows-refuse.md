---
"yaml-effect": patch
---

## Performance

* Fixed O(n²) composition on large documents by precomputing a line-start offset index once per document and binary-searching it, instead of rescanning from offset 0 for every AST node's line/column lookup. A 468KB `pnpm-lock.yaml` now parses in ~1.9s, down from ~12.5s. No API or behavioral changes — line/column results are unchanged.
