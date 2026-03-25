---
"yaml-effect": patch
---

## Tests

Migrates compliance test harness to `@savvy-web/vitest` v1.0.0 auto-discovery API. Compliance tests now use the `.e2e.test.ts` suffix convention for automatic project classification, replacing manually configured custom projects.

- Renames `yaml-test-suite.test.ts` and `yaml-test-suite-raw.test.ts` with `.e2e.test` suffix
- Simplifies `vitest.config.ts` to use `VitestConfig.create()` with e2e kind override
- Updates compliance badge workflow to match new project structure
