---
title: Equality
description: equals and equalsValue comparison functions.
status: current
module: yaml-effect
category: architecture
created: 2026-03-14
updated: 2026-03-14
last-synced: 2026-03-14
completeness: 90
related:
  - architecture.md
  - parsing.md
  - format-modify.md
dependencies:
  - parsing.md
---

File: `src/utils/equality.ts`

Semantic equivalence comparison for YAML documents. Compares parsed values
ignoring comments, whitespace, formatting, and mapping key ordering.
Sequence order IS significant.

## equals

```typescript
const equals: {
  (that: string): (self: string) => Effect<boolean, YamlComposerError>;
  (self: string, that: string): Effect<boolean, YamlComposerError>;
}
```

`Fn.dual(2, ...)`. Parses both YAML strings via `parse()` (which resolves
anchors/aliases to plain JS values), then deep compares. For multi-document
input, only the first document is compared.

## equalsValue

```typescript
const equalsValue: {
  (value: unknown): (self: string) => Effect<boolean, YamlComposerError>;
  (self: string, value: unknown): Effect<boolean, YamlComposerError>;
}
```

`Fn.dual(2, ...)`. Parses the YAML string, then deep compares against the
provided JavaScript value. Only the YAML string is parsed; the JS value is
used as-is.

## Deep Equality Algorithm (`deepEqual`)

Internal recursive structural comparison:

- `a === b` -> `true` (handles primitives, same reference)
- Both `NaN` -> `true` (special case since `NaN !== NaN`)
- Either `null` -> `false` (unless both null, caught by `===`)
- Different `typeof` -> `false`
- Arrays: same length, element-by-element recursive comparison (order
  matters)
- Objects: same number of keys, every key in `a` exists in `b` with
  recursively equal values (key order ignored)
- All other cases -> `false`

## Design Decisions

- **Anchor resolution before comparison**: `parse()` resolves
  anchors/aliases, so aliased structures are compared by their expanded
  values. This is consistent with semantic comparison intent.
- **Key order ignored**: YAML mappings are unordered by spec. Two documents
  `{a: 1, b: 2}` and `{b: 2, a: 1}` are considered equal.
- **Sequence order significant**: YAML sequences are ordered. `[1, 2]` and
  `[2, 1]` are NOT equal.
- **First document only**: For multi-document input, only the first
  document's parsed value is compared.
- **Error channel**: Both functions fail with `YamlComposerError` if either
  input cannot be parsed.
