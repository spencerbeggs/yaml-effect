# Formatting

Re-indent, sort keys, strip comments, and apply consistent formatting to YAML
documents. All formatting operations use an AST-based approach: parse, transform,
and stringify.

## `format(text, options?)`

Computes formatting edits for a YAML document. Returns an array of `YamlEdit`
objects describing the changes needed. The original text is not modified.

```typescript
import type { ReadonlyArray } from "effect";
import { Effect } from "effect";
import type { YamlEdit } from "yaml-effect";
import { format } from "yaml-effect";

const yaml = "b: 2\na: 1\n";

const program = Effect.gen(function* () {
  const edits: ReadonlyArray<YamlEdit> = yield* format(yaml, {
    sortKeys: true,
  });
  console.log(edits);
  // Array of YamlEdit objects with offset, length, and content
});

Effect.runSync(program);
```

## `formatAndApply(text, options?)`

Formats a YAML document in one step, returning the formatted string directly.

```typescript
import { Effect } from "effect";
import { formatAndApply } from "yaml-effect";

const yaml = "b: 2\na: 1\n";

const program = Effect.gen(function* () {
  const formatted = yield* formatAndApply(yaml, {
    indent: 4,
    sortKeys: true,
  });
  console.log(formatted);
  // a: 1
  // b: 2
});

Effect.runSync(program);
```

## `applyEdits(text, edits)`

Applies an array of `YamlEdit` objects to YAML source text. Edits are sorted
in reverse offset order before application so earlier edits do not shift later
offsets.

This function is a dual -- it can be called directly or partially applied.

### Direct Style

```typescript
import type { ReadonlyArray } from "effect";
import { Effect } from "effect";
import type { YamlEdit } from "yaml-effect";
import { applyEdits, format } from "yaml-effect";

const yaml = "b: 2\na: 1\n";

const program = Effect.gen(function* () {
  const edits: ReadonlyArray<YamlEdit> = yield* format(yaml, {
    sortKeys: true,
  });
  const result: string = yield* applyEdits(yaml, edits);
  console.log(result);
});

Effect.runSync(program);
```

### Pipeline Style

```typescript
import { Effect, pipe } from "effect";
import { applyEdits, format } from "yaml-effect";

const yaml = "b: 2\na: 1\n";

const program = pipe(
  format(yaml, { sortKeys: true }),
  Effect.flatMap(applyEdits(yaml)),
);

Effect.runSync(program);
```

## `stripComments(text, replaceCh?)`

Removes all comments from a YAML document.

### Removal Mode (default)

Without `replaceCh`, parses the document, removes all comment fields from the
AST, and stringifies back. Full-line comments are removed entirely.

```typescript
import { Effect } from "effect";
import { stripComments } from "yaml-effect";

const yaml = "name: John # the user name\nage: 30 # years\n";

const program = Effect.gen(function* () {
  const stripped = yield* stripComments(yaml);
  console.log(stripped);
  // name: John
  // age: 30
});

Effect.runSync(program);
```

### Replacement Mode

With `replaceCh` (a single character), replaces each character of comment text
(including the `#` marker) with the given character. This preserves character
offsets, which is useful for tools that need to maintain position information.

```typescript
import { Effect } from "effect";
import { stripComments } from "yaml-effect";

const yaml = "name: John # comment\n";

const program = Effect.gen(function* () {
  const replaced = yield* stripComments(yaml, " ");
  console.log(replaced);
  // name: John
  // (comment chars replaced with spaces, offsets preserved)
});

Effect.runSync(program);
```

## `YamlFormattingOptions`

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `indent` | `number` | `2` | Spaces per indentation level |
| `lineWidth` | `number` | `80` | Preferred maximum line width |
| `defaultScalarStyle` | `ScalarStyle` | `"plain"` | Default scalar output style |
| `defaultCollectionStyle` | `CollectionStyle` | `"block"` | Default collection output style |
| `sortKeys` | `boolean` | `false` | Sort mapping keys alphabetically |
| `finalNewline` | `boolean` | `true` | Append trailing newline to output |
| `preserveComments` | `boolean` | `true` | Preserve comments in formatted output |
| `range` | `{ offset, length }` | (entire doc) | Restrict edits to a byte range |

You can also pass a plain `RawFormatOptions` object instead of constructing a
`YamlFormattingOptions` instance:

```typescript
import type { RawFormatOptions } from "yaml-effect";

const options: RawFormatOptions = {
  indent: 4,
  sortKeys: true,
  preserveComments: false,
  range: { offset: 0, length: 50 },
};
```

## Range-Restricted Formatting

When `range` is set, only edits within that byte range are returned. This is
useful for formatting a selected region of a document without affecting the
rest.

```typescript
import { Effect } from "effect";
import { format } from "yaml-effect";

const yaml = "a: 1\nb: 2\nc: 3\nd: 4\n";

const program = Effect.gen(function* () {
  // Only format the first 10 characters
  const edits = yield* format(yaml, {
    sortKeys: true,
    range: { offset: 0, length: 10 },
  });
  console.log(edits.length);
});

Effect.runSync(program);
```

## Error Handling

Formatting can fail with `YamlFormatError` when the input YAML is malformed.

```typescript
import { Effect } from "effect";
import { formatAndApply } from "yaml-effect";

const program = formatAndApply("malformed: [yaml").pipe(
  Effect.catchTag("YamlFormatError", (error) => {
    console.error(`Format failed: ${error.reason}`);
    return Effect.succeed(error.text);
  })
);

Effect.runSync(program);
```

The `YamlFormatError` contains:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `text` | `string` | The input text that could not be formatted |
| `reason` | `string` | Human-readable explanation of the failure |
