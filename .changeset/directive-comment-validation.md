---
"yaml-effect": patch
---

## Bug Fixes

Enforce YAML 1.2 directive rules, comment whitespace validation, block scalar syntax, document markers in quoted strings, and multiline implicit key rejection. Adds composer-level validation for directive placement, lexer-level validation for comment whitespace requirements, document marker detection inside quoted scalars, block scalar indent-0 rejection, and multiline implicit key detection for quoted scalars and flow context key-to-colon line alignment. Resolves 21 compliance test failures.
