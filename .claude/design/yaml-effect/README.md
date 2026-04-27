# yaml-effect Design Documentation

Internal design documentation for `@spencerbeggs/yaml-effect`, a YAML 1.2
parser and stringifier built on Effect.

These docs describe the final implemented state of the library. They are
split by concern to enable progressive context loading.

## Documents

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
| [canonical-output-gaps.md](./canonical-output-gaps.md) | Remaining 17 yaml-test-suite canonical-output failures: parser refactor scope, multi-doc tag preservation, and the structural choice between AST source-text capture and a libyaml-faithful canonical emitter |

## How to Use These Docs

Load only the documents relevant to the task at hand. For example:

- Working on the parser? Load `parsing.md` and `schemas.md`.
- Adding a new Schema integration? Load `schema-integration.md` and `schemas.md`.
- Debugging visitor events? Load `visitor.md` and `schemas.md`.
- Understanding the full pipeline? Start with `architecture.md`.
- Working on spec compliance or skip maps? Load `compliance-testing.md`.

## Relationship to User-Facing Docs

User-facing documentation lives in `docs/` (e.g., `docs/getting-started.md`,
`docs/parsing.md`). These design docs in `.claude/design/yaml-effect/` are
internal implementation references for developers and agents, not for end
users.
