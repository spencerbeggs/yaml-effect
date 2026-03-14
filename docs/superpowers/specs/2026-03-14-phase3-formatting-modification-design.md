# Phase 3: Formatting & Modification — Design Spec

## Goal

Add non-destructive YAML formatting, path-based modification, semantic
equality comparison, and comment stripping to `@spencerbeggs/yaml-effect`.
All operations use an AST-based approach (parse → transform → stringify)
leveraging `eemeli/yaml`'s round-trip Document support.

## Architecture

Two new utility files following the existing `src/utils/` pattern. All
functions return Effect values with typed errors. `Fn.dual` calling
conventions for functions where data-first/data-last disambiguation is
unambiguous (2-arg functions like `equals`, `equalsValue`, `applyEdits`).
`format`, `formatAndApply`, and `stripComments` are plain functions (not
dual) since text is always the primary input — consistent with `stringify`.
`modify` and `modifyAndApply` use `Fn.dual(3, ...)` with 3 required
parameters in the data-first form (text, path, value) — no optional
trailing parameters to avoid arity ambiguity.

All operations target single-document YAML. Multi-document streams are not
supported by `format`, `modify`, or `stripComments`. `equals` and
`equalsValue` compare the first document only.

No new schemas or error types are needed — `YamlEdit`, `YamlRange`,
`YamlFormattingOptions`, `YamlFormatError`, `YamlModificationError`, and
`YamlComposerError` already exist.

## File Map

### New Files

| File | Purpose |
| ---- | ------- |
| `src/utils/format.ts` | format, formatAndApply, modify, modifyAndApply, applyEdits, stripComments |
| `src/utils/equality.ts` | equals, equalsValue |
| `__test__/format.test.ts` | Tests for format.ts |
| `__test__/equality.test.ts` | Tests for equality.ts |

### Modified Files

| File | Change |
| ---- | ------ |
| `src/index.ts` | Export all 8 new public functions |

## API Design

### `src/utils/format.ts`

#### `format`

```typescript
format(
  text: string,
  options?: Partial<YamlFormattingOptions>,
): Effect.Effect<ReadonlyArray<YamlEdit>, YamlFormatError>
```

Parses text into a Document, applies formatting options (indent, lineWidth,
scalar/collection style, sortKeys, finalNewline, preserveComments), stringifies
back, and diffs original vs formatted to produce edits. When `options.range`
is set, only edits within that range are returned. Fails with `YamlFormatError`
if the input cannot be parsed.

#### `formatAndApply`

```typescript
formatAndApply(
  text: string,
  options?: Partial<YamlFormattingOptions>,
): Effect.Effect<string, YamlFormatError>
```

Convenience combining parse → apply options → stringify. Returns the formatted
string directly without computing a diff.

#### `modify`

```typescript
modify: {
  (
    path: YamlPath,
    value: unknown,
  ): (text: string) => Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
  (
    text: string,
    path: YamlPath,
    value: unknown,
  ): Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
}
```

`Fn.dual(3, ...)`. Parses, navigates to the path in the Document AST, sets
the value (or removes if `undefined`), stringifies, and diffs to produce
edits. Fails with `YamlModificationError` if the path cannot be navigated.

#### `modifyAndApply`

```typescript
modifyAndApply: {
  (
    path: YamlPath,
    value: unknown,
  ): (text: string) => Effect.Effect<string, YamlModificationError>;
  (
    text: string,
    path: YamlPath,
    value: unknown,
  ): Effect.Effect<string, YamlModificationError>;
}
```

`Fn.dual(3, ...)`. Same as `modify` but returns the modified string
directly.

#### `applyEdits`

```typescript
applyEdits: {
  (edits: ReadonlyArray<YamlEdit>): (text: string) => Effect.Effect<string>;
  (text: string, edits: ReadonlyArray<YamlEdit>): Effect.Effect<string>;
}
```

`Fn.dual`. Sorts edits in reverse offset order, applies sequentially. Pure
text operation — no parsing, never fails (error channel is `never`). Edits
with offsets beyond string length are clamped to the string boundary. If
`offset + length` exceeds string length, length is clamped so the edit
only covers characters that exist.

#### `stripComments`

```typescript
stripComments(
  text: string,
  replaceCh?: string,
): Effect.Effect<string, YamlFormatError>
```

Parses, removes all comment tokens, stringifies back. With `replaceCh`
(a single character), replaces each character of comment text (including
the `#` marker) with the given character to preserve character offsets.
Newlines are always preserved — for full-line comments without `replaceCh`,
the entire line (including newline) is removed; with `replaceCh`, the
comment characters are replaced but the newline is kept. Fails with
`YamlFormatError` if the input cannot be parsed.

### `src/utils/equality.ts`

#### `equals`

```typescript
equals: {
  (that: string): (self: string) => Effect.Effect<boolean, YamlComposerError>;
  (self: string, that: string): Effect.Effect<boolean, YamlComposerError>;
}
```

`Fn.dual`. Parses both YAML strings via `parse()` from `composer.ts` (which
resolves anchors/aliases to plain JS values), then deep compares. Mapping key
order is ignored; sequence order is respected. For multi-document input, only
the first document is compared. Fails with `YamlComposerError` if either
input cannot be parsed.

#### `equalsValue`

```typescript
equalsValue: {
  (value: unknown): (self: string) => Effect.Effect<boolean, YamlComposerError>;
  (self: string, value: unknown): Effect.Effect<boolean, YamlComposerError>;
}
```

`Fn.dual`. Parses the YAML string, resolves anchors/aliases, deep compares
against the provided JavaScript value. Same comparison semantics as `equals`.
Fails with `YamlComposerError` if the input cannot be parsed.

### Internal Helpers

**`deepEqual(a: unknown, b: unknown): boolean`** in `equality.ts` — recursive
structural comparison applied at all nesting levels. Objects compared with
unordered keys (recursively), arrays with ordered elements (recursively),
primitives with strict equality.

## Design Decisions

### AST-Based Approach

All operations parse → transform → stringify rather than operating at the text
or scanner level. This is simpler to implement, more robust (handles anchors,
aliases, complex keys, multi-line scalars), and leverages `eemeli/yaml`'s
round-trip Document support for comment and style preservation. The trade-off
is that the entire document is round-tripped even for small changes, but YAML
documents are typically small config files where this is not a concern.

### Edit Diffing Strategy

`format()` and `modify()` compute edits by diffing the original text against
the transformed text using a character-level scan. The algorithm walks both
strings in parallel, identifies contiguous regions that differ, and emits
one `YamlEdit` per changed region (offset = start of change in original,
length = number of original characters replaced, content = replacement text
from the transformed string). No external diff library is needed — the
simple scan is sufficient because both strings derive from the same AST
and share the same structural skeleton.

### Anchor Resolution in Equality

`equals()` resolves anchors/aliases before comparing because the purpose is
semantic comparison — whether two documents represent the same data. This is
consistent with how `parse()` already resolves aliases.

### Error Types

- `format`, `formatAndApply`, `stripComments` → `YamlFormatError` (formatting
  context)
- `modify`, `modifyAndApply` → `YamlModificationError` (path navigation
  context)
- `equals`, `equalsValue` → `YamlComposerError` (parse failure context)
- `applyEdits` → `never` (pure text operation)

### No New Schemas

All required schemas (`YamlEdit`, `YamlRange`, `YamlFormattingOptions`) and
error types (`YamlFormatError`, `YamlModificationError`) were created in
Phase 1 anticipating this phase.

## Dependencies

- `format.ts` depends on: `yaml` (eemeli/yaml Document, parseDocument,
  stringify), existing schemas (`YamlFormattingOptions`, `YamlEdit`,
  `YamlRange`, `YamlPath`), existing errors (`YamlFormatError`,
  `YamlModificationError`)
- `equality.ts` depends on: `parse()` from `composer.ts`, existing error
  (`YamlComposerError`)

## Testing Strategy

### `__test__/format.test.ts`

- `format`: produces correct edits for re-indentation, style normalization,
  key sorting, final newline; range-restricted formatting; preserveComments
  toggle; error on invalid input
- `formatAndApply`: returns formatted string matching `format` + `applyEdits`
- `modify`: insert new key, replace existing value, remove key (value
  `undefined`), nested path navigation, array index modification; error on
  invalid path
- `modifyAndApply`: returns modified string matching `modify` + `applyEdits`
- `applyEdits`: reverse offset ordering, insert/delete/replace edits, empty
  edit list, pipeline usage
- `stripComments`: removes inline and full-line comments, replaceCh preserves
  offsets, error on invalid input

### `__test__/equality.test.ts`

- `equals`: identical documents, different formatting same data, different key
  order same data, different sequence order different data, anchor/alias
  resolution, error on invalid input, pipeline usage
- `equalsValue`: YAML string vs JS object, same comparison semantics as equals,
  pipeline usage
