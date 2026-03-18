---
"yaml-effect": patch
---

## Bug Fixes

Fix YAML 1.2 compliance issues: block scalar document marker termination,
multi-document stream parsing, incremental anchor resolution, flow tab
handling, and flow collection structural validation. Resolves 9 expected
test failures bringing filtered compliance to 100% parse pass rate.
