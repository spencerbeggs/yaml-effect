---
"yaml-effect": patch
---

## Bug Fixes

Fix parser to accept valid YAML previously rejected (2JQS, HS5T, KK5P, S3PD, V9D5). Fixes include tab handling as separation whitespace in plain scalars, block sequence consumption as mapping values, and null-key value pairing in implicit block mappings. Compliance test harness now uses uniqueKeys: false to match YAML spec semantics.
