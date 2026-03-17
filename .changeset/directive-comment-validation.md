---
"yaml-effect": patch
---

## Bug Fixes

Enforce YAML 1.2 directive rules and comment whitespace validation. Adds composer-level validation for directive placement (duplicate %YAML, missing document-start marker, directive after content without document-end marker) and lexer-level validation for comment whitespace requirements (# after quoted scalars, invalid text after block scalar indicators). Resolves 13 compliance test failures.
