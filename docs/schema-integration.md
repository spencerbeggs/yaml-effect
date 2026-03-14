# Schema Integration

`yaml-effect` integrates with Effect Schema to provide fully typed YAML
decode/encode pipelines. Parse YAML strings directly into typed domain objects
and encode them back.

## `YamlFromString`

A pre-built Schema that decodes a YAML string into an `unknown` value and
encodes an `unknown` value back into a YAML string.

```typescript
import { Effect, Schema } from "effect";
import { YamlFromString } from "yaml-effect";

const decode = Schema.decode(YamlFromString);
const encode = Schema.encode(YamlFromString);

const program = Effect.gen(function* () {
  const value = yield* decode("name: Alice\nage: 30");
  console.log(value);
  // { name: "Alice", age: 30 }

  const yaml = yield* encode(value);
  console.log(yaml);
  // name: Alice
  // age: 30
});

Effect.runSync(program);
```

## `makeYamlSchema(targetSchema, options?)`

Creates a fully typed Schema that decodes YAML strings into a domain type `A`
and encodes `A` values back into YAML strings. This is the primary integration
point for typed YAML processing.

```typescript
import { Effect, Schema } from "effect";
import { makeYamlSchema } from "yaml-effect";

const UserSchema = makeYamlSchema(
  Schema.Struct({
    name: Schema.String,
    age: Schema.Number,
    active: Schema.Boolean,
  })
);

const program = Effect.gen(function* () {
  const user = yield* Schema.decode(UserSchema)(
    "name: Alice\nage: 30\nactive: true"
  );
  console.log(user);
  // { name: "Alice", age: 30, active: true }

  const yaml = yield* Schema.encode(UserSchema)(user);
  console.log(yaml);
  // name: Alice
  // age: 30
  // active: true
});

Effect.runSync(program);
```

### Custom Parse and Stringify Options

Pass options to control parsing and stringification behavior.

```typescript
import { Effect, Schema } from "effect";
import { makeYamlSchema } from "yaml-effect";

const ConfigSchema = makeYamlSchema(
  Schema.Struct({
    host: Schema.String,
    port: Schema.Number,
  }),
  {
    parseOptions: { strict: true, uniqueKeys: true },
    stringifyOptions: { indent: 4, sortKeys: true },
  }
);

const program = Effect.gen(function* () {
  const config = yield* Schema.decode(ConfigSchema)(
    "host: localhost\nport: 8080"
  );
  console.log(config);
  // { host: "localhost", port: 8080 }
});

Effect.runSync(program);
```

**Signature:**

```typescript
function makeYamlSchema<A, I, R>(
  targetSchema: Schema.Schema<A, I, R>,
  options?: {
    parseOptions?: Partial<YamlParseOptions>;
    stringifyOptions?: Partial<YamlStringifyOptions>;
  }
): Schema.Schema<A, string, R>
```

## `makeYamlFromString(parseOptions?, stringifyOptions?)`

Creates a `YamlFromString` schema with custom parse and stringify options.
Useful when you need to customize parsing behavior without a target schema.

```typescript
import { Effect, Schema } from "effect";
import { makeYamlFromString } from "yaml-effect";

const LenientYaml = makeYamlFromString(
  { strict: false, uniqueKeys: false },
  { indent: 4 }
);

const program = Effect.gen(function* () {
  const value = yield* Schema.decode(LenientYaml)("a: 1\na: 2");
  console.log(value); // { a: 2 }
});

Effect.runSync(program);
```

## `YamlAllFromString`

A pre-built Schema for multi-document YAML strings. Decodes into an array of
`unknown` values and encodes an array back into a multi-document YAML string
separated by `---`.

```typescript
import { Effect, Schema } from "effect";
import { YamlAllFromString } from "yaml-effect";

const decode = Schema.decode(YamlAllFromString);

const program = Effect.gen(function* () {
  const docs = yield* decode("---\nname: Alice\n---\nname: Bob\n");
  console.log(docs);
  // [{ name: "Alice" }, { name: "Bob" }]
});

Effect.runSync(program);
```

## `makeYamlAllFromString(parseOptions?)`

Creates a multi-document YAML schema with custom parse options.

```typescript
import { Effect, Schema } from "effect";
import { makeYamlAllFromString } from "yaml-effect";

const LenientMultiDoc = makeYamlAllFromString({ strict: false });

const program = Effect.gen(function* () {
  const docs = yield* Schema.decode(LenientMultiDoc)(
    "---\na: 1\n---\nb: 2\n"
  );
  console.log(docs.length); // 2
});

Effect.runSync(program);
```

## `makeYamlDocumentSchema(parseOptions?)`

Creates a Schema that decodes a YAML string into a `YamlDocument`, preserving
the full AST structure, directives, comments, and metadata. Useful for tools
that need to inspect or transform the AST.

```typescript
import { Effect, Schema } from "effect";
import { isMap, makeYamlDocumentSchema } from "yaml-effect";

const DocSchema = makeYamlDocumentSchema();

const program = Effect.gen(function* () {
  const doc = yield* Schema.decode(DocSchema)("name: Alice\nage: 30");

  if (doc.contents && isMap(doc.contents)) {
    console.log(doc.contents.items.length); // 2
  }

  // Round-trip back to YAML
  const yaml = yield* Schema.encode(DocSchema)(doc);
  console.log(yaml);
  // name: Alice
  // age: 30
});

Effect.runSync(program);
```

## Integration with `@effect/platform`

YAML schemas compose naturally with `@effect/platform` HTTP services and
file system operations.

### Reading YAML Configuration Files

```typescript
import { Effect, Schema } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { FileSystem } from "@effect/platform";
import { makeYamlSchema } from "yaml-effect";

const AppConfig = Schema.Struct({
  database: Schema.Struct({
    host: Schema.String,
    port: Schema.Number,
  }),
  debug: Schema.Boolean,
});

const ConfigSchema = makeYamlSchema(AppConfig);
const decodeConfig = Schema.decode(ConfigSchema);

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const raw = yield* fs.readFileString("config.yaml");
  const config = yield* decodeConfig(raw);
  console.log(config.database.host);
});

NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)));
```

## Round-Trip Encoding and Decoding

All schema functions support bidirectional transformation. Decode YAML into
typed values, transform them, and encode back to YAML.

```typescript
import { Effect, Schema } from "effect";
import { makeYamlSchema } from "yaml-effect";

const ServerConfig = Schema.Struct({
  host: Schema.String,
  port: Schema.Number,
  workers: Schema.Number,
});

const ConfigYaml = makeYamlSchema(ServerConfig);
const decode = Schema.decode(ConfigYaml);
const encode = Schema.encode(ConfigYaml);

const program = Effect.gen(function* () {
  // Decode YAML into typed config
  const config = yield* decode("host: localhost\nport: 8080\nworkers: 4");

  // Transform
  const updated = { ...config, port: 9090, workers: 8 };

  // Encode back to YAML
  const yaml = yield* encode(updated);
  console.log(yaml);
  // host: localhost
  // port: 9090
  // workers: 8
});

Effect.runSync(program);
```

## Error Handling

Schema decode/encode failures surface as `ParseError` from the Effect Schema
library. The error message includes the underlying YAML parse or stringify
failure details.

```typescript
import { Effect, Schema } from "effect";
import { makeYamlSchema } from "yaml-effect";

const StrictSchema = makeYamlSchema(
  Schema.Struct({ name: Schema.String, age: Schema.Number })
);

const program = Schema.decode(StrictSchema)("not_valid: [yaml").pipe(
  Effect.catchAll((error) => {
    console.error("Decode failed:", error.message);
    return Effect.succeed({ name: "default", age: 0 });
  })
);

Effect.runSync(program);
```
