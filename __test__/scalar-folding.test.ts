/**
 * Tests for YAML 1.2 scalar folding rules (Issue #9).
 *
 * YAML 1.2 §6.5 Line Folding:
 * - Bare newline between non-empty lines → single space (fold)
 * - Empty line(s) between non-empty lines → preserved as \n
 * - Leading whitespace on continuation lines trimmed (indentation)
 * - Trailing whitespace on lines before newline trimmed
 */
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse } from "../src/utils/composer.js";

function parseValue(input: string): unknown {
	const result = Effect.runSync(Effect.either(parse(input, { uniqueKeys: false })));
	if (Either.isLeft(result)) throw new Error(`Parse failed: ${JSON.stringify(result.left)}`);
	return Either.getOrThrow(result);
}

describe("Plain scalar folding", () => {
	// Adjacent non-empty lines fold to space
	it("folds adjacent lines to space", () => {
		const yaml = "this\nis\na test\n";
		expect(parseValue(yaml)).toBe("this is a test");
	});

	// Empty line between content lines → newline
	it("preserves empty lines as newlines", () => {
		const yaml = "first\n\nsecond\n";
		expect(parseValue(yaml)).toBe("first\nsecond");
	});

	// Multiple empty lines → multiple newlines
	it("preserves multiple empty lines", () => {
		const yaml = "first\n\n\nthird\n";
		expect(parseValue(yaml)).toBe("first\n\nthird");
	});

	// Leading whitespace on continuation lines is trimmed
	it("trims leading whitespace on continuation lines", () => {
		const yaml = "first\n  second\n";
		expect(parseValue(yaml)).toBe("first second");
	});

	// Trailing whitespace before newline is trimmed
	it("trims trailing whitespace before fold", () => {
		const yaml = "first   \nsecond\n";
		expect(parseValue(yaml)).toBe("first second");
	});

	// HS5T: Spec Example 7.12 Plain Lines
	it("[HS5T] tab as separation space in plain scalar", () => {
		const yaml = "1st non-empty\n\n 2nd non-empty \n\t3rd non-empty\n";
		expect(parseValue(yaml)).toBe("1st non-empty\n2nd non-empty 3rd non-empty");
	});

	// 4CQQ: multi-line plain scalar as mapping value
	it("[4CQQ] plain scalar spans many lines", () => {
		const yaml = "plain:\n  This unquoted scalar\n  spans many lines.\n";
		const result = parseValue(yaml) as Record<string, unknown>;
		expect(result.plain).toBe("This unquoted scalar spans many lines.");
	});
});

describe("Double-quoted scalar folding", () => {
	// Basic bare newline → space
	it("folds bare newline to space", () => {
		const yaml = '"hello\nworld"\n';
		expect(parseValue(yaml)).toBe("hello world");
	});

	// Trim leading whitespace after bare newline (indentation)
	it("trims leading whitespace after bare newline", () => {
		const yaml = '"hello\n    world"\n';
		expect(parseValue(yaml)).toBe("hello world");
	});

	// Trim trailing whitespace before bare newline
	it("trims trailing whitespace before bare newline", () => {
		const yaml = '"hello   \nworld"\n';
		expect(parseValue(yaml)).toBe("hello world");
	});

	// Empty line in double-quoted → preserved as \n
	it("preserves empty line as newline", () => {
		const yaml = '"first\n\nsecond"\n';
		expect(parseValue(yaml)).toBe("first\nsecond");
	});

	// 3RLN/00: \t escape after indentation produces literal tab in content
	it("[3RLN/00] leading tab preserved after fold", () => {
		// Fixture: "1 leading<LF>    \ttab" — \t is YAML escape (backslash + t)
		const yaml = '"1 leading\n    \\ttab"\n';
		expect(parseValue(yaml)).toBe("1 leading \ttab");
	});

	// DE56/00: trailing \t escape before newline preserved in content
	it("[DE56/00] trailing escaped tab preserved", () => {
		// Fixture: "1 trailing\t<LF>    tab" — \t is YAML escape (backslash + t)
		const yaml = '"1 trailing\\t\n    tab"\n';
		expect(parseValue(yaml)).toBe("1 trailing\t tab");
	});

	// DK95/02: tabs that look like indentation
	it("[DK95/02] tab as indentation in double-quoted trimmed", () => {
		// Raw: foo: "bar<LF>  <TAB>baz"
		const yaml = 'foo: "bar\n  \tbaz"\n';
		const result = parseValue(yaml) as Record<string, unknown>;
		expect(result.foo).toBe("bar baz");
	});

	// 4CQQ: quoted scalar with escape
	it("[4CQQ] double-quoted scalar with escape newline", () => {
		const yaml = '"So does this\n  quoted scalar.\\n"\n';
		expect(parseValue(yaml)).toBe("So does this quoted scalar.\n");
	});

	// Line continuation (backslash-newline) — should already work
	it("line continuation removes newline and whitespace", () => {
		const yaml = '"hello \\\n    world"\n';
		expect(parseValue(yaml)).toBe("hello world");
	});
});

describe("Single-quoted scalar folding", () => {
	// Basic bare newline → space
	it("folds bare newline to space", () => {
		const yaml = "'hello\nworld'\n";
		expect(parseValue(yaml)).toBe("hello world");
	});

	// Trim leading whitespace after bare newline
	it("trims leading whitespace after bare newline", () => {
		const yaml = "'hello\n    world'\n";
		expect(parseValue(yaml)).toBe("hello world");
	});

	// Empty line → preserved as \n
	it("preserves empty line as newline", () => {
		const yaml = "'first\n\nsecond'\n";
		expect(parseValue(yaml)).toBe("first\nsecond");
	});

	// Escaped quote still works
	it("handles escaped single quote with folding", () => {
		const yaml = "'it''s\na test'\n";
		expect(parseValue(yaml)).toBe("it's a test");
	});
});
