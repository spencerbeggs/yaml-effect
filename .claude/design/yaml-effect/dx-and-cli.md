---
title: Developer Experience and CLI (Proposed)
description: Proposed public code-frame renderer, separate yaml-effect-cli package, YAML 1.1 migration linter, and post-1.0 LSP diagnostic shape.
status: stub
module: yaml-effect
category: integration
created: 2026-04-29
updated: 2026-04-29
last-synced: 2026-04-29
completeness: 15
related:
  - roadmap.md
  - monorepo-restructure.md
  - effect-features.md
  - errors.md
  - format-modify.md
  - test-corpus.md
dependencies:
  - roadmap.md
  - errors.md
---

## Overview

This document proposes the user-facing developer experience layer
for `yaml-effect`:

1. **A public code-frame renderer** — the first DX win, and a hard
   prerequisite for the CLI and any LSP work. Phase 1.
2. **A separate `yaml-effect-cli` package** in this monorepo, with
   `lint`, `format`, `check`, and `ast` subcommands. Phase 3.
3. **A YAML 1.1 migration linter** as a parse option that surfaces
   warnings, not failures. Phase 3.
4. **An LSP `Diagnostic` shape and `suggestFixes` patterns** for
   post-1.0, positioning yaml-effect as a pluggable parser
   backend rather than a competing language server. Phase 4.

The CLI work assumes a multi-package monorepo layout, which the
repo does not have today. That restructuring is captured in
[monorepo-restructure.md](./monorepo-restructure.md).

## Current State

`yaml-effect` is a library only. Errors are returned via Effect's
typed error channel as `YamlError` subclasses with offset/line/
column on each `YamlErrorDetail`. Consumers who want to render
those errors with source context — caret pointing at the failing
character, surrounding lines for context, colourisation — have to
build that renderer themselves.

There is no CLI. There is no LSP integration. The library is
effectively unusable from the command line; users who want to
format or lint YAML files in a build pipeline today reach for
`yamllint` (Python) or `prettier` (which has YAML support but
not yaml-effect's compliance).

## Rationale

The hardest sell for any new YAML library is "why should I
switch from `js-yaml`?" The library-mode answer is "Effect
types and 100% compliance," which works for some consumers
but not most. The CLI and LSP-shape work convert the library
into a tool you can drop into a non-Effect project (a
GitHub Actions workflow, a pre-commit hook, an editor plugin)
without ever importing `effect`.

The code-frame renderer is the prerequisite that makes all of
that worthwhile. Without per-error caret rendering, the CLI's
output is no better than `js-yaml`'s; with it, the CLI is
materially better than anything in the JavaScript ecosystem
today.

## Public Code-Frame Renderer (Phase 1)

### What It Is

A small, exported utility (~150 LoC, no new dependencies) that
turns a `YamlError` plus the source text into a coloured
caret-and-context excerpt suitable for terminal output:

```text
error: Duplicate anchor 'a' (DuplicateAnchor)
  --> input.yaml:3:4
   |
 1 | items:
 2 |   - &a value1
 3 |   - &a value2
   |     ^^ anchor was previously defined at line 2
```

### API Shape

Two layers, so the same renderer is usable inside Effect and
outside:

```typescript
// Pure rendering: takes pre-extracted error + text, returns
// formatted string.
function renderCodeFrame(
  text: string,
  error: { offset: number; length: number; message: string; code?: string },
  options?: {
    color?: boolean;
    contextLines?: number;
    filename?: string;
  },
): string;

// Convenience: takes a YamlError directly, fans out per-detail.
function renderYamlError(
  text: string,
  error: YamlError,
  options?: { ... },
): string;
```

`renderCodeFrame` is generic over the error shape — it only
needs `offset`, `length`, and `message`. This means the same
renderer works for the position-aware Schema decode errors
proposed in [effect-features.md](./effect-features.md), not
just for `YamlError`.

### Implementation Notes

- Use `String.prototype.split("\n")` and walk to the offset
  to find line/column. The lexer already tracks `line`/
  `column` on tokens; the renderer recomputes from raw text
  to stay decoupled from the parser.
- ANSI colour codes wrapped in a tiny detector that disables
  colour when `process.env.NO_COLOR` is set or
  `process.stdout.isTTY` is false. No `chalk` dependency.
- `contextLines` defaults to 2 above and 2 below.
- Caret length matches the error's `length` field (so a
  multi-character problem shows multi-character `^^^`).

### Why First

Three downstream consumers depend on this:

- The CLI (Phase 3) prints these for every parse error.
- The LSP shape (Phase 4) embeds these in `Diagnostic.message`
  for editors that don't render carets natively.
- The position-aware Schema decode errors (Phase 2 in
  [effect-features.md](./effect-features.md)) become useful
  only when there is a renderer to consume them.

Building the renderer once means three downstream features
get it for free.

## Separate `yaml-effect-cli` Package (Phase 3)

### Layout

A new package at `packages/yaml-effect-cli/`, published to npm
as `yaml-effect-cli`, depending on `yaml-effect` (workspace:*).
Co-developed in this monorepo; built and released by the same
turborepo + rslib-builder + savvy-web/changesets pipeline that
ships `yaml-effect` today.

The monorepo restructuring required to support a second
package is captured in
[monorepo-restructure.md](./monorepo-restructure.md). This doc
assumes that work has happened.

### Subcommands

Built on `@effect/cli` for argument parsing and Ink for any
interactive output. Both are mature within the Effect
ecosystem and play well with the library's existing Effect
types.

| Subcommand | Behaviour |
| ---------- | --------- |
| `yaml-effect lint <files>` | Parse each file, render errors via the code frame, exit non-zero on any error. |
| `yaml-effect format <files>` | Parse, run `format()`, write the result back. `--check` to dry-run. |
| `yaml-effect check <files>` | Validate against a Schema (file path or module specifier). Renders position-aware errors. |
| `yaml-effect ast <file>` | Pretty-print the parsed AST as JSON for debugging. |

`lint` and `format` accept globs and `-` (stdin). `check`
accepts `--schema=path/to/module.ts:exportName`. All
subcommands respect `--no-color` and standard CI conventions.

### Migration Linter Integration

The `lint` subcommand opt-in flag `--yaml-1.1-migration`
enables the migration warnings described below. They render
through the same code-frame renderer as parse errors but with
a "warning" severity colour. The flag is opt-in so that
existing CI pipelines do not start failing on `yes`/`no`
booleans the moment they upgrade.

### Why a Separate Package

Bundling `@effect/cli` and Ink into the main `yaml-effect`
package would inflate the bundle for every library consumer,
including those importing it for browser use. A separate
package is the standard solution; turborepo + rslib-builder
make it cheap to maintain.

## YAML 1.1 Migration Linter (Phase 3)

### Why a Linter, Not a Compatibility Mode

YAML 1.1 features that changed semantics in 1.2 — `yes`/
`no`/`on`/`off` booleans, `<<` merge keys, sexagesimal
numbers, octal `0NNN` literals — are legacy. The library
explicitly does not support them as live parse semantics
(see [architecture.md](./architecture.md), Decision 3).

But the cost of upgrading from `js-yaml` (which does support
some of these) to `yaml-effect` is partly the cost of finding
which lines in your existing YAML are 1.1-isms that change
meaning under 1.2. A migration linter gives that visibility
without lying to the user about what the parser is doing.

### Implementation

A new parse option:

```typescript
parseDocument(text, { warnYaml11Migration: true })
```

The composer, when it resolves a scalar value, checks whether
the source token would have been interpreted differently under
YAML 1.1. If yes, it pushes a `YamlErrorDetail` onto the
document's `warnings` array (not `errors`) with a code like
`Yaml11Migration` and an explanatory message ("`no` parses as
the string \"no\" in YAML 1.2; in 1.1 this would have been
the boolean false").

Because warnings already exist on `YamlDocument`, no new error
type is needed. The CLI's `lint --yaml-1.1-migration` surfaces
them through the code-frame renderer with warning severity.

### Categories Detected

- Boolean variants: `yes` / `no` / `on` / `off` / `Yes` /
  `No` / `On` / `Off` / `YES` / `NO` / `ON` / `OFF`.
- Merge key indicator: `<<:`.
- Octal `0NNN` (1.1) — flagged when the same digits parse
  as decimal under 1.2.
- Sexagesimal numbers (`60:5`).

### Non-Migration

This linter does not change parse semantics under any
configuration. The parser is 1.2 only. This is documented in
the lint output ("`no` is parsed as the string \"no\"; if
you intended a boolean, write `false`").

## LSP `Diagnostic` Shape and `suggestFixes` (Phase 4)

### Positioning

Red Hat's `yaml-language-server` is the de facto YAML LSP
implementation. It is good. We do not compete with it.

What we do is provide the data shape an LSP needs:

- `YamlError` -> LSP `Diagnostic` (severity, range, message,
  code). The mapping is mechanical.
- `YamlEdit[]` -> LSP `TextEdit[]` (offset/length to range).
  Already mechanical.
- "Suggested fixes" — a small library of patterns that
  produce `YamlEdit` arrays from common error shapes
  (auto-quote a scalar that's failing type resolution,
  add a missing `---` document marker, deduplicate a
  duplicate key by promoting one to a sequence).

### What Ships

A small `src/lsp/` module exporting:

- `errorToDiagnostic(error: YamlError, text: string): Diagnostic[]`.
- `editsToTextEdits(edits: YamlEdit[], text: string): TextEdit[]`.
- `suggestFixes(error: YamlError, text: string): CodeAction[]` —
  curated per error code; each action returns a `YamlEdit[]`
  that callers can apply.

These are pure functions over `YamlError` / `YamlEdit` /
`text`. They have no LSP-server lifecycle. An LSP author
imports them and slots them into their server's request
handlers.

### Why Post-1.0

The LSP shape is most useful once the migration linter, code
frames, and Schema decode errors are all stable. Building the
shape against churning underlying APIs costs more than waiting.

## Open Questions

- **Code-frame renderer dependency policy.** The current
  proposal is "no new dependencies." This means hand-rolling
  ANSI colour detection, line-finding, and width
  calculation. If that becomes painful, the closest small
  dependency is `picocolors`, but adding any dependency
  affects the library's "zero deps beyond effect" claim.
- **CLI distribution.** Standalone npm package is the
  default. Should there also be a single-binary distribution
  (`pkg`, `bun build --compile`) for users who don't want to
  install Node? Probably not for 1.0; revisit if there is
  demand.
- **Migration-linter false positives.** The `Yaml11Migration`
  detector is only as good as its enumeration of legacy
  forms. Accept that the first version misses things;
  document the policy of adding new patterns when users
  report them.
- **Monorepo restructuring.** The CLI requires it. Decision
  on timing and scope is in
  [monorepo-restructure.md](./monorepo-restructure.md).

## Non-Goals

- **A full LSP server.** We expose data shapes; we do not own
  the server lifecycle. `yaml-language-server` is the right
  reference implementation for that.
- **A YAML 1.1 compatibility mode.** The migration linter
  surfaces warnings; it does not change parse semantics.
- **Interactive prompts in the CLI.** Format / lint / check
  are non-interactive by design — they belong in CI, not in
  a wizard.
- **A web playground.** Useful, but covered by the post-1.0
  RSPress docs site mentioned in [roadmap.md](./roadmap.md),
  not by the CLI.
- **Sync adapters for `js-yaml` / `yaml`.** The CLI uses the
  Effect-native API directly; the library does not need a
  sync surface for the CLI.

## Cross-References

- [errors.md](./errors.md) — `YamlError` taxonomy that the
  code-frame renderer and LSP `Diagnostic` shape consume.
- [format-modify.md](./format-modify.md) — `YamlEdit` and
  the format/modify pipeline that `yaml-effect format` and
  the LSP `suggestFixes` patterns drive.
- [effect-features.md](./effect-features.md) —
  position-aware Schema decode errors that consume the same
  code-frame renderer.
- [monorepo-restructure.md](./monorepo-restructure.md) —
  prerequisite for the separate CLI package.
- [test-corpus.md](./test-corpus.md) — error-message
  snapshot tests live here and depend on the code-frame
  renderer being stable.
- [roadmap.md](./roadmap.md) — places code frames in Phase
  1, CLI / migration linter in Phase 3, LSP shape in Phase
  4.
