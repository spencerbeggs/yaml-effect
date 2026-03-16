/**
 * Tier 1: Parser fixes for valid YAML that is currently rejected or mis-parsed.
 *
 * Each test reproduces a yaml-test-suite case (2JQS, S3PD, V9D5, KK5P, HS5T).
 */
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse } from "../src/utils/composer.js";

function parseYaml(input: string): Either.Either<unknown, unknown> {
	return Effect.runSync(Effect.either(parse(input, { uniqueKeys: false })));
}

describe("Tier 1: Parser accepts valid YAML", () => {
	// --- 2JQS: Block Mapping with Missing Keys ---
	// Two entries with empty/null keys. Valid per YAML spec (no in.json).
	it("[2JQS] block mapping with missing keys parses successfully", () => {
		const yaml = ": a\n: b\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result), "Should parse successfully").toBe(true);
	});

	// --- S3PD: Spec Example 8.18. Implicit Block Mapping Entries ---
	// Value correctness: "quoted key" must be a KEY, not the value of the null key.
	// The sequence ["entry"] must be the value of "quoted key".
	it("[S3PD] implicit block mapping entries - correct structure", () => {
		const yaml = 'plain key: in-line value\n: # Both empty\n"quoted key":\n- entry\n';
		const result = parseYaml(yaml);
		expect(Either.isRight(result), "Should parse successfully").toBe(true);
		const value = Either.getOrThrow(result) as Record<string, unknown>;
		// "quoted key" must exist as a KEY with sequence value
		expect(value["quoted key"]).toEqual(["entry"]);
	});

	// --- V9D5: Spec Example 8.19. Compact Block Mappings ---
	// No in.json — just test parse success.
	it("[V9D5] compact block mappings parse successfully", () => {
		const yaml = "- sun: yellow\n- ? earth: blue\n  : moon: white\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result), "Should parse successfully").toBe(true);
	});

	// --- KK5P: Various combinations of explicit block mappings ---
	// No in.json — just test parse success.
	it("[KK5P] explicit block mappings parse successfully", () => {
		const yaml =
			"complex1:\n  ? - a\ncomplex2:\n  ? - a\n  : b\ncomplex3:\n  ? - a\n  : >\n    b\ncomplex4:\n  ? >\n    a\n  :\ncomplex5:\n  ? - a\n  : - b\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result), "Should parse successfully").toBe(true);
	});

	// --- HS5T: Spec Example 7.12. Plain Lines ---
	// Tab as separation space in plain scalar continuation.
	it("[HS5T] tab as separation space parses successfully", () => {
		const yaml = "1st non-empty\n\n 2nd non-empty \n\t3rd non-empty\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result), "Should parse successfully").toBe(true);
	});
});
