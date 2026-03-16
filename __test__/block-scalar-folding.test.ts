/**
 * Tests for YAML 1.2 block scalar folding rules (Issue #8).
 *
 * YAML 1.2 §8.1 Block Scalar Styles:
 * - Folded scalar (>): adjacent non-empty lines at base indent fold to space
 * - "More indented" lines preserve their newline and extra indentation
 * - Empty lines between content lines preserved as newlines
 * - Chomp indicator controls trailing newlines: clip (default), strip (-), keep (+)
 * - Zero-indent block scalars (content at column 0)
 * - Explicit indent indicator (>2, >3, etc.)
 */
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse } from "../src/utils/composer.js";

function parseValue(input: string): unknown {
	const result = Effect.runSync(Effect.either(parse(input, { uniqueKeys: false })));
	if (Either.isLeft(result)) throw new Error(`Parse failed: ${JSON.stringify(result.left)}`);
	return Either.getOrThrow(result);
}

describe("Folded block scalar (>)", () => {
	// FP8R: Zero-indent folded block scalar — basic line folding
	it("[FP8R] folds adjacent lines at zero indent", () => {
		const yaml = "--- >\nline1\nline2\nline3\n";
		expect(parseValue(yaml)).toBe("line1 line2 line3\n");
	});

	// DK3J: Zero-indent folded with content that looks like a comment
	it("[DK3J] preserves # in zero-indent folded scalar", () => {
		const yaml = "--- >\nline1\n# no comment\nline3\n";
		expect(parseValue(yaml)).toBe("line1 # no comment line3\n");
	});

	// 6VJK: Folded with "more indented" lines — spec example 2.15
	it("[6VJK] preserves newlines for more-indented lines", () => {
		const yaml =
			">\n Sammy Sosa completed another\n fine season with great stats.\n\n   63 Home Runs\n   0.288 Batting Average\n\n What a year!\n";
		expect(parseValue(yaml)).toBe(
			"Sammy Sosa completed another fine season with great stats.\n\n  63 Home Runs\n  0.288 Batting Average\n\nWhat a year!\n",
		);
	});

	// 7T8X: Spec Example 8.10 — Folded Lines with more-indented and empty lines
	it("[7T8X] handles folded lines with more-indented blocks", () => {
		const yaml =
			">\n\n folded\n line\n\n next\n line\n   * bullet\n\n   * list\n   * lines\n\n last\n line\n\n# Comment\n";
		expect(parseValue(yaml)).toBe("\nfolded line\nnext line\n  * bullet\n\n  * list\n  * lines\n\nlast line\n");
	});

	// MJS9: Spec Example 6.7 — Block Folding with tabs and trailing spaces
	it("[MJS9] handles tabs and trailing spaces in folded scalar", () => {
		const yaml = ">\n  foo \n \n  \t bar\n\n  baz\n";
		expect(parseValue(yaml)).toBe("foo \n\n\t bar\n\nbaz\n");
	});

	// F6MC: Explicit indent indicator with more-indented lines
	it("[F6MC] handles explicit indent with more-indented lines", () => {
		const yaml = "---\na: >2\n   more indented\n  regular\nb: >2\n\n\n   more indented\n  regular\n";
		const result = parseValue(yaml) as Record<string, unknown>;
		expect(result.a).toBe(" more indented\nregular\n");
		expect(result.b).toBe("\n\n more indented\nregular\n");
	});

	// Basic empty line preservation
	it("preserves empty lines between content", () => {
		const yaml = ">\n first\n\n second\n";
		expect(parseValue(yaml)).toBe("first\nsecond\n");
	});

	// Multiple empty lines
	it("preserves multiple empty lines", () => {
		const yaml = ">\n first\n\n\n second\n";
		expect(parseValue(yaml)).toBe("first\n\nsecond\n");
	});

	// Strip chomp
	it("strip chomp removes trailing newline", () => {
		const yaml = ">-\n first\n second\n";
		expect(parseValue(yaml)).toBe("first second");
	});

	// Keep chomp
	it("keep chomp preserves trailing newlines", () => {
		const yaml = ">+\n first\n second\n\n\n";
		expect(parseValue(yaml)).toBe("first second\n\n\n");
	});
});

describe("Literal block scalar (|)", () => {
	// Literal scalars should NOT fold — verify no regressions
	it("preserves all newlines in literal scalar", () => {
		const yaml = "|\n first\n second\n third\n";
		expect(parseValue(yaml)).toBe("first\nsecond\nthird\n");
	});

	it("preserves empty lines in literal scalar", () => {
		const yaml = "|\n first\n\n second\n";
		expect(parseValue(yaml)).toBe("first\n\nsecond\n");
	});

	it("preserves more-indented lines in literal scalar", () => {
		const yaml = "|\n first\n   more\n second\n";
		expect(parseValue(yaml)).toBe("first\n  more\nsecond\n");
	});
});
