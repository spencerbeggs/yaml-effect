# Contributing to yaml-effect

Thank you for your interest in contributing to yaml-effect! This document
provides guidelines and instructions for development.

## Prerequisites

- Node.js 24.x
- pnpm 10.33.2

## Development Setup

```bash
# Clone the repository (--recurse-submodules fetches the yaml-test-suite fixtures)
git clone --recurse-submodules https://github.com/spencerbeggs/yaml-effect.git
cd yaml-effect

# If you already cloned without submodules:
git submodule update --init

# Install dependencies
pnpm install

# Build all outputs
pnpm run build

# Run tests
pnpm run test
```

## Available Scripts

| Script | Description |
| ------ | ----------- |
| `pnpm run build` | Build dev + prod outputs via Turbo |
| `pnpm run build:dev` | Build development output only |
| `pnpm run build:prod` | Build production/npm output only |
| `pnpm run test` | Run all tests (unit + compliance) |
| `pnpm run test:compliance` | Run yaml-test-suite compliance tests only |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with v8 coverage report |
| `pnpm run lint` | Check code with Biome |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run lint:md` | Check markdown with markdownlint |
| `pnpm run typecheck` | Type-check via Turbo (runs tsgo) |

## Code Quality

This project uses:

- **Biome** for linting and formatting (extends `@savvy-web/lint-staged`)
- **Commitlint** for enforcing conventional commits with DCO signoff
- **Husky** for Git hooks (pre-commit, commit-msg, pre-push)
- **Vitest** for testing with v8 coverage

### Commit Format

All commits must follow the
[Conventional Commits](https://conventionalcommits.org) specification and
include a DCO signoff:

```text
feat: add new parsing option

Signed-off-by: Your Name <your.email@example.com>
```

### Pre-commit Hooks

The following checks run automatically:

- **pre-commit**: Runs lint-staged (Biome on staged files)
- **commit-msg**: Validates commit message format via commitlint
- **pre-push**: Runs tests for affected packages

## TypeScript

- Strict mode enabled
- ESM with `.js` extensions for relative imports
- `node:` protocol for Node.js built-ins
- Separate type imports: `import type { Foo } from "./bar.js"`

## Testing

Tests are organized into two Vitest projects:

- **yaml-effect:unit** — `__test__/*.test.ts` exercises individual modules:
  lexer, parser, composer, stringifier, formatting, equality, etc.
- **yaml-effect:e2e** — `__test__/yaml-test-suite.e2e.test.ts` runs the
  official [yaml-test-suite](https://github.com/yaml/yaml-test-suite)
  against our pipeline.

The compliance suite lives in a git submodule at
`__test__/fixtures/yaml-test-suite/` pinned to the `data-2022-01-17` tag. If
the submodule is missing, run `git submodule update --init`.

The library currently passes 100% of the yaml-test-suite (1226/1226
assertions). The `SKIP`, `XFAIL`, and `SKIP_ASSERTIONS` maps in
`__test__/utils/yaml-test-suite-skip-map.ts` are all empty, and CI will fail
if any assertion regresses. When adding new tests or making parser changes:

- Run `pnpm run test:compliance` to confirm the suite still passes.
- If a fix causes a previously-skipped fixture to start passing, the empty
  skip maps mean nothing needs to be removed — but please add a unit-test
  regression guard in `__test__/` for the specific behavior fixed.
- If you intentionally add a new XFAIL or SKIP entry (e.g., for an unfixed
  bug surfaced by a new test corpus), document the reason and reference an
  open issue.

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `pnpm run test`
5. Run linting: `pnpm run lint:fix`
6. Commit with conventional format and DCO signoff
7. Push and open a pull request

## License

By contributing, you agree that your contributions will be licensed under the
MIT License.
