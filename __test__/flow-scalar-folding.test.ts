/**
 * Tests for flow scalar (single-quoted / double-quoted / plain) line folding
 * and other parser value-correctness fixes.
 *
 * YAML 1.2 §6.5: Line folding trims leading whitespace on continuation lines
 * but must preserve trailing whitespace on the final line.
 */
import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse } from "../src/utils/composer.js";

function parseYaml(input: string): Either.Either<unknown, unknown> {
	return Effect.runSync(Effect.either(parse(input, { uniqueKeys: false })));
}

describe("Flow scalar folding — trailing whitespace preservation", () => {
	// PRH3: Spec Example 7.9. Single Quoted Lines
	it("[PRH3] preserves trailing whitespace in single-quoted scalar", () => {
		const yaml = "' 1st non-empty\n\n 2nd non-empty \n\t3rd non-empty '\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toBe(" 1st non-empty\n2nd non-empty 3rd non-empty ");
	});

	// T4YY: Spec Example 7.9 variant
	it("[T4YY] preserves trailing whitespace in single-quoted scalar (with document marker)", () => {
		const yaml = "---\n' 1st non-empty\n\n 2nd non-empty \n\t3rd non-empty '\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toBe(" 1st non-empty\n2nd non-empty 3rd non-empty ");
	});
});

describe("Bare sequence entry produces null", () => {
	// SM9W/00: Single character streams — bare `-` with no value
	it("[SM9W/00] bare dash produces sequence with null", () => {
		const yaml = "-";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual([null]);
	});
});

describe("Flow sequence implicit mapping entries (YAML 1.2 §7.4)", () => {
	// QF4Y: Spec Example 7.19. Single Pair Flow Mappings
	it("[QF4Y] implicit mapping inside flow sequence", () => {
		const yaml = "[\nfoo: bar\n]\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual([{ foo: "bar" }]);
	});

	// LQZ7: Spec Example 7.4. Double Quoted Implicit Keys
	it("[LQZ7] double-quoted implicit keys in flow sequence", () => {
		const yaml = '"implicit block key" : [\n  "implicit flow key" : value,\n ]\n';
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual({
			"implicit block key": [{ "implicit flow key": "value" }],
		});
	});

	// CN3R: Various location of anchors in flow sequence
	it("[CN3R] anchors in flow sequence with implicit mappings", () => {
		const yaml = "&flowseq [\n a: b,\n &c c: d,\n { &e e: f },\n &g { g: h }\n]\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual([{ a: "b" }, { c: "d" }, { e: "f" }, { g: "h" }]);
	});
});

describe("Flow mapping adjacent values (YAML 1.2 §7.18)", () => {
	// C2DT: Spec Example 7.18. Flow Mapping Adjacent Values
	it("[C2DT] colon without space after quoted key in flow mapping", () => {
		const yaml = '{\n"adjacent":value,\n"readable": value,\n"empty":\n}\n';
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual({ adjacent: "value", readable: "value", empty: null });
	});
});

describe("Multi-line plain scalar folding in flow context", () => {
	// 8UDB: Spec Example 7.14. Flow Sequence Entries
	it("[8UDB] plain scalar continuation in flow sequence", () => {
		const yaml =
			"[\n\"double\n quoted\",\n'single\n           quoted',\nplain\n text,\n[ nested ],\nsingle: pair,\n]\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual([
			"double quoted",
			"single quoted",
			"plain text",
			["nested"],
			{ single: "pair" },
		]);
	});
});

describe("Block scalar keep chomp preserves trailing newlines", () => {
	// JEF9/00: Literal block scalar with keep chomp `|+` and trailing empty lines
	it("[JEF9/00] keep chomp preserves trailing empty lines", () => {
		const yaml = "- |+\n\n\n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual(["\n\n"]);
	});

	// JEF9/01: keep chomp with whitespace-only line + trailing newline
	it("[JEF9/01] keep chomp with whitespace-only line", () => {
		const yaml = "- |+\n   \n";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual(["\n"]);
	});

	// JEF9/02: keep chomp with whitespace-only line, no trailing newline
	it("[JEF9/02] keep chomp with whitespace-only trailing content", () => {
		const yaml = "- |+\n   ";
		const result = parseYaml(yaml);
		expect(Either.isRight(result)).toBe(true);
		expect(Either.getOrThrow(result)).toEqual(["\n"]);
	});
});
