# Contributing to yaml-effect

Thank you for your interest in contributing to yaml-effect! This document
provides guidelines and instructions for development.

## Prerequisites

- Node.js 24.x
- pnpm 10.32.1

## Development Setup

```bash
# Clone the repository
git clone https://github.com/spencerbeggs/yaml-effect.git
cd yaml-effect

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
| `pnpm run test` | Run all tests |
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
