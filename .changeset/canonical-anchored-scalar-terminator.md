---
"yaml-effect": patch
---

## Bug Fixes

- `stringifyDocument` now emits an explicit `...` document-end terminator in canonical mode (`forceDefaultStyles: true`) when the document root is an anchored plain scalar with explicit `---`. Without the terminator the anchor risks absorbing trailing input as part of the scalar value. Resolves the KSS4 yaml-test-suite case (multi-document stream where the second document is an anchored plain scalar like `--- &node foo`).
- `applySingleDocCanonical` (compliance test helper) now drops the `--- ` prefix for single-line single-quoted scalar roots whose content begins with `---` (e.g. `'---word1 word2'`). The quoted form already self-delimits, matching libyaml's canonical emitter behaviour. Resolves the EXG3 yaml-test-suite case.
