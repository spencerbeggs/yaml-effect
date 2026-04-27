/**
 * Official yaml-test-suite compliance tests.
 *
 * Runs the full yaml-test-suite (https://github.com/yaml/yaml-test-suite)
 * against yaml-effect to validate YAML 1.2 spec compliance.
 *
 * @packageDocumentation
 */

import { existsSync } from "node:fs";
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse, parseAllDocuments, parseDocument, stringify, stringifyDocument } from "../src/index.js";
import { buildAnchorMap, getNodeValue } from "../src/utils/composer.js";
import { applySingleDocCanonical } from "./utils/canonical.js";
import { SUITE_DIR, loadAllTestCases } from "./utils/yaml-test-suite.js";
import { SKIP, SKIP_ASSERTIONS, XFAIL } from "./utils/yaml-test-suite-skip-map.js";

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

/**
 * Parse a multi-document YAML stream, returning an array of plain JS values.
 */
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

describe.skipIf(!suiteAvailable)("yaml-test-suite compliance", () => {
	for (const tc of allCases) {
		// Skip entirely if in SKIP map
		if (SKIP[tc.id]) {
			it.skip(`[${tc.id}] ${tc.name} (SKIP: ${SKIP[tc.id]})`, () => {});
			continue;
		}

		const isXfail = !!XFAIL[tc.id];

		describe(`[${tc.id}] ${tc.name}`, () => {
			if (tc.isError) {
				// ----- Error tests: YAML should be rejected -----
				const testFn = isXfail ? it.fails : it;
				testFn("should reject invalid YAML", () => {
					const result = parseYaml(tc.yaml);
					expect(Either.isLeft(result), `Expected parse error for ${tc.id}`).toBe(true);
				});
			} else {
				// ----- Valid tests -----

				// 4a. Parse success
				const parseFn = isXfail ? it.fails : it;
				parseFn("should parse successfully", () => {
					const result = parseYaml(tc.yaml);
					expect(Either.isRight(result), `Expected parse success for ${tc.id}`).toBe(true);
				});

				// 4b. JSON match
				if (tc.json !== undefined && !shouldSkipAssertion(tc.id, "json")) {
					const jsonFn = isXfail ? it.fails : it;
					jsonFn("should match expected JSON output", () => {
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

				// 4c. Canonical output match (out.yaml)
				if (tc.outYaml !== undefined && !shouldSkipAssertion(tc.id, "output")) {
					const outFn = isXfail ? it.fails : it;
					outFn("should match canonical output", () => {
						if (tc.isMultiDocument) {
							const docsResult = Effect.runSync(Effect.either(parseAllDocuments(tc.yaml, { uniqueKeys: false })));
							if (Either.isLeft(docsResult)) {
								expect.unreachable(`Parse failed for ${tc.id}`);
								return;
							}
							const docs = Either.getOrThrow(docsResult);
							const parts = docs.map((doc) => Effect.runSync(stringifyDocument(doc, { forceDefaultStyles: true })));
							const stringified = parts.join("");
							expect(stringified).toBe(tc.outYaml);
						} else {
							const docResult = Effect.runSync(Effect.either(parseDocument(tc.yaml, { uniqueKeys: false })));
							if (Either.isLeft(docResult)) {
								expect.unreachable(`Parse failed for ${tc.id}`);
								return;
							}
							const doc = Either.getOrThrow(docResult);
							const raw = Effect.runSync(stringifyDocument(doc, { forceDefaultStyles: true }));
							const stringified = applySingleDocCanonical(raw, doc.contents);
							expect(stringified).toBe(tc.outYaml);
						}
					});
				}

				// 4d. Stringify roundtrip
				if (!shouldSkipAssertion(tc.id, "roundtrip")) {
					const rtFn = isXfail ? it.fails : it;
					rtFn("should survive stringify roundtrip", () => {
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
			}
		});
	}
});
