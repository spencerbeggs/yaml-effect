import { Effect, pipe } from "effect";
import { describe, expect, it } from "vitest";
import { YamlComposerError } from "../src/errors/YamlComposerError.js";
import { equals, equalsValue } from "../src/utils/equality.js";

describe("equals", () => {
	it("returns true for identical documents", () => {
		const result = Effect.runSync(equals("key: value\n", "key: value\n"));
		expect(result).toBe(true);
	});

	it("returns true for same data with different formatting", () => {
		const a = "key:   value\n";
		const b = "key: value\n";
		const result = Effect.runSync(equals(a, b));
		expect(result).toBe(true);
	});

	it("returns true for different key ordering", () => {
		const a = "z: 1\na: 2\n";
		const b = "a: 2\nz: 1\n";
		const result = Effect.runSync(equals(a, b));
		expect(result).toBe(true);
	});

	it("returns false for different sequence ordering", () => {
		const a = "items:\n  - 1\n  - 2\n";
		const b = "items:\n  - 2\n  - 1\n";
		const result = Effect.runSync(equals(a, b));
		expect(result).toBe(false);
	});

	it("returns true with resolved anchors/aliases", () => {
		const withAnchor = "defaults: &defs\n  timeout: 30\n";
		const withoutAnchor = "defaults:\n  timeout: 30\n";
		const result = Effect.runSync(equals(withAnchor, withoutAnchor));
		expect(result).toBe(true);
	});

	it("returns false for different values", () => {
		const result = Effect.runSync(equals("key: 1\n", "key: 2\n"));
		expect(result).toBe(false);
	});

	it("supports pipeline (data-last) usage", () => {
		const result = Effect.runSync(pipe("a: 1\n", equals("a: 1\n")));
		expect(result).toBe(true);
	});

	it("fails with YamlComposerError on invalid input", () => {
		const result = Effect.runSync(Effect.either(equals("valid: true\n", "*undefined_anchor")));
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left).toBeInstanceOf(YamlComposerError);
		}
	});

	it("ignores comments", () => {
		const a = "key: value # comment\n";
		const b = "key: value\n";
		const result = Effect.runSync(equals(a, b));
		expect(result).toBe(true);
	});

	it("treats NaN values as equal", () => {
		const a = ".nan\n";
		const b = ".nan\n";
		const result = Effect.runSync(equals(a, b));
		expect(result).toBe(true);
	});

	it("handles nested key order differences recursively", () => {
		const a = "outer:\n  z: 1\n  a: 2\n";
		const b = "outer:\n  a: 2\n  z: 1\n";
		const result = Effect.runSync(equals(a, b));
		expect(result).toBe(true);
	});
});

describe("equalsValue", () => {
	it("returns true when YAML matches JS value", () => {
		const yaml = "name: Alice\nage: 30\n";
		const value = { name: "Alice", age: 30 };
		const result = Effect.runSync(equalsValue(yaml, value));
		expect(result).toBe(true);
	});

	it("returns false when YAML does not match JS value", () => {
		const yaml = "name: Alice\n";
		const value = { name: "Bob" };
		const result = Effect.runSync(equalsValue(yaml, value));
		expect(result).toBe(false);
	});

	it("supports pipeline (data-last) usage", () => {
		const yaml = "items:\n  - 1\n  - 2\n";
		const value = { items: [1, 2] };
		const result = Effect.runSync(pipe(yaml, equalsValue(value)));
		expect(result).toBe(true);
	});

	it("fails with YamlComposerError on invalid YAML", () => {
		const result = Effect.runSync(Effect.either(equalsValue("*undefined_anchor", {})));
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left).toBeInstanceOf(YamlComposerError);
		}
	});

	it("handles null values", () => {
		const result = Effect.runSync(equalsValue("~\n", null));
		expect(result).toBe(true);
	});

	it("handles scalar values", () => {
		const result = Effect.runSync(equalsValue("42\n", 42));
		expect(result).toBe(true);
	});

	it("treats NaN YAML as equal to JS NaN", () => {
		const result = Effect.runSync(equalsValue(".nan\n", Number.NaN));
		expect(result).toBe(true);
	});

	it("returns false for different types", () => {
		const result = Effect.runSync(equalsValue("key: value\n", [1, 2]));
		expect(result).toBe(false);
	});

	it("returns false for arrays of different length", () => {
		const result = Effect.runSync(equalsValue("- 1\n- 2\n", [1]));
		expect(result).toBe(false);
	});

	it("returns false when b is array but a is not", () => {
		const result = Effect.runSync(equalsValue("key: value\n", [1]));
		expect(result).toBe(false);
	});

	it("returns false when one side is null", () => {
		const result = Effect.runSync(equalsValue("key: value\n", null));
		expect(result).toBe(false);
	});

	it("returns false when object keys differ", () => {
		const result = Effect.runSync(equalsValue("a: 1\nb: 2\n", { a: 1, c: 2 }));
		expect(result).toBe(false);
	});

	it("returns false when comparing different types (string vs number)", () => {
		// "hello" (string) vs 42 (number) — typeof mismatch
		const result = Effect.runSync(equalsValue("hello\n", 42));
		expect(result).toBe(false);
	});

	it("returns false when comparing array to non-array object", () => {
		// YAML array vs JS object — array vs non-array
		const result = Effect.runSync(equalsValue("- 1\n- 2\n", { a: 1 }));
		expect(result).toBe(false);
	});

	it("returns false when objects have different key counts", () => {
		const result = Effect.runSync(equalsValue("a: 1\n", { a: 1, b: 2 }));
		expect(result).toBe(false);
	});
});
