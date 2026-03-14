# yaml-effect

[![npm version](https://img.shields.io/npm/v/yaml-effect)](https://www.npmjs.com/package/yaml-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A pure Effect-based YAML 1.2 parser, stringifier, and toolkit for TypeScript. Zero runtime dependencies beyond Effect — no wrappers, no ports, just a clean-room YAML 1.2 implementation designed for the Effect ecosystem.

## Features

- Parse and stringify YAML 1.2 with typed errors via Effect
- Bidirectional Effect Schema integration for validated YAML-to-domain roundtrips
- Non-destructive formatting, path-based modification, and semantic equality
- Stream-based lexer, CST parser, and visitor APIs for low-level processing
- Pipeline-friendly dual-style APIs (direct and pipe)

### Why does this module exist?

If you just need to parse YAML into a JavaScript object, use [yaml](https://www.npmjs.com/package/yaml). It is depended upon by 13,000+ packages, is battle-tested, and covers the full YAML 1.2 specification.

This library is for Effect-based programs that need deeper introspection and manipulation of YAML documents: typed parse errors you can `catchTag`, Schema pipelines that validate YAML strings into domain types, AST and CST access, non-destructive formatting and path-based modification, semantic equality comparisons, and SAX-style visitor streams that are composable in Effect pipelines.

> **Note:** yaml-effect is new and may introduce breaking changes before a
> 1.0.0 release.

## Installation

```bash
npm install yaml-effect effect
```

> **Peer dependency:** `effect` (>= 3.x) must be installed alongside `yaml-effect`.

## Quick Start

```typescript
import { Effect } from "effect";
import { parse, stringify } from "yaml-effect";

const program = Effect.gen(function* () {
  const value = yield* parse("name: Alice\nage: 30");
  console.log(value); // { name: "Alice", age: 30 }

  const yaml = yield* stringify({ greeting: "hello", count: 42 });
  console.log(yaml); // "greeting: hello\ncount: 42\n"
});

Effect.runSync(program);
```

## Documentation

For API reference, configuration options, and advanced usage, see [docs](./docs/).

## License

[MIT](LICENSE)
