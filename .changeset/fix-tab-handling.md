---
"yaml-effect": patch
---

## Bug Fixes

- Fix tab handling in lexer and composer for YAML 1.2 compliance
  - Allow backslash-tab escape (`\<TAB>`) in double-quoted scalars
  - Allow tabs on blank separator lines and before flow-opening indicators
  - Reject tabs after block indicators (`-`, `?`, `:`)
  - Reject mixed tab+space indentation in block context
  - Reject tabs on continuation lines in double-quoted scalars
  - Propagate error CST nodes through all composer functions

Fixes 17 yaml-test-suite compliance failures (9 valid YAML + 8 invalid YAML).
