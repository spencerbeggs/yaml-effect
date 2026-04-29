---
title: Post-1.0 Roadmap
description: Forward-looking phased plan for shipping yaml-effect 1.0 and beyond. Acts as the index for the proposal docs in this directory.
status: stub
module: yaml-effect
category: architecture
created: 2026-04-29
updated: 2026-04-29
last-synced: 2026-04-29
completeness: 15
related:
  - perf-benchmarking.md
  - test-corpus.md
  - effect-features.md
  - dx-and-cli.md
  - monorepo-restructure.md
  - architecture.md
  - compliance-testing.md
dependencies: []
---

## Overview

This document is the forward-looking index for `yaml-effect`. It captures
the proposed work between "100% spec compliance" (current state) and
"1.0.0 release" (target state), and the post-1.0 work that becomes possible
once the foundations are in place.

The detailed designs live in sibling docs in this directory. This file
exists to give a single place to see the whole shape of the plan, the
ordering between work items, and the cross-cutting synergies that link
them. None of the work described here has started; everything is
proposed.

## Current State

The library is at 100% YAML 1.2 compliance against the official
yaml-test-suite (parse, JSON, canonical output, and round-trip). It has
no peer dependencies beyond `effect`. It has no benchmarks, no real-world
fixture corpus beyond yaml-test-suite, no CLI, and no public source-frame
error rendering. The repo is a single-package layout at the root.

Pre-1.0 work is therefore not about correctness — it is about turning a
correct parser into a library that is pleasant to adopt, possible to
trust over time, and differentiated from `eemeli/yaml` and `js-yaml` by
something other than "it has Effect types."

## Rationale

The four-phase shape below was chosen to get user-visible value out as
early as possible while putting the slow infrastructure work
(benchmarks, real-world fixtures, OSS governance) on a parallel track
so it is ready when needed.

The cross-cutting threads matter as much as the per-phase work:

- The **public code-frame renderer** is a hard prerequisite for both the
  CLI and any LSP work. Doing it once early pays for both later.
- The **OSS real-world fixture repo** doubles as the benchmark workload
  source. Same effort, two threads served.
- **Property tests + perf benchmarks together** form a 1.0
  ship-readiness gate — neither alone is sufficient.
- **Branded scalars + tag-handler service + code frames** together make
  the "config-loading library" pitch coherent, and that pitch is what
  separates `yaml-effect` from a port-of-libyaml.

## Phase 1 — Foundations (near-term, pre-1.0)

Foundational infrastructure that does not change any public API but
unblocks every later phase.

- **Public code-frame renderer.** A small (~150 LoC) public utility that
  takes a `YamlError` (with offset / length) plus the source text and
  produces a coloured caret-and-context excerpt. First DX win, and a
  hard prerequisite for the CLI and LSP threads. See
  [dx-and-cli.md](./dx-and-cli.md).
- **Property-based test suite via fast-check.** Four invariants —
  round-trip stability, equality reflexivity, offsets-in-bounds for all
  AST nodes, and `applyEdits` being reversible. Adds shrinking and
  catches whole categories of regressions yaml-test-suite cannot. See
  [test-corpus.md](./test-corpus.md).
- **Vitest bench project + Tinybench.** New `yaml-effect:bench` Vitest
  project, three initial workloads (tiny, dense map, deeply nested
  seq), measuring `parse` and `parseDocument`. Manual-dispatch CI to
  start; tag-only automated runs once the workload set is finalised.
  See [perf-benchmarking.md](./perf-benchmarking.md).

## Phase 2 — Differentiators (the 1.0 thesis)

The features that make `yaml-effect` worth picking over `js-yaml` /
`eemeli/yaml` for the use case it is best at: typed config loading
inside an Effect application.

- **Branded-scalar Schema decoding with source-position errors** — a
  `makeYamlSchemaWithSource` variant that, on Schema validation
  failure, returns errors carrying the YAML offset / line / column of
  the failing scalar. Combined with the code-frame renderer, this
  produces a `tsc`-quality config-error experience that no other
  ecosystem library currently gives you. Open question on whether the
  public surface should be Effect Schema or Standard Schema. See
  [effect-features.md](./effect-features.md).
- **`TagResolver` service via `Layer` / `Context`.** Today
  `!handle!suffix` resolution is hard-coded against the `%TAG`
  directive map. A `TagResolver` service lets applications register
  custom tag handlers (decrypt-on-load, env-var expansion, JSON-Schema
  validation per tag) via Effect's standard DI machinery. See
  [effect-features.md](./effect-features.md).
- **Telemetry: `Effect.withSpan` + `Metric` instrumentation.** Wrap the
  three pipeline stages (lex / parse / compose) in spans, count
  documents parsed and errors per code, expose histograms for
  parse-time-by-byte-size. Native OpenTelemetry export. See
  [effect-features.md](./effect-features.md).

## Phase 3 — Delivery (the 1.0 release surface)

User-facing surface that carries the 1.0 messaging.

- **Separate `yaml-effect-cli` package in this monorepo.** `lint`,
  `format`, `check`, and `ast` subcommands built on `@effect/cli` and
  Ink. Released to npm as a separate package, co-developed in this
  repo via Turborepo + rslib-builder. Requires the
  monorepo-restructure work first. See
  [dx-and-cli.md](./dx-and-cli.md) and
  [monorepo-restructure.md](./monorepo-restructure.md).
- **OSS real-world fixture repo + submodule consumer.** A standalone
  open-source repository (modeled after `yaml/yaml-test-suite`) that
  collects real-world YAML files — Kubernetes manifests, GitHub
  Actions workflows, pnpm lockfiles, Helm charts, OpenAPI specs.
  Consumed via git submodule the same way we consume yaml-test-suite
  today. See [test-corpus.md](./test-corpus.md).
- **YAML 1.1 migration linter.** A parse option that surfaces
  warnings (not failures) for documents using YAML 1.1 idioms that
  changed semantics in 1.2 — `yes`/`no` booleans, `<<` merge keys,
  octal `0NNN` literals. Explicitly **not** a 1.1 compatibility
  mode; the parser stays 1.2-only. See
  [dx-and-cli.md](./dx-and-cli.md).

## Phase 4 — Post-1.0 (after the release)

Work that is interesting but does not block 1.0.

- **LSP `Diagnostic` shape and `suggestFixes` patterns.** Position
  yaml-effect as a pluggable parser backend for editor tooling
  rather than competing with Red Hat's `yaml-language-server`.
  Build the data shape (LSP `Diagnostic`, `CodeAction`) on top of
  the existing error / edit infrastructure. See
  [dx-and-cli.md](./dx-and-cli.md).
- **Differential test harness vs. `eemeli/yaml` and `js-yaml`.**
  Generate inputs (yaml-test-suite + real-world corpus +
  fast-check), parse with all three libraries, triage differences.
  Frame: `eemeli/yaml` and `js-yaml` predate `yaml-effect`, so when
  outputs disagree, the burden of proof is on us. This is
  historical primacy, **not** spec faithfulness — there is no
  gold-star authority. See [test-corpus.md](./test-corpus.md).
- **RSPress docs site with `@rspress/plugin-playground`.** A docs
  site that lets readers run parse / stringify / Schema-decode in
  the browser against their own YAML. The savvy-web ecosystem
  already uses RSPress so the tooling cost is low.

## Explicit Non-Goals

These have been considered and explicitly rejected for the foreseeable
future:

- **A YAML 1.1 compatibility mode.** The migration linter surfaces
  warnings; it does not change parse semantics.
- **Sync adapter shims for `js-yaml` / `yaml`.** Effect-first by
  design; the CLI and any sync sugar live behind their own
  packages, not in the core.
- **A full LSP server competing with `yaml-language-server`.** We
  expose data shapes; we do not own the server lifecycle.
- **STM-based transactional edits.** No use case justifies the
  complexity yet.
- **Edit-aware incremental reparse.** Same: no use case yet.
- **Coverage-guided fuzzing pre-1.0.** Property tests (Phase 1)
  give most of the bug-finding leverage at a fraction of the
  infrastructure cost.

## Cross-References

- [perf-benchmarking.md](./perf-benchmarking.md) — Phase 1 bench
  setup and tag-only CI cadence
- [test-corpus.md](./test-corpus.md) — Phase 1 property tests, Phase
  3 OSS fixture repo, Phase 4 differential harness
- [effect-features.md](./effect-features.md) — Phase 2 branded
  scalars, `TagResolver`, telemetry
- [dx-and-cli.md](./dx-and-cli.md) — Phase 1 code frames, Phase 3
  CLI and migration linter, Phase 4 LSP shape
- [monorepo-restructure.md](./monorepo-restructure.md) — Phase 3
  prerequisite for shipping the CLI package

## Open Questions

These are captured as future-decision points, not blockers:

- Does the public surface for the branded-scalar feature (Phase 2)
  use Effect Schema directly, or Standard Schema for cross-library
  interop? Captured in detail in
  [effect-features.md](./effect-features.md).
- What name, license, governance model, and contributor-attribution
  policy fit the OSS fixture repo (Phase 3)? Captured in
  [test-corpus.md](./test-corpus.md).
- How exactly do we split this single-package layout without
  disrupting Changesets and the existing release pipeline?
  Captured in [monorepo-restructure.md](./monorepo-restructure.md).
