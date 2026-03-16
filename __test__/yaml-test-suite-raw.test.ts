/**
 * Raw (unfiltered) yaml-test-suite compliance tests.
 *
 * Runs every test case without SKIP, XFAIL, or SKIP_ASSERTIONS filtering.
 * Use this to see the true state of compliance after code changes — failures
 * here are expected and informational, not CI blockers.
 *
 * Run with:
 *   pnpm vitest run --project compliance-raw
 *   pnpm vitest run --project compliance-raw -t "\[229Q\]"
 *
 * @packageDocumentation
 */

import { existsSync } from "node:fs";
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse, parseAllDocuments, stringify } from "../src/index.js";
import { buildAnchorMap, getNodeValue } from "../src/utils/composer.js";
import { SUITE_DIR, loadAllTestCases } from "./utils/yaml-test-suite.js";

// ---------------------------------------------------------------------------
// Load all test cases (gracefully skip when submodule is absent)
// ---------------------------------------------------------------------------

const suiteAvailable = existsSync(SUITE_DIR);
const allCases = suiteAvailable ? loadAllTestCases() : [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseYaml(input: string): Either.Either<unknown, unknown> {
	return Effect.runSync(Effect.either(parse(input, { uniqueKeys: false })));
}

function parseYamlMulti(input: string): Either.Either<unknown[], unknown> {
	return Effect.runSync(
		Effect.either(
			parseAllDocuments(input, { uniqueKeys: false }).pipe(
				Effect.map((docs) =>
					docs.map((doc) => {
						const anchors = buildAnchorMap(doc.contents);
						return getNodeValue(doc.contents, anchors);
					}),
				),
			),
		),
	);
}

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
// Test runner — NO skip maps, every test runs as-is
// ---------------------------------------------------------------------------

// Only run when RAW_COMPLIANCE=1 is set — this suite has expected failures
// and must not run during default test runs or pre-flight hooks.
// Use: pnpm run test:compliance-raw
const rawEnabled = process.env.RAW_COMPLIANCE === "1";

describe.skipIf(!suiteAvailable || !rawEnabled)("yaml-test-suite compliance (raw)", () => {
	for (const tc of allCases) {
		describe(`[${tc.id}] ${tc.name}`, () => {
			if (tc.isError) {
				it("should reject invalid YAML", () => {
					const result = parseYaml(tc.yaml);
					expect(Either.isLeft(result), `Expected parse error for ${tc.id}`).toBe(true);
				});
			} else {
				// Parse success
				it("should parse successfully", () => {
					const result = parseYaml(tc.yaml);
					expect(Either.isRight(result), `Expected parse success for ${tc.id}`).toBe(true);
				});

				// JSON match
				if (tc.json !== undefined) {
					it("should match expected JSON output", () => {
						if (tc.isMultiDocument) {
							const result = parseYamlMulti(tc.yaml);
							if (Either.isLeft(result)) {
								expect.unreachable(`Parse failed for ${tc.id}`);
								return;
							}
							expect(deepEqual(Either.getOrThrow(result), tc.json)).toBe(true);
						} else {
							const result = parseYaml(tc.yaml);
							if (Either.isLeft(result)) {
								expect.unreachable(`Parse failed for ${tc.id}`);
								return;
							}
							expect(deepEqual(Either.getOrThrow(result), tc.json)).toBe(true);
						}
					});
				}

				// Canonical output match (out.yaml)
				if (tc.outYaml !== undefined) {
					it("should match canonical output", () => {
						const result = parseYaml(tc.yaml);
						if (Either.isLeft(result)) {
							expect.unreachable(`Parse failed for ${tc.id}`);
							return;
						}
						const stringified = Effect.runSync(stringify(Either.getOrThrow(result)));
						expect(stringified).toBe(tc.outYaml);
					});
				}

				// Stringify roundtrip
				it("should survive stringify roundtrip", () => {
					if (tc.isMultiDocument) {
						const result = parseYamlMulti(tc.yaml);
						if (Either.isLeft(result)) {
							expect.unreachable(`Parse failed for ${tc.id}`);
							return;
						}
						const values = Either.getOrThrow(result);
						for (const value of values) {
							const stringified = Effect.runSync(stringify(value));
							const reparsed = parseYaml(stringified);
							if (Either.isLeft(reparsed)) {
								expect.unreachable(`Re-parse failed for ${tc.id}`);
								return;
							}
							expect(deepEqual(Either.getOrThrow(reparsed), value)).toBe(true);
						}
					} else {
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
					}
				});
			}
		});
	}
});
