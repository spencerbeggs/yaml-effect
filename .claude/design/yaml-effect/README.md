# yaml-effect Design Documentation

Internal design documentation for `@spencerbeggs/yaml-effect`, a YAML 1.2
parser and stringifier built on Effect.

These docs describe the final implemented state of the library. They are
split by concern to enable progressive context loading.

## Current-State Documents

| Document | Description |
| -------- | ----------- |
| [architecture.md](./architecture.md) | Pipeline stages, Effect integration, module layout |
| [schemas.md](./schemas.md) | All Schema definitions: AST nodes, visitor events, tokens, options |
| [parsing.md](./parsing.md) | Lexer, parser, composer: YAML text to AST |
| [stringify.md](./stringify.md) | AST/JS values to YAML text |
| [visitor.md](./visitor.md) | AST and CST visitor pattern, streaming events |
| [format-modify.md](./format-modify.md) | format, modify, applyEdits, stripComments |
| [equality.md](./equality.md) | equals, equalsValue comparison functions |
| [schema-integration.md](./schema-integration.md) | Effect Schema integration (YamlFromString, makeYamlSchema, etc.) |
| [errors.md](./errors.md) | Error taxonomy and handling |
| [compliance-testing.md](./compliance-testing.md) | yaml-test-suite integration, skip maps, badge pipeline |
| [canonical-output-gaps.md](./canonical-output-gaps.md) | Historical record of the canonical-output compliance gap (now closed at 100%) and the per-fixture post-processing rules in `__test__/utils/canonical.ts` that closed it |

## Forward-Looking / Roadmap Documents

These describe proposed work for the path to 1.0 and beyond. They are
self-contained design proposals — none of the work below is implemented
yet. Status `stub` reflects "structured proposal, not yet started," not
"unfinished prose."

| Document | Description |
| -------- | ----------- |
| [roadmap.md](./roadmap.md) | High-level phased plan and index for the proposals below |
| [perf-benchmarking.md](./perf-benchmarking.md) | Tinybench + Vitest bench project, workload buckets, tag-only CI cadence |
| [test-corpus.md](./test-corpus.md) | fast-check property tests, OSS real-world fixture repo, differential testing harness |
| [effect-features.md](./effect-features.md) | Branded-scalar Schema decoding with source positions, TagResolver service, OpenTelemetry instrumentation, cancellable parse |
| [dx-and-cli.md](./dx-and-cli.md) | Public code-frame renderer, separate yaml-effect-cli package, YAML 1.1 migration linter, post-1.0 LSP shape |
| [monorepo-restructure.md](./monorepo-restructure.md) | Single-package -> multi-package layout to support yaml-effect-cli without disrupting the release pipeline |

## How to Use These Docs

Load only the documents relevant to the task at hand. For example:

- Working on the parser? Load `parsing.md` and `schemas.md`.
- Adding a new Schema integration? Load `schema-integration.md` and `schemas.md`.
- Debugging visitor events? Load `visitor.md` and `schemas.md`.
- Understanding the full pipeline? Start with `architecture.md`.
- Working on spec compliance or skip maps? Load `compliance-testing.md`.
- Picking up post-1.0 roadmap work? Start with `roadmap.md`.

## Relationship to User-Facing Docs

User-facing documentation lives in `docs/` (e.g., `docs/getting-started.md`,
`docs/parsing.md`). These design docs in `.claude/design/yaml-effect/` are
internal implementation references for developers and agents, not for end
users.
