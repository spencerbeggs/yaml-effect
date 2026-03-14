import { Effect, pipe } from "effect";
import { describe, expect, it } from "vitest";
import { YamlFormatError } from "../src/errors/YamlFormatError.js";
import { YamlModificationError } from "../src/errors/YamlModificationError.js";
import { YamlEdit } from "../src/schemas/YamlShared.js";
import { applyEdits, format, formatAndApply, modify, modifyAndApply } from "../src/utils/format.js";

describe("applyEdits", () => {
	it("applies a single replacement edit", () => {
		const text = "hello world";
		const edits = [new YamlEdit({ offset: 6, length: 5, content: "yaml" })];
		const result = Effect.runSync(applyEdits(text, edits));
		expect(result).toBe("hello yaml");
	});

	it("applies multiple edits in correct order", () => {
		const text = "aaa bbb ccc";
		const edits = [
			new YamlEdit({ offset: 0, length: 3, content: "xxx" }),
			new YamlEdit({ offset: 8, length: 3, content: "zzz" }),
		];
		const result = Effect.runSync(applyEdits(text, edits));
		expect(result).toBe("xxx bbb zzz");
	});

	it("handles insertion (length 0)", () => {
		const text = "ab";
		const edits = [new YamlEdit({ offset: 1, length: 0, content: "X" })];
		const result = Effect.runSync(applyEdits(text, edits));
		expect(result).toBe("aXb");
	});

	it("handles deletion (empty content)", () => {
		const text = "hello world";
		const edits = [new YamlEdit({ offset: 5, length: 6, content: "" })];
		const result = Effect.runSync(applyEdits(text, edits));
		expect(result).toBe("hello");
	});

	it("returns original text for empty edit list", () => {
		const text = "unchanged";
		const result = Effect.runSync(applyEdits(text, []));
		expect(result).toBe("unchanged");
	});

	it("supports pipeline (data-last) usage", () => {
		const text = "abc";
		const edits = [new YamlEdit({ offset: 1, length: 1, content: "X" })];
		const result = Effect.runSync(pipe(text, applyEdits(edits)));
		expect(result).toBe("aXc");
	});

	it("clamps offset beyond string length", () => {
		const text = "short";
		const edits = [new YamlEdit({ offset: 100, length: 0, content: "!" })];
		const result = Effect.runSync(applyEdits(text, edits));
		expect(result).toBe("short!");
	});

	it("clamps length when offset + length exceeds string length", () => {
		const text = "short";
		const edits = [new YamlEdit({ offset: 3, length: 100, content: "!" })];
		const result = Effect.runSync(applyEdits(text, edits));
		expect(result).toBe("sho!");
	});
});

describe("format", () => {
	it("re-indents from 4 spaces to 2 spaces", () => {
		const input = "root:\n    nested: value\n";
		const result = Effect.runSync(
			format(input, { indent: 2 }).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).toContain("root:");
		expect(result).toContain("nested: value");
		// Should use 2-space indent, not 4
		expect(result).not.toContain("    nested");
	});

	it("adds final newline when finalNewline is true", () => {
		const input = "key: value";
		const result = Effect.runSync(
			format(input, { finalNewline: true }).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).toMatch(/\n$/);
	});

	it("removes final newline when finalNewline is false", () => {
		const input = "key: value\n";
		const result = Effect.runSync(
			format(input, { finalNewline: false }).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).not.toMatch(/\n$/);
	});

	it("sorts keys alphabetically when sortKeys is true", () => {
		const input = "z: 1\na: 2\nm: 3\n";
		const result = Effect.runSync(
			format(input, { sortKeys: true }).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		const keys = result
			.trim()
			.split("\n")
			.map((l) => l.split(":")[0]);
		expect(keys).toEqual(["a", "m", "z"]);
	});

	it("returns empty edits for already-formatted input", () => {
		const input = "key: value\n";
		const edits = Effect.runSync(format(input));
		expect(edits).toEqual([]);
	});

	it("preserves comments by default", () => {
		const input = "# header comment\nkey: value\n";
		const result = Effect.runSync(format(input).pipe(Effect.flatMap((edits) => applyEdits(input, edits))));
		expect(result).toContain("# header comment");
	});

	it("strips comments when preserveComments is false", () => {
		const input = "# header\nkey: value # inline\n";
		const result = Effect.runSync(
			format(input, { preserveComments: false }).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).not.toContain("# header");
		expect(result).not.toContain("# inline");
		expect(result).toContain("key: value");
	});

	it("restricts edits to range when specified", () => {
		const input = "a: 1\nb:   2\nc: 3\n";
		const edits = Effect.runSync(format(input, { range: { offset: 5, length: 7 } }));
		// Only edits within the range [5, 12) should be returned
		for (const edit of edits) {
			expect(edit.offset).toBeGreaterThanOrEqual(5);
			expect(edit.offset + edit.length).toBeLessThanOrEqual(12);
		}
	});

	it("fails with YamlFormatError on invalid YAML", () => {
		// *undefined_anchor references an anchor that was never defined,
		// which the composer treats as a fatal UndefinedAlias error.
		const result = Effect.runSync(Effect.either(format("*undefined_anchor")));
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left).toBeInstanceOf(YamlFormatError);
		}
	});
});

describe("formatAndApply", () => {
	it("returns formatted string directly", () => {
		const input = "root:\n    nested: value\n";
		const result = Effect.runSync(formatAndApply(input, { indent: 2 }));
		expect(result).toContain("root:");
		expect(result).not.toContain("    nested");
	});

	it("produces same result as format + applyEdits", () => {
		const input = "z: 1\na: 2\n";
		const opts = { sortKeys: true } as const;
		const viaEdits = Effect.runSync(format(input, opts).pipe(Effect.flatMap((edits) => applyEdits(input, edits))));
		const viaDirect = Effect.runSync(formatAndApply(input, opts));
		expect(viaDirect).toBe(viaEdits);
	});
});

describe("modify", () => {
	it("replaces an existing scalar value", () => {
		const input = "name: Alice\nage: 30\n";
		const result = Effect.runSync(
			modify(input, ["name"], "Bob").pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).toContain("name: Bob");
	});

	it("inserts a new key at top level", () => {
		const input = "name: Alice\n";
		const result = Effect.runSync(
			modify(input, ["email"], "alice@example.com").pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).toContain("email:");
		expect(result).toContain("name: Alice");
	});

	it("removes a key when value is undefined", () => {
		const input = "name: Alice\nage: 30\n";
		const result = Effect.runSync(
			modify(input, ["age"], undefined).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).not.toContain("age");
		expect(result).toContain("name: Alice");
	});

	it("modifies a nested value", () => {
		const input = "server:\n  host: localhost\n  port: 3000\n";
		const result = Effect.runSync(
			modify(input, ["server", "port"], 8080).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).toContain("8080");
		expect(result).toContain("host: localhost");
	});

	it("modifies an array element by index", () => {
		const input = "items:\n  - apple\n  - banana\n  - cherry\n";
		const result = Effect.runSync(
			modify(input, ["items", 1], "blueberry").pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		expect(result).toContain("blueberry");
		expect(result).not.toContain("banana");
	});

	it("supports pipeline (data-last) usage", () => {
		const input = "key: old\n";
		const result = Effect.runSync(
			pipe(
				input,
				modify(["key"], "new"),
				Effect.flatMap((edits) => applyEdits(input, edits)),
			),
		);
		expect(result).toContain("key: new");
	});

	it("fails with YamlModificationError on invalid path", () => {
		const input = "name: Alice\n";
		const result = Effect.runSync(Effect.either(modify(input, ["nonexistent", "deep"], "value")));
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left).toBeInstanceOf(YamlModificationError);
		}
	});
});

describe("modifyAndApply", () => {
	it("returns modified string directly", () => {
		const input = "name: Alice\n";
		const result = Effect.runSync(modifyAndApply(input, ["name"], "Bob"));
		expect(result).toContain("name: Bob");
	});

	it("produces same result as modify + applyEdits", () => {
		const input = "a: 1\nb: 2\n";
		const viaEdits = Effect.runSync(modify(input, ["a"], 99).pipe(Effect.flatMap((edits) => applyEdits(input, edits))));
		const viaDirect = Effect.runSync(modifyAndApply(input, ["a"], 99));
		expect(viaDirect).toBe(viaEdits);
	});

	it("supports pipeline (data-last) usage", () => {
		const input = "key: old\n";
		const result = Effect.runSync(pipe(input, modifyAndApply(["key"], "new")));
		expect(result).toContain("key: new");
	});
});
