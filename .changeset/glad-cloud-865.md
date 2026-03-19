---
"yaml-effect": minor
---

## Bug Fixes

- Fix all 15 JSON match failures (explicit keys, multi-line plain scalars, flow mapping colons, block scalar explicit indentation, anchor/tag placement, block scoping, custom tag handles)
- Fix flow mapping colon on next line after key
- Reduce over-quoting of indicator characters (`:foo`, `?foo`, `-foo` no longer quoted)
- Fix double-indentation in block scalar content
- Use compact notation for block sequences as mapping values
- Quote strings starting with `---` or `...` document markers
- Resolve 1 XFAIL (ZXT5 now correctly rejects invalid YAML)

## Features

- Emit `---` document start marker when present in source
- Preserve anchor definitions (`&name`) and alias references (`*name`) in stringifyDocument
- Preserve tags (`!!type`) on AST nodes in stringifyDocument
- Preserve block-literal vs block-folded scalar styles in forceDefaultStyles mode
- Prefer single-quotes over double-quotes when no escape sequences needed
- Add `forceDefaultStyles` option to override AST node styles
- Add `hasDocumentStart` field to YamlDocument schema
