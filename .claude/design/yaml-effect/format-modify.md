---
title: Format and Modify
description: format, formatAndApply, modify, modifyAndApply, applyEdits, stripComments functions.
---

File: `src/utils/format.ts`

All functions use an AST-based approach: parse -> transform -> stringify.
They leverage the project's own YAML pipeline (NOT `eemeli/yaml`). All
operations target single-document YAML.

## Edit Diffing Strategy

`format()` and `modify()` compute edits by diffing the original text against
the transformed text using `computeEdits()`. The algorithm:

1. Find common prefix (characters matching from the start)
2. Find common suffix (characters matching from the end, not overlapping
   prefix)
3. If the middle region has the same number of lines in both strings, emit
   per-line edits for only the changed lines
4. Otherwise, emit a single edit covering the entire changed region

This simple approach works because both strings derive from the same AST
and share structural skeleton.

## format

```typescript
function format(
  text: string,
  options?: RawFormatOptions,
): Effect.Effect<ReadonlyArray<YamlEdit>, YamlFormatError>
```

Parses into a `YamlDocument`, applies formatting options (indent, lineWidth,
scalar/collection style, sortKeys, finalNewline, preserveComments),
stringifies back, and diffs to produce edits.

When `options.range` is set, only edits within that character range are
returned (edits must be fully contained within the range).

`RawFormatOptions` is a plain interface (not a Schema class) to avoid
requiring `YamlRange` class instances for the `range` field:

```typescript
interface RawFormatOptions {
  indent?: number;
  lineWidth?: number;
  defaultScalarStyle?: ScalarStyle;
  defaultCollectionStyle?: CollectionStyle;
  sortKeys?: boolean;
  finalNewline?: boolean;
  preserveComments?: boolean;
  range?: { offset: number; length: number };
}
```

When `preserveComments` is `false`, comments are stripped from the AST via
`stripNodeComments()` before stringifying.

## formatAndApply

```typescript
function formatAndApply(
  text: string,
  options?: RawFormatOptions,
): Effect.Effect<string, YamlFormatError>
```

Convenience: parse -> apply options -> stringify. Returns the formatted
string directly without computing a diff.

## modify

```typescript
const modify: {
  (path: YamlPath, value: unknown):
    (text: string) => Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
  (text: string, path: YamlPath, value: unknown):
    Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
}
```

`Fn.dual(3, ...)`. Parses, navigates to the path in the Document AST,
applies the change, stringifies, and diffs. Pass `undefined` as `value` to
remove the property or element.

### AST Modification Logic (`modifyNode`)

- **YamlMap**: find pair by key, then insert/replace/remove
  - `value === undefined` with existing key: splice pair out
  - `value` defined with existing key: replace pair's value node
  - `value` defined without existing key: append new `YamlPair`
  - Non-last path segment: navigate deeper into the matched pair's value
- **YamlSeq**: find item by numeric index, then set/remove/append
  - `value === undefined`: splice item out
  - `value` defined with valid index: replace item
  - `value` defined with index beyond length: append
  - Non-last path segment: navigate deeper into indexed item
- Other node types at a non-terminal segment: throws error

New values are created as `YamlScalar` with `style: "plain"` via
`jsValueToNode()`.

## modifyAndApply

```typescript
const modifyAndApply: {
  (path: YamlPath, value: unknown):
    (text: string) => Effect<string, YamlModificationError>;
  (text: string, path: YamlPath, value: unknown):
    Effect<string, YamlModificationError>;
}
```

`Fn.dual(3, ...)`. Same as `modify` but returns the modified string directly.

## applyEdits

```typescript
const applyEdits: {
  (edits: ReadonlyArray<YamlEdit>):
    (text: string) => Effect<string>;
  (text: string, edits: ReadonlyArray<YamlEdit>):
    Effect<string>;
}
```

`Fn.dual(2, ...)`. Sorts edits in reverse offset order, applies
sequentially. Pure text operation -- no parsing, never fails (error channel
is `never`). Offsets beyond string length are clamped; `offset + length`
exceeding string length is clamped to cover only existing characters.

## stripComments

```typescript
function stripComments(
  text: string,
  replaceCh?: string,
): Effect.Effect<string, YamlFormatError>
```

Two modes:

### Removal mode (no `replaceCh`)

Parses the document, strips all `comment` fields from AST nodes via
`stripNodeComments()` (recursive deep copy without comment fields), and
stringifies back. Full-line comments are removed entirely.

### Replacement mode (with `replaceCh`)

Operates directly on the raw text (no AST round-trip). Walks
character-by-character, tracking string quoting state (`inSingleQuote`,
`inDoubleQuote`), and replaces each comment character (including `#`) with
the replacement character. Newlines are preserved. This mode preserves
character offsets.

Comment detection: `#` is treated as a comment start when preceded by
space, tab, newline, or at position 0.

## Error Types

- `format`, `formatAndApply`, `stripComments` -> `YamlFormatError`
  (contains `text` and `reason`)
- `modify`, `modifyAndApply` -> `YamlModificationError` (contains `path`
  and `reason`)
- `applyEdits` -> `never` (pure text operation)
