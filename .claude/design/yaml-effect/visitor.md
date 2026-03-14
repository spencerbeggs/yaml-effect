---
title: Visitor
description: AST and CST visitor pattern, event types, and streaming.
status: current
module: yaml-effect
category: architecture
created: 2026-03-14
updated: 2026-03-14
last-synced: 2026-03-14
completeness: 80
related:
  - architecture.md
  - schemas.md
  - parsing.md
dependencies:
  - parsing.md
  - schemas.md
---

Two SAX-style visitor APIs operate at different levels of the YAML
processing pipeline: AST-level (resolved values) and CST-level (raw source
text).

## AST Visitor (`src/utils/visitor.ts`)

### visit

```typescript
function visit(
  text: string,
  options?: Partial<YamlParseOptions>,
): Stream.Stream<YamlVisitorEvent, YamlComposerError>
```

Parses the text via `parseAllDocuments()`, then walks the AST recursively
with generators (`walkDocument` -> `walkNode` -> `walkPair`), yielding
events. Wrapped in `Stream.fromIterable` for lazy evaluation.

Multi-document inputs emit `DocumentStart`/`DocumentEnd` pairs for each
document. Supports early termination via `Stream.take` / `Stream.takeWhile`.

### visitCollect

```typescript
function visitCollect<A>(
  text: string,
  predicate: (event: YamlVisitorEvent) => Option.Option<A>,
  options?: Partial<YamlParseOptions>,
): Effect.Effect<ReadonlyArray<A>, YamlComposerError>
```

Runs the visit stream to completion, keeping only events where the
predicate returns `Option.some(value)`. Supports both filtering (return
`Option.some(event)` for matching events) and transformation (return
`Option.some(extractedValue)` to map events).

### Event Emission Order

For a mapping like `{a: 1, b: [2, 3]}`:

1. `DocumentStartEvent`
2. `MapStartEvent` (style: "flow")
3. `PairEvent` (key: "a", value: 1)
4. `ScalarEvent` (value: "a") -- key
5. `ScalarEvent` (value: 1) -- value
6. `PairEvent` (key: "b", value: null) -- complex value, null placeholder
7. `ScalarEvent` (value: "b") -- key
8. `SeqStartEvent` (style: "flow")
9. `ScalarEvent` (value: 2)
10. `ScalarEvent` (value: 3)
11. `SeqEndEvent`
12. `MapEndEvent`
13. `DocumentEndEvent`

Comments on nodes are emitted as `CommentEvent` before the node's own
event. Directives are emitted as individual `DirectiveEvent` entries before
`DocumentStartEvent`.

### PairEvent Semantics

The `PairEvent` carries resolved `key` and `value` fields. For scalar
values these are the resolved JS values. For complex values (maps,
sequences), `value` is `null` -- consumers should process the subsequent
sub-events to reconstruct the structure.

## CST Visitor (`src/utils/cst-visitor.ts`)

### visitCST

```typescript
function visitCST(text: string): Stream.Stream<YamlCstVisitorEvent, never>
```

Parses via `parseCSTAll()`, then walks CST nodes with generators. Error
channel is `never` -- CST errors are emitted as `CstErrorEvent`.

### visitCSTCollect

```typescript
function visitCSTCollect<A>(
  text: string,
  predicate: (event: YamlCstVisitorEvent) => Option.Option<A>,
): Effect.Effect<ReadonlyArray<A>, never>
```

Same pattern as `visitCollect` but at the CST level.

### CST Structure Notes

The parser produces a CST where block-map nodes do NOT include their first
key scalar. The first key appears as a sibling node immediately before the
block-map node. For `name: John`, the document children are:

- `flow-scalar("name")` -- the key (outside the block-map)
- `block-map(": John")` -- children start with the `:` indicator and value

The CST visitor detects this "scalar followed by block-map" sibling pattern
and emits the scalar as a `CstKeyEvent`.

### Block Map Children State Machine

Inside a `block-map` node, scalars alternate between key and value roles:

- Initially `expectingKey = false` (first non-trivia scalar is a value,
  because the key was consumed as a sibling)
- After each value scalar or collection, toggle to expecting key
- After each key scalar, toggle to expecting value
- Nested block-maps as values reset to expecting key afterward

### Flow Map Children

Flow maps include all content as children (brackets, separators, scalars).
Structural punctuation is typed as `whitespace` in the CST. Scalars
alternate key/value starting with key (`expectingKey = true` initially).

### Key Differences from AST Visitor

- All content is `source: string` (raw text, no type resolution)
- No `Pair` event -- uses separate `Key` and `Value` events
- `Error` event for CST error nodes
- Error channel is `never`
- No parse options parameter (CST parsing has no configurable behavior)
