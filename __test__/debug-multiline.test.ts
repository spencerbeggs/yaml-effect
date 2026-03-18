import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse } from "../src/utils/composer.js";
import { stringify } from "../src/utils/stringify.js";

/**
 * Tests for multi-line plain scalar continuation rules.
 * Each case verifies that the composer correctly merges continuation lines
 * where the lexer may mis-tokenize content as anchors, tags, directives,
 * or block sequence entries.
 */

describe("multi-line plain scalar continuation", () => {
	it("[3MYT] plain scalar with anchor and tag on continuation line", async () => {
		const result = await Effect.runPromise(parse("---\nk:#foo\n &a !t s\n"));
		expect(result).toEqual("k:#foo &a !t s");
	});

	it("[AB8U] sequence entry that looks like nested seq with wrong indentation", async () => {
		const result = await Effect.runPromise(parse("- single multiline\n - sequence entry\n"));
		expect(result).toEqual(["single multiline - sequence entry"]);
	});

	it("[XLQ9] multiline scalar that looks like a YAML directive", async () => {
		const result = await Effect.runPromise(parse("---\nscalar\n%YAML 1.2\n"));
		expect(result).toEqual("scalar %YAML 1.2");
	});

	it("[JTV5] block mapping with multiline explicit keys", async () => {
		const result = await Effect.runPromise(parse("? a\n  true\n: null\n  d\n? e\n  42\n"));
		expect(result).toEqual({ "a true": "null d", "e 42": null });
	});

	it("[FBC9] allowed characters in plain scalars with continuation", async () => {
		const yaml =
			"safe: a!\"#$%&'()*+,-./09:;<=>?@AZ[\\]^_`az{|}~\n     !\"#$%&'()*+,-./09:;<=>?@AZ[\\]^_`az{|}~\nsafe question mark: ?foo\nsafe colon: :foo\nsafe dash: -foo\n";
		expect(await Effect.runPromise(parse(yaml))).toEqual({
			safe: "a!\"#$%&'()*+,-./09:;<=>?@AZ[\\]^_`az{|}~ !\"#$%&'()*+,-./09:;<=>?@AZ[\\]^_`az{|}~",
			"safe question mark": "?foo",
			"safe colon": ":foo",
			"safe dash": "-foo",
		});
	});

	it("[7W2P] explicit keys without continuation should not merge", async () => {
		const result = await Effect.runPromise(parse("? a\n? b\nc:\n"));
		expect(result).toEqual({ a: null, b: null, c: null });
	});

	it("[V9D5] compact block mapping roundtrip regression", async () => {
		const yaml = "- sun: yellow\n- ? earth: blue\n  : moon: white\n";
		const parsed = Effect.runSync(Effect.either(parse(yaml, { uniqueKeys: false })));
		expect(Either.isRight(parsed)).toBe(true);
		const value = Either.getOrThrow(parsed);
		const stringified = Effect.runSync(Effect.either(stringify(value)));
		expect(Either.isRight(stringified)).toBe(true);
		const reparsed = Effect.runSync(Effect.either(parse(Either.getOrThrow(stringified), { uniqueKeys: false })));
		expect(Either.isRight(reparsed)).toBe(true);
		expect(Either.getOrThrow(reparsed)).toEqual(value);
	});
});
