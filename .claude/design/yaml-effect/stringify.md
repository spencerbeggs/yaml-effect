---
title: Stringify
description: How AST nodes and JS values become YAML text.
---

File: `src/utils/stringify.ts`

## Overview

The stringifier converts JavaScript values and YAML AST nodes back into
YAML text. It supports configurable formatting with block/flow styles,
scalar quoting rules, key sorting, and round-trip preservation of AST node
styles.

## Public API

```typescript
function stringify(
  value: unknown,
  options?: YamlStringifyOptions | Partial<...>,
): Effect.Effect<string, YamlStringifyError>

function stringifyDocument(
  doc: YamlDocument,
  options?: YamlStringifyOptions | Partial<...>,
): Effect.Effect<string, YamlStringifyError>
```

`stringify()` handles all JS primitives, arrays, and plain objects.
`stringifyDocument()` preserves style metadata from AST nodes (scalar
`style`, collection `style`).

Both accept `YamlStringifyOptions` with defaults: indent 2, lineWidth 80,
plain scalars, block collections, no key sorting, trailing newline.

## Scalar Rendering

### Type-Conflict Detection

Before emitting a plain scalar, the stringifier checks if the string would
be mis-resolved as a non-string type by the YAML 1.2 Core Schema. Patterns
checked: null variants, boolean variants, integers (decimal/octal/hex),
floats (decimal/inf/nan). If a conflict exists, the string is quoted.

### Quoting Rules

A string requires quoting when:

- Empty string
- Contains newlines (prefers block literal)
- Would be resolved as non-string (see above)
- Starts with a YAML indicator character (`:`, `#`, `{`, `}`, `[`, `]`,
  `,`, `&`, `*`, `?`, `|`, `-`, `<`, `>`, `=`, `!`, `%`, `@`, `` ` ``)
- Starts with space or tab
- Contains `:` or ends with `:`
- Contains `#`

### Rendering Functions

- `renderDoubleQuoted(s)` -- escapes `\`, `"`, `\n`, `\r`, `\t`
- `renderSingleQuoted(s)` -- escapes `'` as `''`
- `renderBlockLiteral(s, indent)` -- `|` with auto-chomp detection
  (`+` for trailing `\n\n`, `-` for no trailing `\n`)
- `renderBlockFolded(s, indent)` -- `>` with same chomp detection
- `renderString(s, style, indent)` -- dispatches to the appropriate
  renderer, falling back to double-quoted for unsafe styles

### Number Rendering

- `NaN` -> `.nan`
- `Infinity` -> `.inf`
- `-Infinity` -> `-.inf`
- Otherwise `String(n)`

## Collection Rendering

### Arrays

- Empty: `[]`
- Flow style: `[item1, item2]`
- Block style: `- item` entries with proper indentation for nested
  block scalars and collections

### Objects

- Empty: `{}`
- Flow style: `{key: value, key: value}`
- Block style: `key: value` entries. Block collection values go on the
  next line with indentation; block scalar headers go on the same line
  as the key.

The `isBlockCollection()` helper ensures non-empty block collections are
never placed inline after a key colon.

## AST Node Stringification

When stringifying `YamlDocument` via `stringifyDocument()`, the stringifier
reads style metadata from each AST node:

- `YamlScalar.style` determines the scalar rendering style
- `YamlMap.style` / `YamlSeq.style` determines block vs flow
- `YamlAlias` renders as `*name`
- Nodes without explicit style fall back to the options defaults

Document-level comments are prepended as `# comment\n`.

## Circular Reference Detection

The `detectCircular()` function tracks object ancestors via a `Set<object>`.
Circular references cause `YamlStringifyError`.

## Error Handling

All errors are caught and wrapped as `YamlStringifyError` with `value`
(the input) and `reason` (the error message).
