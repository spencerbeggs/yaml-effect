# Equality

Semantic equality comparisons for YAML documents. Compares parsed values,
ignoring comments, whitespace, formatting, and mapping key ordering.

## `equals(a, b)`

Compares two YAML strings for semantic equality. Both strings are parsed and
then deep-compared.

This function is a dual -- it can be called with both arguments directly, or
partially applied with one argument for pipeline use.

### Direct Style

```typescript
import { Effect } from "effect";
import { equals } from "yaml-effect";

const yamlA = "name: Alice\nage: 30";
const yamlB = "age: 30\nname: Alice";

const program = Effect.gen(function* () {
  const result = yield* equals(yamlA, yamlB);
  console.log(result); // true -- key order is ignored
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, pipe } from "effect";
import { equals } from "yaml-effect";

const yamlA = "name: Alice\nage: 30";
const yamlB = "age: 30\nname: Alice";

const program = Effect.gen(function* () {
  const result = yield* pipe(yamlA, equals(yamlB));
  console.log(result); // true
});

Effect.runSync(program);
```

## `equalsValue(yaml, value)`

Compares a YAML string against a JavaScript value for semantic equality.
Only the YAML string is parsed; the JS value is used as-is.

This function is a dual -- it supports both direct and pipeline calling.

### Direct Style

```typescript
import { Effect } from "effect";
import { equalsValue } from "yaml-effect";

const yaml = "items:\n  - one\n  - two";
const expected = { items: ["one", "two"] };

const program = Effect.gen(function* () {
  const result = yield* equalsValue(yaml, expected);
  console.log(result); // true
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, pipe } from "effect";
import { equalsValue } from "yaml-effect";

const yaml = "count: 42";

const program = Effect.gen(function* () {
  const result = yield* pipe(yaml, equalsValue({ count: 42 }));
  console.log(result); // true
});

Effect.runSync(program);
```

## Key-Order Insensitivity

Mapping key order is not significant in YAML. Two mappings with the same keys
and values are equal regardless of key ordering, at all nesting levels.

```typescript
import { Effect } from "effect";
import { equals } from "yaml-effect";

const program = Effect.gen(function* () {
  const result = yield* equals(
    "server:\n  port: 8080\n  host: localhost",
    "server:\n  host: localhost\n  port: 8080"
  );
  console.log(result); // true
});

Effect.runSync(program);
```

## Sequence Order Significance

Unlike mappings, sequence (array) order IS significant. Two sequences with the
same elements in different order are NOT equal.

```typescript
import { Effect } from "effect";
import { equals } from "yaml-effect";

const program = Effect.gen(function* () {
  const sameOrder = yield* equals(
    "items:\n  - a\n  - b",
    "items:\n  - a\n  - b"
  );
  console.log(sameOrder); // true

  const differentOrder = yield* equals(
    "items:\n  - a\n  - b",
    "items:\n  - b\n  - a"
  );
  console.log(differentOrder); // false
});

Effect.runSync(program);
```

## NaN Handling

`NaN` values are treated as equal to each other, which differs from JavaScript's
`===` operator but matches the expected YAML semantics where two `.nan` values
should compare as equivalent.

```typescript
import { Effect } from "effect";
import { equals } from "yaml-effect";

const program = Effect.gen(function* () {
  const result = yield* equals("value: .nan", "value: .NaN");
  console.log(result); // true
});

Effect.runSync(program);
```

## Error Handling

Both `equals` and `equalsValue` can fail with `YamlComposerError` if either
input string contains invalid YAML.

```typescript
import { Effect } from "effect";
import { equals } from "yaml-effect";

const program = equals("valid: true", "invalid: [unclosed").pipe(
  Effect.catchTag("YamlComposerError", (error) => {
    console.error("Parse failed:", error.message);
    return Effect.succeed(false);
  })
);

Effect.runSync(program);
```
