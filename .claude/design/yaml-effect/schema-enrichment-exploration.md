# Schema Enrichment: Rule-Based Node Methods via Decorators

Status: exploration
Date: 2026-03-21

## Problem

The stringifier has accumulated ad-hoc detection logic as nested
conditionals. Each compliance fix adds more branches to functions like
`stringifyScalarNodeLines`, `stringifyMapNodeLines`, and `renderString`.
The rules are correct but tightly coupled to the stringifier — they
can't be tested independently or reused by other consumers (format,
modify, equality).

Examples of inlined rules from the current codebase:

- `requiresQuoting(s, ignoreType)` — toggles type-conflict check
- `forceDefaultStyles` scalar style preservation with conditional
  downgrade
- `isMoreIndented` lookahead in folded block rendering
- Alias key space-before-colon separator logic
- Empty scalar rendering (`node.length === 0` checks)
- Anchor/tag ordering (`buildMetadataPrefix`)

Each is a rule about how a specific node behaves in context. They
belong on the node, not scattered across the stringifier.

## Approach

Use TypeScript 5.0+ stage 3 method decorators on `Schema.TaggedClass`
instances to attach pure detection functions as methods/getters. The
pure functions remain standalone for testing; decorators wire them to
the schema class.

Research confirms: method decorators work on `Schema.TaggedClass`
because the class chain uses standard `class extends` syntax. Class
decorators and field decorators on schema-defined fields do NOT work
safely.

Effect Schema annotations are schema-level (on the AST definition),
not instance-level — they cannot carry per-value metadata like indent
levels. Per-instance metadata must be actual fields on the schema.

## New Schema Fields

### YamlScalar

```typescript
// Block scalar metadata — preserved from composer, used by stringifier
blockIndent?: {
  parent: number;      // indent of the parent context (: or -)
  explicit?: number;   // explicit digit from |2 or >3 header
  content: number;     // computed content indent level
}

// Original source representation for round-trip fidelity
// Stores the raw text for scalars where JS coercion loses info
// (e.g., 450.00 → 450, 0o17 → 15, 0xFF → 255)
sourceText?: string;
```

### YamlPair

```typescript
// Whether the key was introduced by an explicit ? indicator
explicitKey: boolean;  // default: false
```

### YamlMap / YamlSeq (no new fields)

These already have `tag`, `anchor`, `style`. No new fields needed —
the behavior changes come from methods.

## Methods to Add (via Decorators)

### YamlScalar

```typescript
class YamlScalar extends Schema.TaggedClass("YamlScalar")({...}) {
  /** Whether this scalar needs quoting as a plain scalar. */
  @fromPure(requiresQuotingRule)
  needsQuoting(): boolean { ... }

  /** Whether this scalar should use double-quoted style in canonical output. */
  @fromPure(preferDoubleQuotedRule)
  preferDoubleQuoted(): boolean { ... }

  /** Compute the explicit indent indicator digit, or undefined if auto-detect suffices. */
  @fromPure(explicitIndentRule)
  computeExplicitIndent(baseIndent: number): number | undefined { ... }

  /** Whether this is an "empty" scalar (zero-length source, null/empty value). */
  get isEmpty(): boolean { ... }

  /** Render this scalar to a YAML string. */
  @fromPure(renderScalarRule)
  render(indent: string, ignoreTypeConflict?: boolean): string { ... }
}
```

### YamlPair

```typescript
class YamlPair extends Schema.TaggedClass("YamlPair")({...}) {
  /** Separator between key and colon — alias keys need space. */
  get separator(): string { ... }

  /** Whether the key requires explicit ? syntax for round-trip fidelity. */
  get needsExplicitKeyMarker(): boolean { ... }
}
```

### YamlMap

```typescript
class YamlMap extends Schema.TaggedClass("YamlMap")({...}) {
  /** Metadata prefix string (&anchor !!tag) for this map. */
  get metadataPrefix(): string | undefined { ... }
}
```

### YamlSeq

```typescript
class YamlSeq extends Schema.TaggedClass("YamlSeq")({...}) {
  /** Metadata prefix string for this sequence. */
  get metadataPrefix(): string | undefined { ... }
}
```

## Decorator Pattern

The `@fromPure` decorator wires a standalone pure function to a class
method. The pure function accepts the node's data as arguments (not
`this`), making it independently testable.

```typescript
function fromPure<T, Args extends unknown[], R>(
  pureFn: (self: T, ...args: Args) => R
) {
  return function (
    target: (this: T, ...args: Args) => R,
    context: ClassMethodDecoratorContext
  ) {
    return function (this: T, ...args: Args): R {
      return pureFn(this, ...args);
    };
  };
}
```

The pure functions live in a separate file (e.g.,
`src/utils/scalar-rules.ts`, `src/utils/map-rules.ts`) and are
exported for direct use in tests and by consumers who don't want the
class method interface.

## Pure Functions to Extract

From the current stringifier:

| Current location | Pure function | Attaches to |
| --- | --- | --- |
| `requiresQuoting(s, ignoreType)` | `scalarNeedsQuoting(scalar)` | `YamlScalar.needsQuoting()` |
| `renderString(s, style, indent, ignoreType)` | `renderScalar(scalar, indent)` | `YamlScalar.render()` |
| `renderBlockLiteral` indent indicator | `computeBlockIndent(scalar, baseIndent)` | `YamlScalar.computeExplicitIndent()` |
| `renderBlockFolded` empty line logic | folded into `renderScalar` | `YamlScalar.render()` |
| `buildMetadataPrefix(tag, anchor)` | `nodeMetadataPrefix(node)` | `YamlMap.metadataPrefix` / `YamlSeq.metadataPrefix` |
| Alias key separator logic | `pairSeparator(pair)` | `YamlPair.separator` |
| Empty scalar detection | `scalarIsEmpty(scalar)` | `YamlScalar.isEmpty` |
| `stripNodeComments(node)` | stays as utility (operates on tree) | not a method |

## Impact on Stringifier

The stringifier (`stringifyScalarNodeLines`, `stringifyMapNodeLines`,
etc.) becomes a thin orchestrator:

```typescript
// Before (current)
function stringifyScalarNodeLines(node, ctx) {
  const nodeStyle = node.style ?? ctx.defaultScalarStyle;
  let style = nodeStyle;
  // ... 15 lines of conditional style logic
  const isEmpty = node.length === 0 && (val === null || ...);
  if (isEmpty && (node.tag || node.anchor)) {
    // ... 5 lines
  }
  // ... 20 lines of value rendering
  if (node.anchor) { lines[0] = `&${node.anchor} ${lines[0]}`; }
  if (node.tag) { lines[0] = `${node.tag} ${lines[0]}`; }
  return lines;
}

// After (with methods)
function stringifyScalarNodeLines(node, ctx) {
  if (node.isEmpty && node.metadataPrefix) {
    return [node.metadataPrefix];
  }
  const rendered = node.render(" ".repeat(ctx.indent), !!node.tag);
  const lines = rendered.split("\n");
  const prefix = node.metadataPrefix;
  if (prefix) lines[0] = `${prefix} ${lines[0]}`;
  return lines;
}
```

## Effect Service Interface (Future Direction)

The current pipeline (lexer → parser → composer) can be wrapped as an
Effect Service. A future token-chain implementation could provide an
alternative:

```typescript
interface YamlProcessor {
  readonly parse: (text: string, options?: YamlParseOptions)
    => Effect<unknown, YamlComposerError>
  readonly parseDocument: (text: string, options?: YamlParseOptions)
    => Effect<YamlDocument, YamlComposerError>
  readonly stringify: (value: unknown, options?: YamlStringifyOptions)
    => Effect<string, YamlStringifyError>
}

// Current implementation
const YamlProcessorLive = Layer.succeed(YamlProcessor, {
  parse: currentParse,
  parseDocument: currentParseDocument,
  stringify: currentStringify,
})
```

This allows swapping the internal implementation without changing the
public API. The token-chain model (doubly-linked list with
context-aware getters, live recomputation on mutation) would be an
alternative implementation that provides incremental editing
capabilities.

The token-chain model treats the chain as the single source of truth:

- Each token has `next`/`previous` pointers
- Properties are computed lazily from context (walking backward)
- Inserting or removing a token cascades changes downstream
- The AST types (`YamlDocument`, `YamlNode`) become computed views
  over the chain
- No separate CST or AST — the chain IS the document representation

This is a separate design effort. The schema enrichment described
above is compatible with both the current pipeline and a future
token-chain implementation — the methods and fields work regardless
of how the data was produced.

## Migration Path

1. Add new optional fields to schemas (backward compatible)
2. Update composer to populate the new fields
3. Extract pure functions from stringifier into rule modules
4. Add methods to schema classes with `@fromPure` decorator
5. Refactor stringifier to use node methods
6. Add tests for pure functions independently
7. Update design docs to reflect new schema fields

Each step is independently shippable. Steps 1-2 immediately improve
compliance (the stringifier can use the new fields even before the
methods exist). Steps 3-6 improve maintainability. Step 7 keeps docs
current.

## Open Questions

- Should `sourceText` on YamlScalar store the raw source for ALL
  scalars, or only when the resolved value differs from the source
  (e.g., `450.00` vs `450`)? Storing all would increase memory but
  simplify logic.
- Should the `@fromPure` decorator be a project utility or published
  as a separate package? It's general-purpose.
- Should `render()` on YamlScalar accept a context object (indent,
  forceDefaultStyles, etc.) or individual parameters? A context
  object is more extensible.
