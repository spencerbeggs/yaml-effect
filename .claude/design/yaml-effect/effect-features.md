---
title: Effect-Native Differentiator Features (Proposed)
description: Proposed branded-scalar Schema decoding with source-position errors, TagResolver service via Layer/Context, and OpenTelemetry instrumentation. Investigates Standard Schema as the public surface.
status: stub
module: yaml-effect
category: integration
created: 2026-04-29
updated: 2026-04-29
last-synced: 2026-04-29
completeness: 15
related:
  - roadmap.md
  - schema-integration.md
  - dx-and-cli.md
  - errors.md
  - architecture.md
dependencies:
  - roadmap.md
  - schema-integration.md
---

## Overview

This document proposes the Effect-native features that separate
`yaml-effect` from `eemeli/yaml` and `js-yaml`. These are the Phase
2 ("the 1.0 thesis") items from [roadmap.md](./roadmap.md). Each
of them is technically possible to bolt onto the older libraries
in user code, but each becomes substantially more pleasant when
the parser is built on Effect from the start.

The four features:

1. **Branded-scalar Schema decoding with source-position errors.**
   The killer feature for typed config loading.
2. **`TagResolver` service via `Layer` / `Context`.** Pluggable tag
   handling using Effect's standard DI.
3. **OpenTelemetry spans + `Metric` counters across the parse
   pipeline.** Out-of-the-box observability.
4. **Cancellable / time-bounded parse with partial result.**
   Honest behaviour on hostile input.

## Current State

`yaml-effect` already has `makeYamlSchema`, `YamlFromString`,
`YamlAllFromString`, and `makeYamlDocumentSchema` (see
[schema-integration.md](./schema-integration.md)). These bridge
the parser to Effect Schema's decode/encode pipeline, but they
discard the YAML offset/line/column when Schema validation fails —
the user gets a `ParseResult.Type` whose `message` mentions the
field but not the line in their YAML file.

There is no DI-based tag handling; `!handle!suffix` resolution is
hard-coded to the document's `%TAG` directive map.

There is no telemetry instrumentation; users who want spans
around parse calls have to wrap each call themselves.

There is no cancellation or time-bound; a malicious input that
loops in a poorly-bounded helper will block the fiber until it
finishes.

## Rationale

Effect's value proposition for library authors is "expose your
behaviour through Effect's standard interfaces (`Layer`,
`Context`, `Metric`, `Span`, fiber cancellation) and the user
gets cross-cutting concerns for free." For `yaml-effect`, the
cross-cutting concerns that matter are:

- Locating an error on the source line, not just on a logical
  field.
- Customising tag resolution per application (decrypt-on-load,
  env-expansion, JSON-schema-validate-per-tag).
- Plumbing parse activity into the existing observability stack.
- Survivability on hostile input.

All four of these are services Effect already standardises. The
work in this doc is "wire `yaml-effect` into them properly," not
"build new Effect machinery from scratch."

## Branded-Scalar Schema Decoding with Source-Position Errors

### The Killer Feature

Today the user writes:

```typescript
const schema = makeYamlSchema(Schema.Struct({
  port: Schema.Number,
  host: Schema.String,
}));
const result = Schema.decode(schema)(text);
```

If `port` in the YAML is the string `"abc"`, the user sees a
Schema validation error mentioning `.port` — but not where in the
YAML file `.port` lives. The user has to grep their config file by
hand.

The proposed `makeYamlSchemaWithSource` returns errors that carry
the YAML offset / line / column of the failing scalar:

```typescript
const schema = makeYamlSchemaWithSource(Schema.Struct({
  port: Schema.Number,
  host: Schema.String,
}));

const result = Schema.decode(schema)(text);
// On failure: error includes `{ offset: 42, line: 3, column: 7,
//   path: ["port"], reason: "Expected number, got string" }`
```

Combined with the public code-frame renderer
([dx-and-cli.md](./dx-and-cli.md)), this produces error output
that looks like `tsc`'s output — coloured caret pointing at the
exact byte in the YAML — which no other config-loading library in
the JavaScript ecosystem currently does end-to-end.

### How It Works

The bridge already in `makeYamlSchema` has the parsed
`YamlDocument` in scope after `parseDocument()` returns. The new
variant keeps the document in a closure, then in the
`Schema.transformOrFail` failure callback, walks the document AST
to find the node at the failing path (`getNodePath` already
exists for the inverse direction; we add the forward direction
keyed by Schema's `path` array). The node's `offset` and
`length` become part of the emitted `ParseResult.Type` issue.

The emitted issue shape is a small Effect Schema-compatible
extension. It augments rather than replaces `ParseResult.Type`,
so consumers who don't want positions get the standard shape.

### Branded Scalars

Once positions ride along, branded-scalar decoding becomes
strictly more useful. A user writes:

```typescript
const PortNumber = Schema.Number.pipe(
  Schema.between(1, 65535),
  Schema.brand("PortNumber"),
);

const schema = makeYamlSchemaWithSource(Schema.Struct({
  port: PortNumber,
  host: Schema.String,
}));
```

A YAML where `port: 99999` produces a position-aware error
pointing at the scalar containing `99999`, not at the parent
`Struct` field, because the Schema branded-refinement failure is
attached to that specific scalar's node. The branded-scalar story
is the natural extension of the position-aware error story; both
work because the AST keeps offsets on every node.

### Investigate: Standard Schema Interop

**Standard Schema** is the recently-emerged interop spec for
schema libraries — Zod, Valibot, ArkType, and Effect Schema all
expose a `~standard` property whose `validate` method follows a
uniform contract. A library that decodes YAML "into a Standard
Schema" can be consumed by users who never adopt Effect Schema
directly.

The open question is whether the public surface of
`makeYamlSchemaWithSource` should be:

- **Effect Schema only** — simpler implementation; ties the
  feature to Effect Schema's idioms; cleanest fit with the rest
  of the library's `Schema.transformOrFail` pattern.
- **Standard Schema-compatible** — a parallel constructor like
  `makeYamlStandardSchemaWithSource(targetStandardSchema)` that
  works against any Standard Schema implementation. Wider reach,
  more code to maintain, and the position-aware-error
  augmentation has to be expressed through Standard Schema's
  issue shape (which is less rich than Effect Schema's).

The recommendation is: ship Effect Schema first, design the
internal AST-walker so it does not depend on Effect Schema's
specific issue type, and add a Standard Schema entry point in a
follow-up once the Effect Schema variant has been proven on real
configs. The internal walker — given `(document, path,
errorMessage) -> { offset, line, column }` — is library-neutral.

## TagResolver Service via Layer / Context

### The Problem

Today, `!handle!suffix` resolution lives in the composer
(`resolveTagHandle` in `src/utils/composer.ts`) and only knows
about the document's `%TAG` directives. There is no way for a
user to register a custom handler for, say, `!secret`, that:

- Looks the suffix up in a vault.
- Decrypts the value.
- Returns the plaintext as the resolved scalar value.
- Optionally fails the parse if the lookup fails.

Users today work around this by parsing raw, then walking the
AST in user code. That works but skips Effect's DI, can't be
mocked cleanly in tests, and forces every consumer to reinvent
the same walker.

### The Proposal

Define a `TagResolver` service:

```typescript
interface TagResolver {
  readonly resolve: (
    tag: string,
    rawValue: string,
    nodeOffset: number,
  ) => Effect.Effect<unknown, TagResolverError>;
}

const TagResolver = Context.GenericTag<TagResolver>("TagResolver");
```

The composer, when it encounters a tagged scalar with a tag the
default resolver does not recognise, calls
`TagResolver.resolve(tag, rawValue, offset)` instead of bailing
or returning the raw string.

Default behaviour (no `TagResolver` provided) is identical to
today's: unknown tags raise `UnresolvedTag`. Users add a layer:

```typescript
const SecretResolver = Layer.succeed(TagResolver, {
  resolve: (tag, value, offset) =>
    tag === "!secret"
      ? Vault.decrypt(value)
      : Effect.fail(new TagResolverError({ tag, offset })),
});

parse(text).pipe(Effect.provide(SecretResolver));
```

### Composability

Because `TagResolver` is a regular Effect service, multiple
resolvers compose via `Layer.merge`:

```typescript
const Resolvers = Layer.mergeAll(
  SecretResolver,
  EnvVarResolver,
  JsonSchemaResolver,
);
parse(text).pipe(Effect.provide(Resolvers));
```

The composer's existing `tagMap` for `%TAG` directives stays as
the first lookup; `TagResolver` is the fallback for tags not
covered by the document's directives.

### Backwards Compatibility

The new code path is gated on whether `TagResolver` is provided
via `Context`. Without it, behaviour is byte-identical to today's.
This makes the feature additive and zero-risk for existing users.

## Telemetry: Effect.withSpan + Metric

### Spans

Wrap each pipeline stage in `Effect.withSpan`:

```typescript
parseDocument(text).pipe(
  Effect.withSpan("yaml-effect.parseDocument"),
);
```

Internally, `parseDocument` already calls `parseCSTAll` and then
the composer; each of those gets its own nested span
(`yaml-effect.parseCST`, `yaml-effect.compose`). Span attributes
include:

- `yaml.input_bytes` — text length.
- `yaml.documents_seen` — for multi-doc.
- `yaml.error_code` — when the parse fails.
- `yaml.directives_seen` — count of `%TAG` / `%YAML`.

Users with an OpenTelemetry exporter configured see these
spans and attributes in their tracing UI without writing any
glue.

### Metric Counters

Three metrics defined at module scope and incremented inside the
pipeline:

- `Counter("yaml-effect.parse.total")` — every parse attempt.
- `Counter("yaml-effect.parse.errors", { code })` — every parse
  failure, dimensioned on the error code (`UndefinedAlias`,
  `DuplicateAnchor`, etc.).
- `Histogram("yaml-effect.parse.duration_ms", { bytes_bucket })`
  — parse duration histogram, bucketed by input size class.

The metric definitions live in a new `src/utils/telemetry.ts`
module. They are no-ops in environments where Effect's metric
runtime is not configured, so adding them costs nothing for
users who don't care.

### Why This Belongs in the Library

A user can reproduce all of this in their own code, but only by
duplicating spans at every call site. Doing it inside the
library means every consumer's tracing tells the same story
about how much YAML their service is processing, what shapes
it's seeing, and where it fails — without the consumer having
to think about it.

## Cancellable / Time-Bounded Parse

### The Problem

Effect already supports fiber interruption, but the current
parser is a tight loop in plain JavaScript. A pathological
input — billion-laughs alias expansion, or a synthetic input
that forces O(n^2) behaviour in some helper — runs to
completion before the fiber's interrupt signal is checked.

### The Proposal

Add explicit `Effect.yieldNow()` checkpoints between major
parser milestones (per-document boundaries, every N tokens
inside the lexer, every N nodes inside the composer). At each
checkpoint, the fiber's interrupt status is honoured and the
parse aborts cleanly.

This makes:

```typescript
parse(suspiciousText).pipe(
  Effect.timeout("100 millis"),
);
```

actually work. Today the timeout fires but the parser keeps
running in the background until it returns; with checkpoints,
the timeout interrupts the parser at the next checkpoint and
the fiber unwinds.

### Partial Result on Cancellation

For document-stream parsing, an interrupted parse can return
the documents it had already finished. This is opt-in via a
new `parseAllDocumentsPartial` variant that returns
`Effect<{ documents, interrupted: boolean }, ...>` rather than
failing on interruption. Useful for log-tail scenarios.

### Cost

Modest. Each checkpoint is one allocation-free Effect yield.
The overhead in benchmarks should be < 5%; the bench harness
in [perf-benchmarking.md](./perf-benchmarking.md) measures
this so we can verify rather than guess.

## Open Questions

- **Effect Schema vs. Standard Schema for the public surface
  of `makeYamlSchemaWithSource`.** Recommendation above:
  Effect Schema first, Standard Schema follow-up. Validate
  with the user before implementation starts.
- **Position augmentation in `ParseResult` issues.** Effect's
  `ParseResult` issue shape is opinionated. Adding YAML
  positions cleanly may require a custom error type that
  wraps `ParseResult` rather than extending it. Decide once
  the prototype runs.
- **Span naming convention.** `yaml-effect.parse` vs.
  `yaml.parse` vs. follow some Effect ecosystem-wide
  convention if one emerges.
- **Default Histogram buckets for parse duration.** Pick
  byte-size buckets that match the bench workload buckets so
  the trace UI lines up with the bench data.
- **Backpressure on `TagResolver`.** A slow resolver blocks
  the parse fiber. Document this; do not "fix" it, because
  tag resolution is intrinsically sequential.

## Non-Goals (Deferred)

- **Edit-aware incremental reparse.** Tracking which CST
  nodes a YamlEdit invalidates and re-parsing only the
  affected region. Plausible for IDE use cases, but no use
  case justifies the complexity yet.
- **STM-based transactional edits.** `applyEdits` is already
  pure; users who need rollback can compose Effects. STM
  buys nothing here.
- **Fiber-streaming through the lexer.** Using fibers
  internally to overlap I/O with parsing. Streaming today
  works (the lexer returns a Stream); making it
  fiber-parallel adds complexity for unmeasured gain.
- **Schema-aware tag resolution at parse time.** Validating a
  scalar against a Schema during composition rather than
  after. The post-parse Schema decode in
  `makeYamlSchemaWithSource` is the right layer.

## Cross-References

- [schema-integration.md](./schema-integration.md) — the
  existing Schema bridges that `makeYamlSchemaWithSource`
  extends.
- [errors.md](./errors.md) — the `YamlError` taxonomy that
  position-aware errors integrate into.
- [dx-and-cli.md](./dx-and-cli.md) — the public code-frame
  renderer that consumes position-aware errors.
- [roadmap.md](./roadmap.md) — places this work in Phase 2
  ("the 1.0 thesis").
