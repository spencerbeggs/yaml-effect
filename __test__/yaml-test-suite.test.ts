/**
 * Official yaml-test-suite compliance tests.
 *
 * Runs the full yaml-test-suite (https://github.com/yaml/yaml-test-suite)
 * against yaml-effect to validate YAML 1.2 spec compliance.
 *
 * @packageDocumentation
 */

import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "../src/index.js";
import { loadAllTestCases } from "./utils/yaml-test-suite.js";
import { SKIP, SKIP_ASSERTIONS, XFAIL } from "./utils/yaml-test-suite-skip-map.js";

// ---------------------------------------------------------------------------
// Load all test cases
// ---------------------------------------------------------------------------

const allCases = loadAllTestCases();

// ---------------------------------------------------------------------------
// Counters for compliance summary
// ---------------------------------------------------------------------------

const stats = { total: 0, passed: 0, xfail: 0, skipped: 0, failed: 0 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseYaml(input: string): Either.Either<unknown, unknown> {
	return Effect.runSync(Effect.either(parse(input)));
}

function shouldSkipAssertion(id: string, assertion: string): boolean {
	return SKIP_ASSERTIONS[id]?.includes(assertion) ?? false;
}

/**
 * Deep comparison that handles NaN equality.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) {
		return true;
	}
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, b[i]));
	}

	if (Array.isArray(a) !== Array.isArray(b)) return false;

	const keysA = Object.keys(a as Record<string, unknown>);
	const keysB = Object.keys(b as Record<string, unknown>);
	if (keysA.length !== keysB.length) return false;
	return keysA.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

describe("yaml-test-suite compliance", () => {
	for (const tc of allCases) {
		// Skip entirely if in SKIP map
		if (SKIP[tc.id]) {
			stats.skipped++;
			stats.total++;
			it.skip(`[${tc.id}] ${tc.name} (SKIP: ${SKIP[tc.id]})`, () => {});
			continue;
		}

		const isXfail = !!XFAIL[tc.id];

		describe(`[${tc.id}] ${tc.name}`, () => {
			if (tc.isError) {
				// ----- Error tests: YAML should be rejected -----
				const testFn = isXfail ? it.fails : it;
				testFn("should reject invalid YAML", () => {
					stats.total++;
					const result = parseYaml(tc.yaml);
					expect(Either.isLeft(result), `Expected parse error for ${tc.id}`).toBe(true);
					if (!isXfail) stats.passed++;
					else stats.xfail++;
				});
			} else {
				// ----- Valid tests -----

				// 4a. Parse success
				const parseFn = isXfail ? it.fails : it;
				parseFn("should parse successfully", () => {
					stats.total++;
					const result = parseYaml(tc.yaml);
					expect(Either.isRight(result), `Expected parse success for ${tc.id}`).toBe(true);
					if (!isXfail) stats.passed++;
					else stats.xfail++;
				});

				// 4b. JSON match
				if (tc.json !== undefined && !shouldSkipAssertion(tc.id, "json")) {
					const jsonFn = isXfail ? it.fails : it;
					jsonFn("should match expected JSON output", () => {
						stats.total++;
						const result = parseYaml(tc.yaml);
						if (Either.isLeft(result)) {
							expect.unreachable(`Parse failed for ${tc.id}`);
							return;
						}
						expect(deepEqual(Either.getOrThrow(result), tc.json)).toBe(true);
						if (!isXfail) stats.passed++;
						else stats.xfail++;
					});
				}

				// 4c. Canonical output match (out.yaml)
				if (tc.outYaml !== undefined && !shouldSkipAssertion(tc.id, "output")) {
					const outFn = isXfail ? it.fails : it;
					outFn("should match canonical output", () => {
						stats.total++;
						const result = parseYaml(tc.yaml);
						if (Either.isLeft(result)) {
							expect.unreachable(`Parse failed for ${tc.id}`);
							return;
						}
						const stringified = Effect.runSync(stringify(Either.getOrThrow(result)));
						expect(stringified).toBe(tc.outYaml);
						if (!isXfail) stats.passed++;
						else stats.xfail++;
					});
				}

				// 4d. Stringify roundtrip
				if (!shouldSkipAssertion(tc.id, "roundtrip")) {
					const rtFn = isXfail ? it.fails : it;
					rtFn("should survive stringify roundtrip", () => {
						stats.total++;
						const result = parseYaml(tc.yaml);
						if (Either.isLeft(result)) {
							expect.unreachable(`Parse failed for ${tc.id}`);
							return;
						}
						const value = Either.getOrThrow(result);
						const stringified = Effect.runSync(stringify(value));
						const reparsed = parseYaml(stringified);
						if (Either.isLeft(reparsed)) {
							expect.unreachable(`Re-parse failed for ${tc.id}`);
							return;
						}
						expect(deepEqual(Either.getOrThrow(reparsed), value)).toBe(true);
						if (!isXfail) stats.passed++;
						else stats.xfail++;
					});
				}
			}
		});
	}
});
