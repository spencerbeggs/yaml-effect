# Getting Started

## Installation

Install `yaml-effect` alongside the `effect` peer dependency.

```bash
# npm
npm install yaml-effect effect

# pnpm
pnpm add yaml-effect effect

# yarn
yarn add yaml-effect effect
```

`effect` version `^3.19.19` or later is required as a peer dependency.

## TypeScript Setup

`yaml-effect` is written in TypeScript and ships with full type declarations.
Enable `strict` mode in your `tsconfig.json` for the best experience:

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "nodenext",
    "moduleResolution": "nodenext"
  }
}
```

The library is ESM-only. Ensure your project uses `"type": "module"` in
`package.json` or `.mts` file extensions.

## Basic Parsing

The `parse` function converts a YAML string into a plain JavaScript value. It
returns an `Effect` so errors are tracked in the type system.

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = Effect.gen(function* () {
  const value = yield* parse("name: Alice\nage: 30");
  console.log(value);
  // { name: "Alice", age: 30 }
});

Effect.runSync(program);
```

YAML 1.2 Core Schema type resolution is applied automatically:

- `null`, `Null`, `NULL`, `~` resolve to `null`
- `true`, `True`, `TRUE` resolve to `true`
- `false`, `False`, `FALSE` resolve to `false`
- Integer literals (decimal, octal `0o`, hex `0x`) resolve to `number`
- Float literals, `.inf`, `-.inf`, `.nan` resolve to `number`
- Everything else remains a `string`

## Basic Stringification

The `stringify` function converts a JavaScript value back into YAML text.

```typescript
import { Effect } from "effect";
import { stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const yaml = yield* stringify({
    name: "Alice",
    tags: ["admin", "user"],
    active: true,
  });
  console.log(yaml);
  // name: Alice
  // tags:
  //   - admin
  //   - user
  // active: true
});

Effect.runSync(program);
```

## Error Handling

Every function in `yaml-effect` returns an `Effect` with a typed error channel.
Use `Effect.catchTag` to handle specific error types.

```typescript
import { Effect } from "effect";
import { parse } from "yaml-effect";

const program = parse("a: *undefined_alias").pipe(
  Effect.catchTag("YamlComposerError", (error) => {
    for (const detail of error.errors) {
      console.error(
        `[${detail.code}] ${detail.message} at ${detail.line}:${detail.column}`
      );
    }
    return Effect.succeed(null);
  })
);

Effect.runSync(program);
```

Use `Effect.either` to inspect the result without crashing:

```typescript
import { Effect, Either } from "effect";
import { parse } from "yaml-effect";

const program = Effect.gen(function* () {
  const result = yield* Effect.either(parse("invalid: [unclosed"));

  if (Either.isLeft(result)) {
    console.error("Parse failed:", result.left.message);
  } else {
    console.log("Parsed:", result.right);
  }
});

Effect.runSync(program);
```

## Round-Trip Example

Parse a YAML document, modify it, and stringify it back.

```typescript
import { Effect } from "effect";
import { parse, stringify } from "yaml-effect";

const input = `
server:
  host: localhost
  port: 8080
`;

const program = Effect.gen(function* () {
  const config = yield* parse(input);
  const updated = {
    ...(config as Record<string, unknown>),
    server: {
      ...((config as Record<string, unknown>).server as Record<string, unknown>),
      port: 9090,
    },
  };
  const output = yield* stringify(updated);
  console.log(output);
});

Effect.runSync(program);
```

## Next Steps

- [Parsing](./parsing.md) -- detailed parse options and multi-document support
- [Stringification](./stringify.md) -- output formatting and scalar styles
- [Schema Integration](./schema-integration.md) -- typed YAML with Effect Schema
- [Formatting](./formatting.md) -- re-indent, sort keys, strip comments
- [Modification](./modification.md) -- insert, replace, remove values by path
- [Equality](./equality.md) -- semantic YAML comparison
- [Visitor](./visitor.md) -- SAX-style AST and CST streaming
- [AST Navigation](./ast-navigation.md) -- path-based and offset-based lookup
- [Low-Level APIs](./low-level.md) -- lexer, scanner, CST parser
- [Errors](./errors.md) -- error taxonomy and handling patterns
