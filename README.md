# yaml-effect

[![npm version](https://img.shields.io/npm/v/yaml-effect)](https://www.npmjs.com/package/yaml-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![YAML 1.2 compliance](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fspencerbeggs%2Fyaml-effect%2Fbadges%2Fbadge.json)](https://github.com/spencerbeggs/yaml-effect/blob/badges/compliance.json)

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

## Spec Compliance

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

## Status and Maturity

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
