# yaml-effect

> [!CAUTION]
> **This package is deprecated and no longer maintained.**
> All functionality has been migrated to [`@effected/yaml`](https://www.npmjs.com/package/@effected/yaml)
> Source code live in the [Effected monorepo](https://github.com/spencerbeggs/effected).
> No further releases, fixes or security patches will be published here.

[![npm](https://img.shields.io/npm/v/yaml-effect?label=npm&color=cb3837)](https://www.npmjs.com/package/yaml-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-4caf50.svg)](https://opensource.org/licenses/MIT)
[![Node.js 24.11.0](https://img.shields.io/badge/Node.js-24.11.0-5fa04e.svg)](https://nodejs.org/)
[![TypeScript 5.9.3](https://img.shields.io/badge/TypeScript-5.9.3-3178c6.svg)](https://www.typescriptlang.org/)
[![YAML 1.2 compliance](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fspencerbeggs%2Fyaml-effect%2Fbadges%2Fbadge.json)](https://github.com/spencerbeggs/yaml-effect/blob/badges/compliance.json)

A pure Effect-based YAML 1.2 parser, stringifier, and toolkit for TypeScript. Zero runtime dependencies beyond Effect. The implementation is clean-room — it does not wrap or port another YAML library.

## Features

- Parse and stringify YAML 1.2 with typed errors via Effect
- Bidirectional Effect Schema integration for validated YAML-to-domain roundtrips
- Non-destructive formatting, path-based modification, and semantic equality
- Stream-based lexer, CST parser, and visitor APIs for low-level processing
- Pipeline-friendly dual-style APIs (direct and pipe)

### Why does this module exist?

If you just need to parse YAML into a JavaScript object, use [yaml](https://www.npmjs.com/package/yaml). It is depended upon by 13,000+ packages, is battle-tested, and covers the full YAML 1.2 specification.

This library is for Effect-based programs that need deeper introspection and manipulation of YAML documents: typed parse errors you can `catchTag`, Schema pipelines that validate YAML strings into domain types, AST and CST access, non-destructive formatting and path-based modification, semantic equality comparisons, and SAX-style visitor streams that are composable in Effect pipelines.

## Spec compliance

yaml-effect passes 100% of the official
[yaml-test-suite](https://github.com/yaml/yaml-test-suite) (1226 of 1226
assertions). Every assertion in the suite is exercised, with no skipped
tests and no expected failures, across all four assertion families:

- Parse-success and parse-rejection (correct accept/reject behavior)
- JSON equivalence of parsed values
- Canonical-output byte-equality against libyaml's reference emitter
- Stringify roundtrip (`parse(stringify(parse(x))) === parse(x)`)

This reflects YAML 1.2 spec compliance as exercised by the yaml-test-suite.
It is not a formal certification, and "spec-correct" should not be read as
"production hardened" — see the maturity note below.

## Status and maturity

yaml-effect is pre-1.0. While the library is spec-correct against the
yaml-test-suite, a 1.0.0 release is intentionally being deferred. Expect
the following before stabilization:

- **Expanded test coverage.** The regression corpus will grow beyond the
  official yaml-test-suite — additional parser fuzzing, real-world fixtures
  (CI configs, lockfiles, k8s manifests), and adversarial inputs.
- **Performance work.** The parser, composer, and stringifier have not been
  micro-benchmarked or hot-path optimized. Internal data structures and
  algorithms may change for throughput and memory.
- **API surface evolution.** Likely additions include incremental and
  streaming parse APIs, deeper Effect Schema integration, and more
  ergonomic format and modify helpers.
- **Breaking changes between minor versions.** Until 1.0.0 ships, breaking
  changes may land between 0.x and 0.y, not just at major version
  boundaries. Pin to an exact version (or a tight range) and review
  [CHANGELOG.md](./CHANGELOG.md) before upgrading.

## Installation

```bash
npm install yaml-effect effect
```

> **Peer dependency:** `effect` (>= 3.x) must be installed alongside `yaml-effect`.

## Quick start

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

- [Getting started](./docs/getting-started.md) — install, first parse and stringify, error handling
- [Parsing](./docs/parsing.md) — `parse`, `parseDocument`, `parseAllDocuments` and YAML 1.2 type resolution
- [Stringification](./docs/stringify.md) — `stringify`, `stringifyDocument`, scalar and collection styles
- [Schema integration](./docs/schema-integration.md) — Effect Schema composition for typed YAML round-trips
- [Formatting](./docs/formatting.md) — `format`, `formatAndApply`, `stripComments`, range formatting
- [Modification](./docs/modification.md) — `modify`, `modifyAndApply`, path-based insert/replace/remove
- [Equality](./docs/equality.md) — `equals`, `equalsValue`, semantic comparison
- [Visitor](./docs/visitor.md) — AST and CST streaming traversal with `visit` and `visitCST`
- [AST navigation](./docs/ast-navigation.md) — `findNode`, `findNodeAtOffset`, `getNodePath`, type guards
- [Low-level APIs](./docs/low-level.md) — `lex`, `createScanner`, `parseCST`, token and CST node types
- [Errors](./docs/errors.md) — error taxonomy, error codes, `Effect.catchTag` patterns

## License

[MIT](LICENSE)
