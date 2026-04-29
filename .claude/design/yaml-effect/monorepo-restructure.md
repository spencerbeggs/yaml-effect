---
title: Monorepo Restructure (Proposed)
description: Proposed restructuring from single-package to multi-package layout to support yaml-effect-cli and any future sibling packages without disrupting the existing release pipeline.
status: stub
module: yaml-effect
category: architecture
created: 2026-04-29
updated: 2026-04-29
last-synced: 2026-04-29
completeness: 15
related:
  - roadmap.md
  - dx-and-cli.md
  - architecture.md
dependencies:
  - roadmap.md
  - dx-and-cli.md
---

## Overview

This document proposes restructuring the `yaml-effect` repository
from its current single-package-at-the-root layout to a
multi-package layout with packages under `packages/`. The change
is a prerequisite for shipping `yaml-effect-cli` (see
[dx-and-cli.md](./dx-and-cli.md)) as a separate npm package
co-developed in this repo.

The goal is to do the restructure once, carefully, in a way that
preserves the existing turborepo + rslib-builder + savvy-web/
changesets release pipeline without behavioural drift.

## Current State

The repository today is a single-package layout:

```text
yaml-effect/
  package.json              # the yaml-effect package itself
  src/
  __test__/
  rslib.config.ts
  vitest.config.ts
  turbo.json                # exists but only one task graph member
  pnpm-workspace.yaml       # exists, points at "."
  .changeset/
  .github/workflows/
```

The single package is the publishing target. `pnpm-workspace.yaml`
exists for tooling reasons but only declares the root. Everything
else (turbo, rslib-builder, vitest project setup) is configured
expecting one package.

`@savvy-web/rslib-builder` is referenced in CLAUDE.md as the
reference for multi-package setups — its repo at
[savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder)
is itself a multi-package monorepo using the same toolchain, so
a working pattern exists in the wider ecosystem.

## Rationale

Adding `yaml-effect-cli` to the same repo, rather than a
separate one, has three concrete benefits:

1. **Atomic changes across library and CLI.** When the CLI needs
   a new public API, the API addition and the CLI change ship in
   one PR, one changeset, and one CI run. Cross-repo
   coordination disappears.
2. **Free reuse of existing infrastructure.** Turbo task graph,
   rslib-builder dual-output build, vitest project filtering,
   savvy-web/changesets release workflow, husky hooks,
   commitlint config, biome config — all of it already works
   for one package, and turbo / pnpm-workspace handle multi-
   package setups out of the box. The marginal infrastructure
   cost of a second package is low.
3. **Consistent versioning.** Both packages can share a
   compatible version range via the changeset workflow. Users
   see `yaml-effect@1.x.y` and `yaml-effect-cli@1.x.y` as
   coordinated artifacts.

Doing it as a separate repository would multiply CI configuration,
require version-coordination dance for any cross-cutting change,
and force the CLI to depend on a published `yaml-effect` instead
of `workspace:*`.

## Scope

### Included

- Move source from `src/` and tests from `__test__/` into
  `packages/yaml-effect/`.
- Move `rslib.config.ts` and `vitest.config.ts` into the new
  package directory; update them to reference paths relative to
  their new location.
- Update `pnpm-workspace.yaml` to declare `packages/*`.
- Update `turbo.json` so its task graph references package-
  scoped tasks (each package gets its own
  `types:check` / `build:dev` / `build:prod` / `test`).
- Update root `package.json` to reflect "monorepo root" rather
  than "the package" — strip publish-related fields, keep
  scripts that orchestrate workspace-wide tasks.
- Update `.changeset/config.json` so changesets target the
  per-package version files.
- Add `packages/yaml-effect-cli/` skeleton with its own
  `package.json`, `rslib.config.ts`, `tsconfig.json`, `src/`,
  ready to receive the CLI work described in
  [dx-and-cli.md](./dx-and-cli.md).
- Update CI workflows (`.github/workflows/*.yml`) — the
  compliance, build, and release workflows — to operate on the
  workspace rather than the single root package. Most just need
  `pnpm -r ...` instead of `pnpm ...`.
- Update CLAUDE.md to point at the new package layout.
- Update README.md install / import examples to use the
  package's new path.

### Not Included

- Splitting `src/` itself into smaller internal packages. The
  library code stays as a single package; only the CLI is
  extracted as a sibling. Internal modularity is a separate
  question.
- Adding more sibling packages (a hypothetical
  `yaml-effect-lsp`). Out of scope for this restructure;
  revisit if and when those packages are ready.
- Renaming the npm package. `yaml-effect` stays
  `yaml-effect`. The CLI is `yaml-effect-cli`.

## Proposed Target Layout

```text
yaml-effect/
  package.json                     # workspace root, no publishing
  pnpm-workspace.yaml              # declares packages/*
  turbo.json                       # task graph for all packages
  .changeset/                      # changeset config + pending
  .github/workflows/               # workspace-aware CI
  CLAUDE.md
  README.md
  packages/
    yaml-effect/
      package.json                 # the publishable library
      rslib.config.ts
      tsconfig.json
      vitest.config.ts             # the yaml-effect + compliance projects
      src/                         # what is currently at the root's src/
      __test__/                    # ditto
      __bench__/                   # benches once they exist
    yaml-effect-cli/
      package.json                 # the publishable CLI
      rslib.config.ts
      tsconfig.json
      vitest.config.ts             # CLI-specific tests
      src/
      bin/                         # the executable entry point
```

The single `node_modules` and `.pnpm` workspace metadata at the
root continue to work; pnpm handles workspace symlinking
automatically.

## Migration Plan

The migration runs in a single PR — partial migrations leave the
release pipeline in an undefined state. The PR has its own
changeset entry describing the move.

### Step 1 — Create the New Layout

1. `mkdir -p packages/yaml-effect && git mv` everything that
   currently lives at the root into `packages/yaml-effect/`,
   except: the workspace-level files
   (`pnpm-workspace.yaml`, `turbo.json`, `.changeset`,
   `.github`, `.husky`, `CLAUDE.md`, `README.md`,
   `LICENSE`, `.gitignore`, `.gitmodules`, the workspace
   `package.json`).
2. Update `packages/yaml-effect/package.json`'s `name`
   stays `yaml-effect`. Its `exports` paths stay relative
   to its own directory (rslib-builder will rewrite them on
   build).
3. The `__test__/fixtures/yaml-test-suite/` submodule moves
   with the package; update `.gitmodules` to point the
   submodule at the new path.

### Step 2 — Workspace-Level Configuration

1. `pnpm-workspace.yaml`: replace single `.` entry with
   `packages: ["packages/*"]`.
2. Root `package.json`: strip `dependencies`, keep
   `devDependencies` for tooling (turbo, biome, commitlint,
   etc.). Set `private: true` (the workspace root is not
   published). Scripts become orchestrators (e.g.
   `"test": "turbo run test"`).
3. `turbo.json`: tasks unchanged in shape but now run per
   workspace package. Cache exclusions stay as they are.

### Step 3 — CLI Skeleton

`packages/yaml-effect-cli/` gets a minimal skeleton that
builds and publishes successfully even before any subcommands
are implemented. Its `package.json`:

- depends on `yaml-effect: workspace:*`.
- declares `bin: { "yaml-effect": "./dist/npm/cli.js" }` (or
  whatever rslib-builder's binary entrypoint convention is).
- has the same `publishConfig` pattern as `yaml-effect`,
  publishing to both GitHub Packages and npm with provenance.

### Step 4 — Changesets

`.changeset/config.json` already supports multi-package mode;
it just needs `"linked": []` (or `"fixed": [...]` if we want
versions locked) explicitly set. Use `"linked": []` initially
— packages can drift in version, which is fine because the CLI
is functionally a wrapper.

The release workflow (savvy-web/workflow-release-action) is
already multi-package-aware — it bumps and publishes whichever
packages have pending changesets.

### Step 5 — CI Updates

`.github/workflows/compliance.yml` runs against
`packages/yaml-effect/`; otherwise its logic is unchanged.
Other workflows substitute `pnpm` for `pnpm -r` where they
need to operate on all packages, or `pnpm -F yaml-effect` for
specific-package operations.

### Step 6 — Documentation

CLAUDE.md path references update from `src/utils/parser.ts` to
`packages/yaml-effect/src/utils/parser.ts`, etc. The design
docs in `.claude/design/yaml-effect/` already use module-
relative paths in most places; spot-fix anywhere a hard root
path leaked in.

README.md install instructions stay `pnpm add yaml-effect`;
the move is invisible to library consumers.

## Risks

- **Release pipeline brittleness.** The savvy-web/changesets
  workflow is well-tested for multi-package, but each
  configuration is one-of-a-kind. Risk: the first release
  after restructure mis-publishes one of the packages. Mitigation:
  do the restructure on a long-lived branch, run a release
  dry-run, validate the published `dist/npm/package.json`
  contents before merging.
- **Submodule-path drift.** The yaml-test-suite submodule path
  changes. Risk: contributors who already have the submodule
  initialised get confused. Mitigation: document the migration
  in CHANGELOG and CLAUDE.md.
- **Test cache invalidation.** Turbo's cache keys change when
  paths change. Risk: first-run builds are slow. Mitigation:
  this is a one-time cost, accept it.
- **Vitest project paths.** The `compliance` and `yaml-effect`
  Vitest projects use relative `include` patterns. Risk:
  patterns silently match nothing after the move. Mitigation:
  verify locally before pushing.
- **Importer paths in the codebase.** The library is internally
  consistent (relative `.js` imports) so nothing should break,
  but `__test__/` files sometimes import from the package via
  `../src/` patterns; those stay working because the move
  preserves their relative position.

## Compatibility With Existing Pipelines

| Tool | Adjustment Needed |
| ---- | ----------------- |
| pnpm | `pnpm-workspace.yaml` updated to `packages/*`; `pnpm install` re-bootstraps. |
| Turbo | `turbo.json` task names unchanged; pipeline auto-adapts because each package has its own scripts. |
| rslib-builder | Per-package `rslib.config.ts`. The transform/publishConfig pattern works the same in any package. |
| savvy-web/changesets | Already multi-package-aware. Set `"linked": []` for independent versions. |
| Husky | Hooks live at the repo root; no change. |
| Biome | Workspace-aware via `biome.jsonc`; no change. |
| Commitlint | Workspace-agnostic; no change. |

## Open Questions

- **Linked-versions vs. independent.** Should
  `yaml-effect@1.5.0` always pair with `yaml-effect-cli@1.5.0`
  (linked) or are they free to drift (independent)? Independent
  is simpler to start; linked can be retrofitted later.
- **Publish CLI to GitHub Packages too.** The library
  publishes to both npm and GitHub Packages. The CLI almost
  certainly should too, for consistency, but it adds one more
  publish step per release.
- **Migration timing.** Do the restructure as a standalone PR
  before any CLI work begins, or fold the restructure and CLI
  skeleton into a single PR? Standalone is safer (one big
  thing changes at a time); fold is faster.
- **`workspace:*` vs. version-pinned dependency.** The CLI
  declares `"yaml-effect": "workspace:*"`. At publish time,
  rslib-builder / changesets rewrites this to a real version.
  Verify that rewrite happens before merging.
- **Splitting tests.** `__test__/` lives with `yaml-effect`.
  CLI tests live in `packages/yaml-effect-cli/__test__/`. The
  yaml-test-suite submodule stays only with `yaml-effect`.

## Non-Goals

- **Internal modularisation of the library.** The library
  stays one package. Splitting `composer`, `parser`, `lexer`
  into separate sub-packages is a different decision and is
  not warranted by current evidence.
- **Generic monorepo template extraction.** This restructure
  is for `yaml-effect` specifically; do not generalise it
  into a reusable template.
- **Renaming packages.** `yaml-effect` stays
  `yaml-effect`; `yaml-effect-cli` is the new sibling.

## Cross-References

- [dx-and-cli.md](./dx-and-cli.md) — the consumer of this
  restructure; the CLI work cannot start without it.
- [roadmap.md](./roadmap.md) — places this restructure as
  the prerequisite for Phase 3 CLI delivery.
- [architecture.md](./architecture.md) — describes the
  current single-package layout that this restructure
  changes.
