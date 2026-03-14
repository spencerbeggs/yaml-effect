import { Effect, pipe } from "effect";
import { describe, expect, it } from "vitest";
import { YamlEdit } from "../src/schemas/YamlShared.js";
import { applyEdits } from "../src/utils/format.js";

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
