---
title: Performance Benchmarking (Proposed)
description: Proposed Tinybench + Vitest bench project for yaml-effect, including workload buckets, measurement points, dependency pinning, and tag-only CI cadence.
status: stub
module: yaml-effect
category: performance
created: 2026-04-29
updated: 2026-04-29
last-synced: 2026-04-29
completeness: 15
related:
  - roadmap.md
  - test-corpus.md
  - architecture.md
  - compliance-testing.md
dependencies:
  - roadmap.md
---

## Overview

This document proposes the design for `yaml-effect`'s performance
benchmarking system. None of it is implemented yet; the goal is to
have a repeatable, comparable, low-noise way to measure parse and
stringify throughput across releases, and to publish a public badge
showing the trend.

The design follows the same pattern as the existing compliance test
infrastructure (separate Vitest project, dedicated workflow,
orphan-branch publish), so contributors and reviewers do not need to
learn a new system.

## Current State

`yaml-effect` has no performance harness at all. There is no
representative workload set, no baseline numbers, no regression
detection, and no public claim about how fast the library is. The
only timing instrumentation that exists is incidental (the
`testTimeout: 30_000` on the compliance project).

This is a deliberate gap: until correctness reached 100%, perf was
not the right thing to optimise for. Now that compliance is locked in,
the gap matters because every parser change has the potential to
regress hot paths silently.

## Rationale

Three constraints shape this design:

1. **GitHub-hosted runner noise.** Public CI runners share hardware;
   wall-clock variance on identical workloads can be 20-40%. Running
   benches on every PR or on a schedule generates more false alerts
   than real signal. The cadence has to be conservative.
2. **Released-vs-source comparison.** What the user actually
   experiences is the published artifact, not the source tree. The
   bench harness should be able to compare the in-tree build against
   the previously-published version on the same input set, on the
   same machine, in the same run.
3. **Reproducibility for future maintainers.** The workload set, the
   measurement methodology, and the publish pipeline all need to be
   in-repo and self-documenting, so that a year from now someone can
   reproduce a number from the badge without spelunking through CI
   history.

## Scope

### Included

- A new `yaml-effect:bench` Vitest project (parallel to
  `yaml-effect` and `compliance`).
- Tinybench as the timing harness, run inside Vitest's bench mode.
- Six workload buckets with one or more fixtures each.
- Five measurement points across the public API.
- A `__bench__/package.json` that pins the released `yaml-effect`
  version as a dependency, so the harness can compare in-tree vs.
  released on the same machine.
- A GitHub Actions workflow that runs on **tag pushes only** (no PR
  alerts, no schedule), publishes JSON results to an orphan
  `benchmarks` branch, and updates a shields.io endpoint badge.
- A simple "ms/op + ops/sec, mean and p99" summary format suitable
  for both human reading and machine diffing.

### Not Included

- Memory profiling (heap snapshots, GC pressure).
- Bundle-size tracking (covered by rslib-builder reporting).
- Cross-runtime benches (Bun, Deno) — Node.js only at first.
- PR-time perf gates or "fail the build on regression" automation.
  These create noise on hosted runners and can come later if the
  trend data justifies them.
- Cross-library benches (vs. `eemeli/yaml`, `js-yaml`). Covered by
  the differential harness in [test-corpus.md](./test-corpus.md).

## Proposed Structure

### Vitest Project

A new project entry in `vitest.config.ts`, mirroring the existing
`compliance` project shape:

```typescript
const bench = VitestProject.custom("yaml-effect:bench", {
  name: "yaml-effect:bench",
  include: ["__bench__/**/*.bench.ts"],
  benchmark: { reporters: ["default", "json"] },
});
```

Run via `pnpm run bench` (new script). The bench project does not
run as part of `pnpm run test` and is excluded from the default
test discovery, exactly like `compliance` is today.

### Directory Layout

```text
__bench__/
  package.json          # pins released yaml-effect for comparison
  fixtures/             # workload files (or generators for synthetic ones)
    tiny/
    dense-map/
    deep-seq/
    long-block-scalar/
    multi-doc-stream/
    real-world/         # consumes the OSS fixture submodule
  parse.bench.ts        # `parse(text)` — JS value extraction
  parse-document.bench.ts  # `parseDocument(text)` — full YamlDocument AST
  parse-cst.bench.ts    # `parseCSTAll(text)` — CST nodes only
  stringify.bench.ts    # `stringify(value)` round-trip from a parsed JS value
  schema-decode.bench.ts  # `Schema.decode(makeYamlSchema(...))` end-to-end
```

### Workload Buckets

Six buckets, each chosen to stress a different parser path:

| Bucket | Stresses | Sample size |
| ------ | -------- | ----------- |
| `tiny` | Per-call overhead (Effect runtime, schema construction) | < 100 bytes |
| `dense-map` | Hash-map insertion, key validation, key column tracking | ~10 KB, ~500 keys |
| `deep-seq` | Recursive descent, indent stack, allocation per node | ~5 KB, depth 50+ |
| `long-block-scalar` | Block-scalar decoder (lexer + composer paths) | ~50 KB, single scalar |
| `multi-doc-stream` | Per-document setup, directive handling, anchor map reset | ~20 KB, 50 docs |
| `real-world` | Mixed shapes from production YAML | varies; from OSS fixture repo |

The first five are checked into the repo as fixtures. The sixth
pulls from the real-world OSS fixture submodule described in
[test-corpus.md](./test-corpus.md), so the same effort that grows
that corpus also grows the bench coverage.

### Measurement Points

Five distinct measurements per workload (where applicable):

1. **`parse(text)`** — text -> JS value, the most common public
   call.
2. **`parseDocument(text)`** — text -> `YamlDocument` AST, the
   round-trip-fidelity entry point.
3. **`parseCSTAll(text)`** — text -> CST nodes, the fastest and
   most informative for finding regressions in lexer/parser
   isolation.
4. **`stringify(value)`** — JS value -> text, with default options.
5. **End-to-end Schema decode** — text -> typed value via
   `makeYamlSchema(...)`, the path users actually use for config
   loading.

Each measurement reports mean, p99, and ops/sec via Tinybench's
default statistics.

### Released-vs-Source Pinning

`__bench__/package.json` declares a dependency on the published
`yaml-effect@<previous-version>`. The bench files import from both
the workspace root (in-tree) and the pinned package (released), and
emit two parallel result sets per measurement. The CI summary
diffs them.

This gives a single command — `pnpm run bench` — that answers
"is HEAD faster or slower than the last release on the same
hardware?" without requiring a separate baseline run or a
hardware-stable reference machine.

The pinned version is updated in lockstep with the release
workflow, so each tag's bench run compares HEAD against the
previous tag.

### CI Cadence

Tag-only. No scheduled runs, no PR runs. This is the user's
explicit decision and reflects the GitHub-hosted runner noise
constraint above.

The workflow:

1. Triggers on `push` events that match `refs/tags/v*`.
2. Checks out at the tag, with submodules (the real-world
   fixtures live in a submodule).
3. Runs `pnpm install` and then `pnpm run bench --reporter=json`.
4. Computes a summary JSON with `parse-rate`, `parseDocument-rate`,
   `stringify-rate` headline numbers and the full per-workload
   table.
5. Pushes `benchmarks/<tag>.json` and a refreshed
   `bench-badge.json` to the orphan `benchmarks` branch.
6. The shields.io endpoint badge in the README points at
   `bench-badge.json` and shows the headline parse rate
   (e.g. "5.2 MB/s").

The orphan-branch pattern mirrors the existing compliance badge
pipeline (see [compliance-testing.md](./compliance-testing.md)
"Badge Pipeline"), so contributors only have to learn one
publishing model.

## Open Questions

- **Hosted-runner noise envelope.** What variance do we actually
  see across consecutive tag runs on the same input? If it is
  > 10%, we may need to either pin to a self-hosted runner or
  switch the headline number to a 7-tag rolling median. Cannot
  decide without data.
- **Self-hosted runner budget.** Self-hosted reduces noise but
  costs operational attention. Defer the decision until we have
  three or four tags of hosted-runner numbers to look at.
- **Memory profiling escape valve.** Should the same workload set
  also drive a `--prof` or heap-snapshot pass? Useful but
  separate; revisit after the time-based numbers are stable.
- **Headline number choice.** "MB/s" reads well in a badge but
  hides per-document overhead; "ops/sec on dense-map" is more
  informative but less marketable. Pick one for the badge, keep
  both in the JSON.

## Non-Goals

- Beating `js-yaml` on every workload. The thesis is "competitive
  on parse, faster on Schema-decode end-to-end" — not raw
  throughput parity.
- Continuous regression detection. We accept the risk of slipping
  perf between tags rather than pay the cost of false alerts on
  every PR.
- Bench-as-correctness-test. The bench harness measures speed; the
  compliance suite measures correctness. They are separate
  concerns.

## Cross-References

- [test-corpus.md](./test-corpus.md) — the real-world fixture
  repo whose contents drive the `real-world` workload bucket.
- [compliance-testing.md](./compliance-testing.md) — reference
  implementation of the orphan-branch badge pipeline that this
  doc mirrors.
- [roadmap.md](./roadmap.md) — places this work in Phase 1.
