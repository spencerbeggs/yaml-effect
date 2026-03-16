---
title: Compliance Testing
description: Official yaml-test-suite integration for YAML 1.2 spec compliance validation.
status: current
module: yaml-effect
category: testing
created: 2026-03-14
updated: 2026-03-14
last-synced: 2026-03-14
completeness: 90
related:
  - architecture.md
  - parsing.md
  - errors.md
dependencies:
  - parsing.md
---

## Overview

The project integrates the official
[yaml-test-suite](https://github.com/yaml/yaml-test-suite) to validate
YAML 1.2 spec compliance. The suite contains ~440 test cases covering
valid parsing, invalid rejection, JSON output matching, canonical output,
and stringify round-tripping. It runs as a separate Vitest project named
`compliance`, isolated from unit tests.

This is the primary mechanism for measuring spec conformance and
identifying parser/stringifier gaps. Every known failure is tracked in a
skip map with a reason string, and each map entry corresponds to one of
six open GitHub issues (#6--#11) categorizing the work needed.

## Architecture

### Git Submodule

The test suite data lives in a git submodule:

```text
__test__/fixtures/yaml-test-suite/
```

Configured in `.gitmodules` pointing to
`https://github.com/yaml/yaml-test-suite.git`, pinned to the
`data-2022-01-17` tag. This tag provides a stable, flat-file data format
where each test case is a directory containing fixture files.

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/spencerbeggs/yaml-effect.git

# Or initialize after cloning:
git submodule update --init
```

### Vitest Project Isolation

Compliance tests run in a dedicated Vitest project defined in
`vitest.config.ts`:

```typescript
const compliance = VitestProject.custom("compliance", {
  name: "compliance",
  include: ["__test__/yaml-test-suite.test.ts"],
  overrides: { test: { testTimeout: 30_000 } },
});
```

The default `yaml-effect` project explicitly excludes both compliance
test files so they do not run during normal unit test discovery. The
`test` script explicitly targets `yaml-effect` and `compliance` projects:

```bash
pnpm run test                  # unit tests + filtered compliance
pnpm run test:compliance       # filtered compliance only
pnpm run test:compliance-raw   # unfiltered compliance (expected failures)
```

### Raw Compliance Project (`compliance-raw`)

A second Vitest project runs every test case without SKIP, XFAIL, or
SKIP_ASSERTIONS filtering. This shows the true state of compliance and
makes it easy to spot unexpected improvements after code changes.

- **File:** `__test__/yaml-test-suite-raw.test.ts`
- **Project name:** `compliance-raw`
- **Script:** `pnpm run test:compliance-raw`
- **Guard:** Requires `RAW_COMPLIANCE=1` env var (set by the script).
  Without this, the describe block self-skips, preventing pre-commit
  hooks and default test runs from failing on known gaps.

Filter by test ID:

```bash
pnpm run test:compliance-raw -- -t "\[229Q\]"
```

### Graceful Degradation

Both test files guard against a missing submodule:

```typescript
const suiteAvailable = existsSync(SUITE_DIR);
describe.skipIf(!suiteAvailable)("yaml-test-suite compliance", () => { ... });
```

If the submodule is not initialized, the entire `describe` block is
skipped with no error. This prevents CI failures for contributors who
clone without `--recurse-submodules`.

## Test Case Structure

### Fixture Layout

Each test case lives in a directory under `__test__/fixtures/yaml-test-suite/`.
Two directory patterns exist:

1. **Flat test** -- e.g., `229Q/` contains fixture files directly.
2. **Multi-case test** -- e.g., `3RLN/00/`, `3RLN/01/` has numbered
   subdirectories, each a separate test case. IDs become `3RLN/00`, etc.

### Fixture Files

Each test case directory may contain:

| File | Required | Purpose |
| ---- | -------- | ------- |
| `in.yaml` | Yes | Raw YAML input to parse |
| `===` | No | Human-readable test name |
| `in.json` | No | Expected JSON output after parsing |
| `out.yaml` | No | Expected canonical re-serialized YAML |
| `test.event` | No | Expected parse event stream (not currently used) |
| `error` | No | Presence means `in.yaml` should be rejected |

### Test Data Loader (`__test__/utils/yaml-test-suite.ts`)

`loadAllTestCases()` scans the suite directory, handles both flat and
numbered-subdirectory layouts, and returns a sorted `TestCase[]` array.
Each `TestCase` has:

- `id` -- 4-char ID (or `ID/NN` for multi-case)
- `name` -- from the `===` file
- `yaml` -- raw input
- `json` -- parsed expected JSON (if `in.json` exists)
- `outYaml` -- canonical output (if `out.yaml` exists)
- `isError` -- true if the `error` file is present
- `events` -- raw event stream (currently unused)
- `isMultiDocument` -- true if `in.json` contains multiple top-level
  JSON values (multi-document stream)

The `parseMultiJson()` helper handles `in.json` files that contain
multiple top-level JSON values (one per YAML document in multi-document
streams). It returns a `ParsedJson` object with `value` and
`isMultiDocument` fields.

### Multi-Document Support (Issue #6 -- Resolved)

The test runner detects multi-document fixtures via `isMultiDocument` and
uses `parseAllDocuments()` with `buildAnchorMap()` + `getNodeValue()` to
extract per-document plain values. The `parseYamlMulti()` helper wraps
this for the JSON comparison and roundtrip tests.

## Skip Map Strategy

All known failures are tracked in
`__test__/utils/yaml-test-suite-skip-map.ts` with three tiers:

### SKIP -- Never Run

```typescript
export const SKIP: Record<string, string> = {};
```

Tests that are not applicable to our implementation. Currently empty --
all test cases are relevant.

### XFAIL -- Expected Parse-Level Failures

```typescript
export const XFAIL: Record<string, string> = { ... };
```

Tests that run with `it.fails` -- the test is expected to fail. Two
categories of XFAIL entries:

1. **Parser rejects valid YAML** (16 tests) -- our parser throws on input
   the spec says is valid. Mostly tab handling and edge-case block
   mappings.
2. **Parser accepts invalid YAML** (87 tests) -- our parser succeeds on
   input the spec says should be rejected. Missing validation for various
   structural constraints.

When an XFAIL test is marked with `it.fails`, Vitest expects the
assertion to fail. If a code fix causes the test to start passing,
`it.fails` will itself fail, signaling that the entry should be removed
from the XFAIL map.

### SKIP_ASSERTIONS -- Per-Assertion Skipping

```typescript
export const SKIP_ASSERTIONS: Record<string, string[]> = { ... };
```

Tests where parsing succeeds but specific assertion types fail. Values
are arrays containing one or more of:

- `"json"` -- skip JSON output comparison
- `"output"` -- skip `out.yaml` canonical output comparison
- `"roundtrip"` -- skip stringify round-trip comparison

This allows a test case to validate parsing while skipping downstream
assertions that depend on stringifier correctness or value resolution
accuracy.

## How to Interpret Results

The test runner performs up to four assertions per valid test case:

### 1. Parse Success/Failure

For valid YAML (`!tc.isError`): asserts `Either.isRight(parse(input))`.
For error YAML (`tc.isError`): asserts `Either.isLeft(parse(input))`.

This is the fundamental compliance check -- can we correctly accept valid
YAML and reject invalid YAML?

### 2. JSON Match

Compares `parse(input)` output against the expected `in.json` value using
a deep equality check that handles `NaN` equality. Only runs when
`in.json` exists and `"json"` is not in `SKIP_ASSERTIONS`.

Failures here mean we parse the YAML but produce the wrong value -- type
resolution errors, incorrect scalar coercion, wrong collection structure.

### 3. Canonical Output Match

Stringifies the parsed value and compares against `out.yaml`. Tests that
our stringifier produces the expected canonical form. Only runs when
`out.yaml` exists and `"output"` is not in `SKIP_ASSERTIONS`.

### 4. Stringify Roundtrip

Parses, stringifies, re-parses, and deep-compares the two parsed values.
Validates that `parse(stringify(parse(input))) === parse(input)`. This
catches stringifier bugs that produce output our own parser cannot
re-consume identically.

## Working with Compliance Tests

### Examining Test Case Fixtures

When a test fails, inspect the fixture directory:

```bash
# See what files a test case has
ls __test__/fixtures/yaml-test-suite/229Q/

# Read the YAML input
cat __test__/fixtures/yaml-test-suite/229Q/in.yaml

# Read the expected JSON output
cat __test__/fixtures/yaml-test-suite/229Q/in.json

# Check if it's an error test
test -f __test__/fixtures/yaml-test-suite/229Q/error && echo "error test"
```

For multi-case tests:

```bash
ls __test__/fixtures/yaml-test-suite/3RLN/
# 00/  01/  02/  ...
cat __test__/fixtures/yaml-test-suite/3RLN/01/in.yaml
```

### Running a Single Test Case

The compliance suite runs as one big `describe` block, so you filter by
test name:

```bash
pnpm vitest run --project compliance -t "229Q"
pnpm vitest run --project compliance -t "3RLN/01"
```

### Removing Skip Map Entries After Fixes

When a parser or stringifier fix lands:

1. Run the compliance suite: `pnpm run test:compliance`
2. Look for `it.fails` tests that now pass -- Vitest reports these as
   failures with a message like "Expected test to fail but it passed"
3. Remove the corresponding entry from `XFAIL` in
   `__test__/utils/yaml-test-suite-skip-map.ts`
4. For assertion-level fixes, remove the specific assertion string from
   the array in `SKIP_ASSERTIONS`. If the array becomes empty, remove the
   entire entry.
5. Re-run to confirm all tests pass cleanly.

### Debugging Compliance Failures

**Targeting specific tests by ID:**

```bash
# Run a single test case (escape brackets for regex)
pnpm vitest run --project compliance -t "\[229Q\]"

# Multiple IDs (pipe-separated, still need bracket escaping)
pnpm vitest run --project compliance -t "\[DWX9\]|\[T26H\]"

# Multi-case IDs work too
pnpm vitest run --project compliance -t "\[L24T/00\]"
```

Note: Using unescaped `-t "229Q"` may match too broadly (any test
whose name contains that substring). Wrapping in `\[...\]` is safer.

**Checking for XFAIL tests that now pass after a fix:**

```bash
pnpm vitest run --project compliance --reporter=verbose 2>&1 \
  | grep "Expected.*to fail but"
```

If any appear, remove the entry from `XFAIL` in the skip map.

**Examining fixture bytes (for whitespace/encoding issues):**

```bash
xxd __test__/fixtures/yaml-test-suite/DWX9/in.yaml
xxd __test__/fixtures/yaml-test-suite/DWX9/in.json
```

**Adding targeted debug tests:**

When investigating a specific failure, add a focused unit test in the
relevant test file (`lexer.test.ts`, `composer.test.ts`) using the
exact input from the fixture. Compare lexer output vs composer output
to determine which layer has the bug. The composer has its own block
scalar decoder (`decodeBlockScalar`) separate from the lexer's
`scanBlockScalar`, so block scalar fixes must be applied in both.

## Badge Pipeline

### GitHub Action (`.github/workflows/compliance.yml`)

Runs on every push to `main`:

1. Checks out the repo with submodules
2. Runs `pnpm vitest run --project compliance --reporter=json`
3. A Node.js script parses the JSON reporter output and computes two
   percentages:
   - **Parse compliance** -- percentage of "should parse successfully" and
     "should reject invalid YAML" assertions passing
   - **Full compliance** -- percentage of all assertions passing
     (includes JSON, output, roundtrip)
4. Writes a `compliance.json` file with both metrics
5. Pushes `compliance.json` to an orphan `badges` branch

### Badge Data Format

```json
{
  "parse": {
    "passing": 339,
    "total": 440,
    "percentage": 77,
    "color": "yellow"
  },
  "full": {
    "passing": 745,
    "total": 1231,
    "percentage": 61,
    "color": "orange"
  },
  "lastUpdated": "2026-03-14T..."
}
```

Color thresholds: >90% brightgreen, >70% yellow, >50% orange, else red.

### shields.io Integration

README badges use shields.io dynamic badge URLs pointing at the raw
`compliance.json` on the `badges` branch. The orphan branch keeps badge
data out of the main branch history.

## Open Compliance Gaps

GitHub issues categorize the known failures. Issue #10 was decomposed
into per-category issues (#15, #16).

| Issue | Title | Status |
| ----- | ----- | ------ |
| #6 | Fix multi-document test harness to use `parseAllDocuments` | **Resolved** |
| #7 | Fix tab handling in lexer for YAML 1.2 compliance | Partial (5 XFAIL resolved) |
| #8 | Fix block scalar content normalization | Partial (trailing whitespace fixed) |
| #9 | Fix double-quoted and plain scalar folding rules | **Mostly resolved** (18 assertions fixed) |
| #10 | Add stricter validation for invalid YAML rejection | Closed (decomposed into #15, #16) |
| #11 | Fix canonical output and roundtrip stringifier compliance | Open |
| #15 | Parser rejects valid YAML | Open (remaining XFAIL "rejects valid") |
| #16 | Parser accepts invalid YAML | Open (89 XFAIL "accepts invalid") |

Current compliance: 818/903 assertions passing, 85 expected failures.
Use `pnpm run test:compliance-raw` to see unfiltered results (844/1226).

### Dual Block Scalar Decoders

Block scalar fixes must be applied in **both** locations:

1. **Lexer** (`src/utils/lexer.ts` — `scanBlockScalar()`): Produces the
   token value when lexing.
2. **Composer** (`src/utils/composer.ts` — `decodeBlockScalar()`): Re-decodes
   from the CST `source` field. The composer does NOT use the lexer's
   decoded value; it re-parses the raw source independently.

Both contain nearly identical logic for indent detection, line collection,
and chomp handling. Any fix to block scalar content must be applied to both.

## Key Files

| File | Purpose |
| ---- | ------- |
| `__test__/yaml-test-suite.test.ts` | Filtered test runner with 4 assertion types |
| `__test__/yaml-test-suite-raw.test.ts` | Unfiltered test runner (no skip maps) |
| `__test__/utils/yaml-test-suite.ts` | Test data loader (flat + numbered subdirs) |
| `__test__/utils/yaml-test-suite-skip-map.ts` | SKIP, XFAIL, SKIP_ASSERTIONS maps |
| `__test__/fixtures/yaml-test-suite/` | Git submodule (data-2022-01-17) |
| `vitest.config.ts` | Compliance + compliance-raw Vitest projects |
| `.github/workflows/compliance.yml` | Badge generation action |
| `.gitmodules` | Submodule configuration |
