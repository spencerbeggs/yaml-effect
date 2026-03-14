# Modification

Insert, replace, or remove values at specific paths within a YAML document.
Modifications work through AST manipulation: parse, navigate to the target
path, apply the change, and stringify back.

## `modify(text, path, value)`

Computes edits to insert, replace, or remove a value at a YAML path. Returns
an array of `YamlEdit` objects. Pass `undefined` as the value to remove a
property or element.

This function is a dual -- it can be called with all three arguments directly,
or partially applied with path and value first.

### Replacing a Value

```typescript
import { Effect } from "effect";
import { applyEdits, modify } from "yaml-effect";

const yaml = "name: John\nage: 30\n";

const program = Effect.gen(function* () {
  const edits = yield* modify(yaml, ["name"], "Jane");
  const result = yield* applyEdits(yaml, edits);
  console.log(result);
  // name: Jane
  // age: 30
});

Effect.runSync(program);
```

### Inserting a New Key

```typescript
import { Effect } from "effect";
import { applyEdits, modify } from "yaml-effect";

const yaml = "name: John\n";

const program = Effect.gen(function* () {
  const edits = yield* modify(yaml, ["email"], "john@example.com");
  const result = yield* applyEdits(yaml, edits);
  console.log(result);
  // name: John
  // email: john@example.com
});

Effect.runSync(program);
```

### Removing a Key

Pass `undefined` as the value to remove a key.

```typescript
import { Effect } from "effect";
import { applyEdits, modify } from "yaml-effect";

const yaml = "name: John\nage: 30\n";

const program = Effect.gen(function* () {
  const edits = yield* modify(yaml, ["age"], undefined);
  const result = yield* applyEdits(yaml, edits);
  console.log(result);
  // name: John
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, pipe } from "effect";
import { applyEdits, modify } from "yaml-effect";

const yaml = "name: John\nage: 30\n";

const program = pipe(
  modify(["name"], "Jane"),
  (fn) => fn(yaml),
  Effect.flatMap((edits) => applyEdits(yaml, edits)),
);

Effect.runSync(program);
```

## `modifyAndApply(text, path, value)`

Modifies a YAML document in one step, returning the modified string directly.
Same as `modify` followed by `applyEdits`, but without computing a diff.

This function is a dual -- it supports both direct and partial application.

### Direct Style

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "name: John\nage: 30\n";

const program = Effect.gen(function* () {
  const result = yield* modifyAndApply(yaml, ["name"], "Jane");
  console.log(result);
  // name: Jane
  // age: 30
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, pipe } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "name: John\nage: 30\n";

const program = pipe(
  modifyAndApply(["name"], "Jane"),
  (fn) => fn(yaml),
);

Effect.runSync(program);
```

## Path Navigation

Paths are arrays of string keys (for mappings) and numeric indices (for
sequences).

### String Keys for Mappings

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "server:\n  host: localhost\n  port: 8080\n";

const program = Effect.gen(function* () {
  const result = yield* modifyAndApply(yaml, ["server", "port"], 9090);
  console.log(result);
  // server:
  //   host: localhost
  //   port: 9090
});

Effect.runSync(program);
```

### Numeric Indices for Sequences

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "items:\n  - apple\n  - banana\n  - cherry\n";

const program = Effect.gen(function* () {
  // Replace second item
  const result = yield* modifyAndApply(yaml, ["items", 1], "blueberry");
  console.log(result);
});

Effect.runSync(program);
```

## Array Element Manipulation

### Replace an Element

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "tags:\n  - admin\n  - user\n";

const program = Effect.gen(function* () {
  const result = yield* modifyAndApply(yaml, ["tags", 0], "superadmin");
  console.log(result);
});

Effect.runSync(program);
```

### Remove an Element

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "tags:\n  - admin\n  - user\n  - guest\n";

const program = Effect.gen(function* () {
  // Remove the second element
  const result = yield* modifyAndApply(yaml, ["tags", 1], undefined);
  console.log(result);
});

Effect.runSync(program);
```

### Append an Element

Use an index equal to or greater than the array length to append.

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "tags:\n  - admin\n  - user\n";

const program = Effect.gen(function* () {
  const result = yield* modifyAndApply(yaml, ["tags", 2], "moderator");
  console.log(result);
});

Effect.runSync(program);
```

## Error Handling

Modification can fail with `YamlModificationError` when the path does not
exist or the document cannot be parsed.

```typescript
import { Effect } from "effect";
import { modifyAndApply } from "yaml-effect";

const yaml = "name: John\n";

const program = modifyAndApply(yaml, ["address", "street"], "Main St").pipe(
  Effect.catchTag("YamlModificationError", (error) => {
    console.error(`Failed at [${error.path.join(", ")}]: ${error.reason}`);
    return Effect.succeed(yaml);
  })
);

Effect.runSync(program);
```

The `YamlModificationError` contains:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `path` | `ReadonlyArray<string or number>` | The path where modification was attempted |
| `reason` | `string` | Human-readable explanation of the failure |
