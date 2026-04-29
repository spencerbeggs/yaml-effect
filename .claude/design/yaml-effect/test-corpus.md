---
title: Test Corpus Expansion (Proposed)
description: Proposed property-based testing, OSS real-world fixture repo, and differential testing harness for yaml-effect.
status: stub
module: yaml-effect
category: testing
created: 2026-04-29
updated: 2026-04-29
last-synced: 2026-04-29
completeness: 15
related:
  - roadmap.md
  - perf-benchmarking.md
  - compliance-testing.md
  - architecture.md
dependencies:
  - roadmap.md
---

## Overview

This document proposes three test-corpus initiatives that, together,
move `yaml-effect` from "passes the official test suite" to
"validated against everything users actually do":

1. **Property-based testing** via `fast-check`, with four
   shrinkable invariants. Phase 1 work.
2. **A standalone OSS real-world fixture repo**, modeled after
   `yaml/yaml-test-suite`, consumed via git submodule. Phase 3 work.
3. **A differential testing harness** comparing `yaml-effect`
   against `eemeli/yaml` and `js-yaml`, framed around historical
   primacy rather than spec faithfulness. Phase 4 work.

## Current State

The only test corpus today is the official `yaml-test-suite`
(~440 cases, embedded as a git submodule at
`__test__/fixtures/yaml-test-suite/`, currently 100% passing —
see [compliance-testing.md](./compliance-testing.md)). Unit tests
in `src/**/*.test.ts` cover the `__test__/debug-multiline.test.ts`-
style regression guards plus per-module sanity tests.

There is no property-based testing, no real-world fixture corpus,
and no cross-library differential testing.

## Rationale

The compliance suite catches **specification** bugs. It does not
catch:

- **Real-world syntactic patterns** that the spec permits but the
  authors of yaml-test-suite did not think to encode (Helm chart
  go-template escapes, multi-line keys nobody writes, GitHub
  Actions matrix-expansion shapes, pnpm lockfile float precision).
- **Library-author divergences** — places where `eemeli/yaml`,
  `js-yaml`, and `yaml-effect` all parse the same input but
  produce subtly different values. The spec is silent on enough
  edge cases that all three can be defensible.
- **Invariants the spec doesn't talk about** but that downstream
  code relies on: round-trip stability, equality reflexivity, AST
  offsets being in-bounds, edits being reversible.

Each of the three initiatives below targets one of these gaps.

## Property-Based Testing (Phase 1)

### Tooling

`fast-check` as the property runner. It produces shrinkable
counterexamples — when an invariant fails, the framework reduces
the failing input to the smallest YAML string that still triggers
the bug, which makes triage dramatically cheaper than manual
fuzz-based debugging.

Lives as part of the existing `yaml-effect` Vitest project (no
separate project), so `pnpm run test` runs property tests alongside
unit tests. Per-property timeouts keep wall-clock manageable; CI
runs more iterations than local.

### The Four Invariants

1. **Round-trip stability.** For any value `v` that survived
   `parse`/`stringify`, `parse(stringify(parse(stringify(v))))`
   must equal `parse(stringify(v))`. The first round-trip can
   normalise; the second one must not. This catches stringifier
   bugs that produce nominally-valid output our own parser then
   reads as a different value.
2. **Equality reflexivity.** For any input `text`, `equals(text,
   text)` is `true`, and `equalsValue(text, parse(text))` is
   `true`. Subverted historically by sequence-order normalisation
   regressions and by accidental key-ordering changes in the
   stringifier.
3. **Offsets-in-bounds.** For any AST produced by `parseDocument`,
   every `node.offset + node.length <= text.length` and `offset
   >= 0`. This catches off-by-one bugs in lexer / parser /
   composer that show up as confusing errors in`format` or
   `modify`.
4. **`applyEdits` is reversible.** Given `edits` produced by
   `format(text)` or `modify(text, ...)`, `applyEdits(text,
   edits)` produces the same string the format/modify operation
   produced via its own internal stringify. Catches diff-builder
   regressions in `computeEdits`.

Each invariant has a fast-check arbitrary that generates inputs
biased toward shapes our parser has historically struggled with:
mixed flow/block, anchored aliases, multi-line keys, block
scalars with explicit indent indicators, multi-document streams.

### Coverage-Guided Fuzzing

Explicitly deferred. Property tests + shrinking give most of the
bug-finding leverage at a fraction of the infrastructure cost.
If property tests stop finding new bugs and we want more coverage,
we revisit `jsfuzz` or similar.

## OSS Real-World Fixture Repo (Phase 3)

### Why a Standalone Repo

Vendoring real-world YAML files into `yaml-effect` itself would
mix license concerns (Helm charts under Apache, Kubernetes
manifests under MIT, etc.) with the library's MIT codebase, would
inflate `node_modules` for every library consumer, and would not
benefit the broader ecosystem.

A standalone repo, modeled after `yaml/yaml-test-suite`, solves
all three: separate licensing, opt-in consumption via submodule,
and shared benefit for `eemeli/yaml`, `js-yaml`, and any future
parser to validate against.

### Proposed Repo Layout

```text
yaml-real-world-corpus/
  README.md
  LICENSE                       # likely CC0 or MIT, see Open Questions
  CONTRIBUTING.md
  fixtures/
    helm/
      <chart-name>/
        <fixture-id>/
          source.yaml           # raw YAML
          source.url            # provenance: where it came from
          source.license        # original license
          notes.md              # what makes this fixture interesting
    kubernetes/
    github-actions/
    pnpm-lockfiles/
    helm-templates/
    openapi/
    config/                     # generic .yamlrc, .yaml-anything configs
    edge-cases/                 # contributor-curated weird shapes
  index.json                    # machine-readable catalogue
```

Each fixture directory mirrors the yaml-test-suite layout closely
enough that consumers can reuse the existing loader pattern.
`index.json` allows filtering ("give me everything tagged
`flow-collections`") without walking the tree.

### Contribution Process

The contribution model parallels existing official-corpus
projects:

- Contributors open a PR adding a new fixture directory.
- Each fixture must include `source.yaml`, `source.url`,
  `source.license`, and a brief `notes.md` explaining what makes
  the fixture interesting (a known parser bug, a real-world shape,
  etc.).
- Personal data and secrets are forbidden — fixtures are public.
- Fixtures must be re-distributable under the corpus repo's
  chosen license (subject to the original `source.license`).
- Maintainers (`@spencerbeggs` initially) review for redistribution
  legality and corpus relevance.

### Submodule Integration

`yaml-effect` consumes the corpus the same way it consumes
yaml-test-suite today: as a git submodule under
`__test__/fixtures/real-world/`, pinned to a tag. A new Vitest
project named `real-world` runs the existing assertion harness
(parse / parseDocument / stringify round-trip) against each
fixture and skips with `describe.skipIf(!suiteAvailable)` when
the submodule is not initialised.

The same submodule provides the `real-world` workload bucket for
[perf-benchmarking.md](./perf-benchmarking.md) — one corpus, two
threads served.

### Licensing Posture

Each fixture's original license must permit redistribution. The
corpus repo itself uses a permissive license (likely CC0 or MIT,
see Open Questions) so that consumers — including parsers other
than `yaml-effect` — can integrate without legal review.
Contributors warrant that the YAML they submit is either their
own work, in the public domain, or carries a license compatible
with redistribution.

The `source.url` and `source.license` fields are required so
provenance and original terms travel with each fixture.

## Differential Testing (Phase 4)

### Harness

A separate `differential` Vitest project that:

1. Loads inputs from three sources: yaml-test-suite, the
   real-world corpus submodule, and fast-check arbitraries.
2. Parses each input with `yaml-effect`, `eemeli/yaml`, and
   `js-yaml`.
3. Compares the resulting JS values via deep equality (with
   `NaN === NaN` special-cased).
4. Logs every divergence to a JSON report grouped by triage
   category.

### Triage Framing — Historical Primacy

This is the deliberate choice the user wants captured: when
parsers disagree, **`eemeli/yaml` and `js-yaml` predate
`yaml-effect`**, so the burden of proof is on `yaml-effect` to
justify any divergence. This is **not** "the older parser is
correct" — there is no gold-star authority for YAML semantics
beyond yaml-test-suite, and the spec itself underspecifies enough
that all three libraries are defensible on most edge cases. It
is "the older parsers are what users have built against, so when
we differ, we owe an explanation."

Concretely, triage categories are:

- **A: yaml-effect agrees with both predecessors** — no action.
- **B: yaml-effect differs from both** — investigate; the
  default outcome is "yaml-effect changes to match," with
  override only when we can cite the spec text in our favour.
- **C: predecessors disagree with each other** — log as
  documentation. We pick whichever we can defend; this is the
  underspecified-edge-case bucket.
- **D: yaml-effect agrees with one predecessor only** —
  investigate; weight toward the agreeing predecessor unless
  spec text says otherwise.

The point of capturing the framing in this design doc is that
when this work is picked up later, "match the OG parsers" is
the operating policy and "be spec-faithful" is not — because
the latter, on contested cases, is unfalsifiable.

### Adversarial / Resource-Bound Tests

Separate from the differential corpus, this is a small in-repo
suite that asserts:

- Parser terminates on billion-laughs-style alias bombs (covered
  today by `maxAliasCount` — pin a regression test).
- Parser terminates on deeply-nested input within a configurable
  depth limit.
- Parser does not allocate unbounded memory on long block
  scalars.
- Parser handles UTF-8 / UTF-16 boundary cases (surrogate
  pairs, BOM, invalid sequences).

These are essentially DOS-resistance regression guards. They run
in the existing `yaml-effect` project and do not need a separate
infrastructure.

### Error-Message-Quality Lock-Ins

Snapshot tests for the rendered output of the public code-frame
renderer (see [dx-and-cli.md](./dx-and-cli.md)) against a curated
set of failing inputs. Catches regressions where a parser change
makes errors less informative without changing whether they fire.

## Open Questions

- **Corpus repo name.** `yaml-real-world-corpus`?
  `yaml-fixtures-in-the-wild`? Something shorter? Decide before
  the first push.
- **Corpus license.** CC0 (true public domain, simplest for
  redistribution) vs. MIT (more familiar but adds attribution
  requirement). Probably CC0; needs lawyer-eyeballs.
- **Governance model.** Single-maintainer (`@spencerbeggs`) for
  v1, transition to a small group when traffic justifies it.
  Decide what "justifies it" means — ten contributors? Hundred
  fixtures? Be explicit.
- **Attribution policy.** Per-fixture `notes.md` lists the
  contributor; corpus README has an aggregate `CONTRIBUTORS.md`.
  Pull-request template enforces attribution.
- **Deferred coverage-guided fuzzing.** Revisit when property
  tests stop finding new bugs.

## Non-Goals

- Vendoring real-world YAML directly into the `yaml-effect`
  repository. Always submodule-consumed.
- Cross-runtime corpus differences (Bun, Deno). Node.js only at
  first.
- Translating yaml-test-suite into a different format. The
  existing layout is a pinned tag; we do not fork it.
- Coverage-guided fuzzing. Deferred to post-1.0.
- Treating `eemeli/yaml` / `js-yaml` as ground truth. They are
  weighted by historical primacy, not by being correct.

## Cross-References

- [perf-benchmarking.md](./perf-benchmarking.md) — the OSS
  real-world fixture submodule also feeds the `real-world` bench
  bucket.
- [compliance-testing.md](./compliance-testing.md) — the
  yaml-test-suite integration pattern this doc mirrors for the
  real-world corpus.
- [dx-and-cli.md](./dx-and-cli.md) — error-message snapshots
  depend on the code-frame renderer.
- [roadmap.md](./roadmap.md) — places property tests in Phase
  1, OSS corpus in Phase 3, differential harness in Phase 4.
