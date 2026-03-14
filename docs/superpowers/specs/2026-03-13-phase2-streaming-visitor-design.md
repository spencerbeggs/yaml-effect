# Phase 2: Streaming & Visitor — Design Spec

## Goal

Add SAX-style visitor APIs (AST and CST levels), a pull-based incremental
scanner, and multi-document/document-preserving Schema integration to
`@spencerbeggs/yaml-effect`.

## Context

Phase 1 delivered the core three-stage pipeline (Lexer, Parser, Composer),
parse/stringify, AST navigation, error types, and Schema integration. The
`lex()` and `parseCST()` functions already return Effect Streams. Phase 2 adds
higher-level streaming consumption patterns and fills gaps in Schema coverage.

The sister module `@spencerbeggs/jsonc-effect` provides the architectural
blueprint — its `visit`/`visitCollect`, `createScanner`, and schema patterns
are adapted here for YAML's richer feature set (multi-document, anchors/aliases,
tags, block/flow styles).

---

## Components

### 1. AST Visitor Events (`YamlVisitorEvent`)

**File:** `src/schemas/YamlVisitorEvent.ts`

11 event variants, each a `Schema.TaggedClass`. All share `path:
ReadonlyArray<string | number>` and `depth: number`.

| Event | Additional Fields | Emitted When |
| ------- | ------------------- | -------------- |
| `DocumentStart` | `directives: YamlDirective[]` | Document node entered |
| `DocumentEnd` | — | Document node exited |
| `MapStart` | `style: CollectionStyle`, `tag?`, `anchor?` | YamlMap entered |
| `MapEnd` | — | YamlMap exited |
| `SeqStart` | `style: CollectionStyle`, `tag?`, `anchor?` | YamlSeq entered |
| `SeqEnd` | — | YamlSeq exited |
| `Pair` | `key: unknown`, `value: unknown` | YamlPair visited (key+value together) |
| `Scalar` | `value: unknown`, `style: ScalarStyle`, `tag?`, `anchor?` | YamlScalar visited |
| `Alias` | `name: string` | YamlAlias visited |
| `Comment` | `text: string` | Comment encountered |
| `Directive` | `name: string`, `parameters: string` | YAML directive |

`YamlVisitorEvent` is a `Schema.Union` of all 11. Type guard predicates
exported: `isDocumentStartEvent`, `isScalarEvent`, `isMapStartEvent`, etc.

### 2. CST Visitor Events (`YamlCstVisitorEvent`)

**File:** `src/schemas/YamlCstVisitorEvent.ts`

Same structural events as AST but with raw source text instead of resolved
values. Key differences:

- `Scalar` carries `source: string` (raw text) instead of `value: unknown`
- No `Pair` event — CST does not pair keys and values. Replaced by separate
  `Key` and `Value` events.
- Error channel is `never` (errors embedded as error nodes)

Type guard predicates exported: `isCstScalarEvent`, `isCstMapStartEvent`, etc.

### 3. AST Visitor Functions

**File:** `src/utils/visitor.ts`

```typescript
visit(
  text: string,
  options?: Partial<YamlParseOptions>,
): Stream<YamlVisitorEvent, YamlComposerError>

visitCollect<A extends YamlVisitorEvent>(
  text: string,
  predicate: (event: YamlVisitorEvent) => event is A,
  options?: Partial<YamlParseOptions>,
): Effect<ReadonlyArray<A>, YamlComposerError>
```

**Implementation:** Parses via `parseAllDocuments`, walks the AST recursively
with a generator, yields events. Wrapped in `Stream.fromIterable` (lazy).
Multi-document inputs emit `DocumentStart`/`DocumentEnd` pairs for each
document.

Supports early termination via `Stream.take` / `Stream.takeWhile`.

### 4. CST Visitor Functions

**File:** `src/utils/cst-visitor.ts`

```typescript
visitCST(text: string): Stream<YamlCstVisitorEvent, never>

visitCSTCollect<A extends YamlCstVisitorEvent>(
  text: string,
  predicate: (event: YamlCstVisitorEvent) => event is A,
): Effect<ReadonlyArray<A>, never>
```

**Implementation:** Uses `parseCSTAll` to get CST nodes, walks them
recursively. Error channel is `never` — CST-level errors are embedded as error
nodes. No type resolution; scalars carry raw `source` text.

### 5. Incremental Scanner

**File:** `src/utils/scanner.ts`

```typescript
interface YamlScanner {
  scan(): YamlTokenKind;
  getToken(): YamlTokenKind;
  getTokenValue(): string;
  getTokenOffset(): number;
  getTokenLength(): number;
  getTokenLine(): number;
  getTokenColumn(): number;
  getPosition(): number;
  setPosition(pos: number): void;
}

function createScanner(text: string): YamlScanner
```

Pull-based, imperative, synchronous. The only mutable API in the library.

- `scan()` advances to the next token and returns its kind
- `getToken()` returns current token kind without advancing
- `getTokenValue()` returns the decoded token value
- `setPosition()` enables incremental re-scanning from a given offset

**Refactoring:** The core scanning logic in `lexer.ts` is extracted into a
shared foundation. Both `createScanner` and `lex()` build on it, eliminating
duplication.

### 6. Schema Additions

**File:** `src/utils/schema-integration.ts` (extending existing)

**`YamlAllFromString`** — Multi-document Schema:

```typescript
const YamlAllFromString: Schema.Schema<ReadonlyArray<unknown>, string>

function makeYamlAllFromString(
  options?: Partial<YamlParseOptions>,
): Schema.Schema<ReadonlyArray<unknown>, string>
```

Decode: parses multi-document YAML into an array of plain values via
`parseAllDocuments`. Encode: stringifies each value separated by `---`.

**`makeYamlDocumentSchema`** — Document-preserving Schema:

```typescript
function makeYamlDocumentSchema(
  options?: Partial<YamlParseOptions>,
): Schema.Schema<YamlDocument, string>
```

Preserves the full `YamlDocument` structure (directives, comments, errors,
warnings). Encode uses `stringifyDocument` for round-trip fidelity.

---

## File Structure

### New Files

| File | Responsibility |
| ------ | --------------- |
| `src/schemas/YamlVisitorEvent.ts` | 11 AST event TaggedClass schemas + union + type guards |
| `src/schemas/YamlCstVisitorEvent.ts` | CST event TaggedClass schemas + union + type guards |
| `src/utils/scanner.ts` | `YamlScanner` interface + `createScanner` factory |
| `src/utils/visitor.ts` | `visit` + `visitCollect` (AST-level) |
| `src/utils/cst-visitor.ts` | `visitCST` + `visitCSTCollect` (CST-level) |
| `__test__/visitor.test.ts` | AST visitor tests |
| `__test__/cst-visitor.test.ts` | CST visitor tests |
| `__test__/scanner.test.ts` | createScanner tests |

### Modified Files

| File | Change |
| ------ | -------- |
| `src/utils/lexer.ts` | Extract core scanner logic into shared foundation |
| `src/utils/schema-integration.ts` | Add `YamlAllFromString`, `makeYamlAllFromString`, `makeYamlDocumentSchema` |
| `__test__/schema-integration.test.ts` | Tests for new schema functions |
| `src/index.ts` | Add new exports |

---

## Public API Additions

```typescript
// AST Visitor
export { visit, visitCollect } from "./utils/visitor.js";
export type { YamlVisitorEvent } from "./schemas/YamlVisitorEvent.js";

// CST Visitor
export { visitCST, visitCSTCollect } from "./utils/cst-visitor.js";
export type { YamlCstVisitorEvent } from "./schemas/YamlCstVisitorEvent.js";

// Scanner
export type { YamlScanner } from "./utils/scanner.js";
export { createScanner } from "./utils/scanner.js";

// Schema additions
export {
  YamlAllFromString,
  makeYamlAllFromString,
  makeYamlDocumentSchema,
} from "./utils/schema-integration.js";
```

---

## Testing Strategy

- **Scanner:** Token-by-token scanning, seek/resume, parity with `lex()`
  output, edge cases (empty input, BOM, directives).
- **AST Visitor:** Event sequence for mappings, sequences, nested structures,
  multi-document, anchors/aliases, tags, comments, directives. `visitCollect`
  with type-narrowing predicates. Early termination via `Stream.take`.
- **CST Visitor:** Same structural coverage verifying raw `source` fields, no
  type resolution. `Key`/`Value` events instead of `Pair`. `visitCSTCollect`.
- **Schema additions:** Multi-document round-trip encode/decode,
  document-preserving parse + stringify, compose with target schemas, error
  propagation.

---

## Decisions

| Decision | Rationale |
| ---------- | --------- |
| Separate AST and CST event types | Strict typing — no optional fields, each event type is self-contained. Predicates are not interchangeable between levels. |
| CST visitor has `Key`/`Value` instead of `Pair` | CST does not structurally pair keys and values; separate events match the CST structure faithfully. |
| `createScanner` is synchronous, no Effect wrapping | Pull-based imperative API mirrors jsonc-effect pattern. Consumers who want Effect can wrap it. |
| Refactor `lexer.ts` to share scanner foundation | Eliminates duplication between `lex()` and `createScanner`. Both build on the same core logic. |
| `YamlAllFromString` encode uses `---` separators | Standard YAML multi-document separator per spec. |
| `makeYamlDocumentSchema` preserves full structure | Enables consumers who need directive/comment/warning metadata alongside parsed values. |
