---
"yaml-effect": minor
---

## Documentation

Resolve all TSDoc / api-extractor warnings surfaced by the `@savvy-web/bundler`
1.1 build harness, so the published `.d.ts` and API model are clean.

- Disambiguate `@link` references to Effect Schema symbols that declare both a
  runtime value and a type of the same name (e.g. `YamlNode`, `ScalarStyle`,
  `CollectionStyle`, `CstNodeType`, `YamlTokenKind`, `YamlVisitorEvent`,
  `YamlCstVisitorEvent`) using explicit declaration-reference selectors.
- Fix links that pointed at non-exported symbols: `getTokenOffset` now
  references `YamlScanner.getTokenOffset`, and Effect's `Stream` and the
  internal `YamlErrorCode` are rendered as inline code.
- Suppress the intentional `*ErrorBase` release-tag warning in the build
  config — the `@public` concrete error classes extend an `@internal` base by
  design because `Data.TaggedError` produces intersection types api-extractor
  cannot roll up.

## Build System

Upgrade to the `@savvy-web/bundler` 1.1 flat `build()` entrypoint and align the
toolchain dev dependencies (`typescript`, `@types/node`,
`@typescript/native-preview`) with the silk catalog.

Repair the compliance badge workflow after the `@vitest-agent/plugin`
migration. The single-project + test-tag model retired the old
`yaml-effect:e2e` named project, so `.github/workflows/compliance.yml` now runs
the `.e2e.test.ts` file directly (writing clean JSON via `--outputFile`), and
the removed `test:compliance` script is restored. Refresh the stale test-setup
references in `CLAUDE.md`, `CONTRIBUTING.md`, and the compliance-testing design
doc.
