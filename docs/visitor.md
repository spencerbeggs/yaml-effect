# Visitor

SAX-style streaming traversal of YAML documents at both the AST and CST levels.
Visitors emit a `Stream` of events in document order, enabling lazy processing
with early termination.

## AST Visitor

### `visit(text, options?)`

Walks a YAML text string and emits a `Stream` of `YamlVisitorEvent` values.
The stream is lazy -- only events up to the point of consumption are generated.

```typescript
import { Effect, Stream } from "effect";
import type { YamlVisitorEvent } from "yaml-effect";
import { visit } from "yaml-effect";

const yaml = "name: John\nage: 30\ntags:\n  - admin\n  - user\n";

const program = Effect.gen(function* () {
  const events: ReadonlyArray<YamlVisitorEvent> = yield* Stream.runCollect(
    visit(yaml)
  ).pipe(Effect.map((chunk) => [...chunk]));

  for (const event of events) {
    console.log(event._tag);
  }
});

Effect.runSync(program);
```

### `visitCollect(text, predicate, options?)`

Walks a YAML text string and collects the results of applying `predicate` to
each event. Only events for which the predicate returns `Option.some(value)` are
included in the result.

```typescript
import { Effect, Option } from "effect";
import { isScalarEvent, visitCollect } from "yaml-effect";

const yaml = "name: John\nage: 30\n";

const program = Effect.gen(function* () {
  const values = yield* visitCollect(yaml, (event) =>
    isScalarEvent(event) ? Option.some(event.value) : Option.none()
  );
  console.log(values);
  // ["name", "John", "age", 30]
});

Effect.runSync(program);
```

### AST Event Types

| Event | Description | Key Fields |
| ----- | ----------- | ---------- |
| `DocumentStartEvent` | Entering a document | `directives` |
| `DocumentEndEvent` | Exiting a document | -- |
| `MapStartEvent` | Entering a mapping | `style`, `tag`, `anchor` |
| `MapEndEvent` | Exiting a mapping | -- |
| `SeqStartEvent` | Entering a sequence | `style`, `tag`, `anchor` |
| `SeqEndEvent` | Exiting a sequence | -- |
| `ScalarEvent` | A scalar value | `value`, `style`, `tag`, `anchor` |
| `PairEvent` | A key-value pair | `key`, `value` |
| `AliasEvent` | An alias reference | `name` |
| `CommentEvent` | A comment | `text` |
| `DirectiveEvent` | A directive | `name`, `parameters` |

All events carry `path` (an array of string keys and numeric indices from the
document root) and `depth` (zero-based nesting level).

### AST Type Guards

Use these functions to narrow a `YamlVisitorEvent` to a specific variant.

```typescript
import { isScalarEvent, isMapStartEvent, isPairEvent } from "yaml-effect";
```

Available type guards:

- `isDocumentStartEvent`
- `isDocumentEndEvent`
- `isMapStartEvent`
- `isMapEndEvent`
- `isSeqStartEvent`
- `isSeqEndEvent`
- `isScalarEvent`
- `isPairEvent`
- `isAliasEvent`
- `isCommentEvent`
- `isDirectiveEvent`

## CST Visitor

### `visitCST(text)`

Walks YAML source text at the CST level and emits a `Stream` of
`YamlCstVisitorEvent` values. All content is delivered as raw source strings --
no type resolution occurs. CST-level errors are surfaced as `CstErrorEvent`
nodes rather than stream failures, so the error channel is always `never`.

```typescript
import { Effect, Stream } from "effect";
import { isCstKeyEvent, visitCST } from "yaml-effect";

const yaml = "name: John\nage: 30\n";

const program = Effect.gen(function* () {
  const events = yield* Stream.runCollect(visitCST(yaml)).pipe(
    Effect.map((chunk) => [...chunk])
  );

  for (const event of events) {
    if (isCstKeyEvent(event)) {
      console.log("Key:", event.source);
    }
  }
});

Effect.runSync(program);
```

### `visitCSTCollect(text, predicate)`

Collects matching CST events, analogous to `visitCollect` for the AST level.

```typescript
import { Effect, Option } from "effect";
import { isCstScalarEvent, visitCSTCollect } from "yaml-effect";

const yaml = "items:\n  - one\n  - two\n";

const program = Effect.gen(function* () {
  const scalars = yield* visitCSTCollect(yaml, (event) =>
    isCstScalarEvent(event) ? Option.some(event.source) : Option.none()
  );
  console.log(scalars);
  // Raw source strings, no type resolution
});

Effect.runSync(program);
```

### CST Event Types

| Event | Description | Key Fields |
| ----- | ----------- | ---------- |
| `CstDocumentStartEvent` | Entering a document | -- |
| `CstDocumentEndEvent` | Exiting a document | -- |
| `CstMapStartEvent` | Entering a mapping | `source` |
| `CstMapEndEvent` | Exiting a mapping | -- |
| `CstSeqStartEvent` | Entering a sequence | `source` |
| `CstSeqEndEvent` | Exiting a sequence | -- |
| `CstScalarEvent` | A standalone scalar | `source` |
| `CstKeyEvent` | A mapping key scalar | `source` |
| `CstValueEvent` | A mapping value scalar | `source` |
| `CstAliasEvent` | An alias reference | `source` |
| `CstCommentEvent` | A comment | `source` |
| `CstDirectiveEvent` | A directive | `source` |
| `CstErrorEvent` | A parse error | `source` |

All CST events carry `path` and `depth` fields, same as AST events.

### CST Type Guards

- `isCstDocumentStartEvent`
- `isCstDocumentEndEvent`
- `isCstMapStartEvent`
- `isCstMapEndEvent`
- `isCstSeqStartEvent`
- `isCstSeqEndEvent`
- `isCstScalarEvent`
- `isCstKeyEvent`
- `isCstValueEvent`
- `isCstAliasEvent`
- `isCstCommentEvent`
- `isCstDirectiveEvent`
- `isCstErrorEvent`

## Stream Composition Patterns

Because `visit` and `visitCST` return Effect `Stream` values, you can compose
them with standard stream operators.

### Taking the First N Events

```typescript
import { Effect, Stream } from "effect";
import { visit } from "yaml-effect";

const yaml = "a: 1\nb: 2\nc: 3\nd: 4\n";

const program = Effect.gen(function* () {
  const firstFive = yield* Stream.runCollect(
    visit(yaml).pipe(Stream.take(5))
  ).pipe(Effect.map((chunk) => [...chunk]));
  console.log(firstFive.length); // 5
});

Effect.runSync(program);
```

### Filtering Events

```typescript
import { Effect, Stream } from "effect";
import { isScalarEvent, visit } from "yaml-effect";

const yaml = "name: Alice\nage: 30\nactive: true\n";

const program = Effect.gen(function* () {
  const scalars = yield* Stream.runCollect(
    visit(yaml).pipe(Stream.filter(isScalarEvent))
  ).pipe(Effect.map((chunk) => [...chunk]));

  for (const scalar of scalars) {
    console.log(scalar.value, scalar.style);
  }
});

Effect.runSync(program);
```

### Extracting with filterMap

```typescript
import { Effect, Option, Stream } from "effect";
import { isScalarEvent, visit } from "yaml-effect";

const yaml = "name: Alice\nage: 30\ncount: 100\n";

const program = Effect.gen(function* () {
  const numbers = yield* Stream.runCollect(
    visit(yaml).pipe(
      Stream.filterMap((event) =>
        isScalarEvent(event) && typeof event.value === "number"
          ? Option.some(event.value as number)
          : Option.none()
      )
    )
  ).pipe(Effect.map((chunk) => [...chunk]));
  console.log(numbers); // [30, 100]
});

Effect.runSync(program);
```

## Real-World Examples

### Extracting All Keys from a Document

```typescript
import { Effect, Option } from "effect";
import { isPairEvent, visitCollect } from "yaml-effect";

const yaml = `
server:
  host: localhost
  port: 8080
database:
  name: mydb
  user: admin
`;

const program = Effect.gen(function* () {
  const keys = yield* visitCollect(yaml, (event) =>
    isPairEvent(event) && typeof event.key === "string"
      ? Option.some(event.key)
      : Option.none()
  );
  console.log(keys);
  // ["server", "host", "port", "database", "name", "user"]
});

Effect.runSync(program);
```

### Finding Values by Pattern

```typescript
import { Effect, Option } from "effect";
import { isScalarEvent, visitCollect } from "yaml-effect";

const yaml = `
endpoints:
  - url: https://api.example.com/v1
  - url: https://api.example.com/v2
  - url: https://staging.example.com/v1
`;

const program = Effect.gen(function* () {
  const urls = yield* visitCollect(yaml, (event) => {
    if (
      isScalarEvent(event) &&
      typeof event.value === "string" &&
      event.value.startsWith("https://api.")
    ) {
      return Option.some(event.value);
    }
    return Option.none();
  });
  console.log(urls);
  // ["https://api.example.com/v1", "https://api.example.com/v2"]
});

Effect.runSync(program);
```
