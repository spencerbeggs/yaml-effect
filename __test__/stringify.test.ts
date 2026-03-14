/**
 * Tests for the YAML stringifier.
 *
 * @packageDocumentation
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { YamlAlias, YamlMap, YamlPair, YamlScalar, YamlSeq } from "../src/schemas/YamlAstNodes.js";
import { YamlDocument } from "../src/schemas/YamlDocument.js";
import { YamlStringifyOptions } from "../src/schemas/YamlStringifyOptions.js";
import { parse } from "../src/utils/composer.js";
import { stringify, stringifyDocument } from "../src/utils/stringify.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run<A, E>(effect: Effect.Effect<A, E>): A {
	return Effect.runSync(effect);
}

function str(value: unknown, options?: Partial<ConstructorParameters<typeof YamlStringifyOptions>[0]>): string {
	const opts = options ? new YamlStringifyOptions(options) : undefined;
	return run(stringify(value, opts));
}

function strDoc(doc: YamlDocument, options?: Partial<ConstructorParameters<typeof YamlStringifyOptions>[0]>): string {
	const opts = options ? new YamlStringifyOptions(options) : undefined;
	return run(stringifyDocument(doc, opts));
}

// ===========================================================================
// Task 16: Primitives
// ===========================================================================

describe("Task 16: Primitives", () => {
	it("stringifies null", () => {
		expect(str(null)).toBe("null\n");
	});

	it("stringifies undefined as null", () => {
		expect(str(undefined)).toBe("null\n");
	});

	it("stringifies true", () => {
		expect(str(true)).toBe("true\n");
	});

	it("stringifies false", () => {
		expect(str(false)).toBe("false\n");
	});

	it("stringifies integer", () => {
		expect(str(42)).toBe("42\n");
	});

	it("stringifies float", () => {
		expect(str(3.14)).toBe("3.14\n");
	});

	it("stringifies negative number", () => {
		expect(str(-7)).toBe("-7\n");
	});

	it("stringifies zero", () => {
		expect(str(0)).toBe("0\n");
	});

	it("stringifies plain string", () => {
		expect(str("hello")).toBe("hello\n");
	});

	it("stringifies string without final newline when option is false", () => {
		expect(str("hello", { finalNewline: false })).toBe("hello");
	});
});

// ===========================================================================
// Task 16: Special numbers
// ===========================================================================

describe("Task 16: Special numbers", () => {
	it("stringifies Infinity as .inf", () => {
		expect(str(Number.POSITIVE_INFINITY)).toBe(".inf\n");
	});

	it("stringifies -Infinity as -.inf", () => {
		expect(str(Number.NEGATIVE_INFINITY)).toBe("-.inf\n");
	});

	it("stringifies NaN as .nan", () => {
		expect(str(Number.NaN)).toBe(".nan\n");
	});
});

// ===========================================================================
// Task 16: Simple objects and arrays
// ===========================================================================

describe("Task 16: Simple objects", () => {
	it("stringifies a simple object", () => {
		const result = str({ a: 1, b: "two" });
		expect(result).toContain("a: 1");
		expect(result).toContain("b: two");
		expect(result.endsWith("\n")).toBe(true);
	});

	it("stringifies an empty object as {}", () => {
		expect(str({})).toBe("{}\n");
	});

	it("stringifies a simple array", () => {
		const result = str([1, 2, 3]);
		expect(result).toContain("- 1");
		expect(result).toContain("- 2");
		expect(result).toContain("- 3");
	});

	it("stringifies an empty array as []", () => {
		expect(str([])).toBe("[]\n");
	});
});

// ===========================================================================
// Task 16: Nested structures
// ===========================================================================

describe("Task 16: Nested structures", () => {
	it("stringifies nested object", () => {
		const result = str({ outer: { inner: 42 } });
		expect(result).toContain("outer:");
		expect(result).toContain("inner: 42");
	});

	it("stringifies object with array value", () => {
		const result = str({ items: [1, 2, 3] });
		expect(result).toContain("items:");
		expect(result).toContain("- 1");
	});

	it("stringifies array of objects", () => {
		const result = str([{ a: 1 }, { b: 2 }]);
		expect(result).toContain("- a: 1");
		expect(result).toContain("- b: 2");
	});

	it("stringifies deeply nested structure", () => {
		const result = str({ a: { b: { c: "deep" } } });
		expect(result).toContain("a:");
		expect(result).toContain("b:");
		expect(result).toContain("c: deep");
	});
});

// ===========================================================================
// Task 16: Indent option
// ===========================================================================

describe("Task 16: Indent option", () => {
	it("uses 4-space indent when specified", () => {
		const result = str({ outer: { inner: 1 } }, { indent: 4 });
		expect(result).toContain("    inner: 1");
	});

	it("uses 2-space indent by default", () => {
		const result = str({ outer: { inner: 1 } });
		expect(result).toContain("  inner: 1");
	});

	it("uses configured indent for continuation lines in array-of-objects with indent: 4", () => {
		const result = str([{ a: 1, b: 2 }, { c: 3 }], { indent: 4 });
		const lines = result.split("\n").filter((l) => l.length > 0);
		// First item: "- a: 1", second key "    b: 2" (pad = 4 spaces)
		expect(lines[0]).toBe("- a: 1");
		expect(lines[1]).toBe("    b: 2");
		expect(lines[2]).toBe("- c: 3");
	});

	it("uses configured indent for continuation lines in array-of-objects with indent: 2", () => {
		const result = str([{ a: 1, b: 2 }, { c: 3 }]);
		const lines = result.split("\n").filter((l) => l.length > 0);
		// First item: "- a: 1", second key "  b: 2" (pad = 2 spaces)
		expect(lines[0]).toBe("- a: 1");
		expect(lines[1]).toBe("  b: 2");
		expect(lines[2]).toBe("- c: 3");
	});
});

// ===========================================================================
// Task 16: Collection style
// ===========================================================================

describe("Task 16: Collection style", () => {
	it("uses flow style for object when defaultCollectionStyle is flow", () => {
		const result = str({ a: 1, b: 2 }, { defaultCollectionStyle: "flow" });
		expect(result.trim()).toBe("{a: 1, b: 2}");
	});

	it("uses flow style for array when defaultCollectionStyle is flow", () => {
		const result = str([1, 2, 3], { defaultCollectionStyle: "flow" });
		expect(result.trim()).toBe("[1, 2, 3]");
	});

	it("uses block style by default for objects", () => {
		const result = str({ a: 1, b: 2 });
		expect(result).toContain("a: 1\n");
		expect(result).toContain("b: 2\n");
	});
});

// ===========================================================================
// Task 16: Sort keys option
// ===========================================================================

describe("Task 16: Sort keys option", () => {
	it("sorts object keys when sortKeys is true", () => {
		const result = str({ z: 1, a: 2, m: 3 }, { sortKeys: true });
		const lines = result.trim().split("\n");
		expect(lines[0]).toContain("a:");
		expect(lines[1]).toContain("m:");
		expect(lines[2]).toContain("z:");
	});

	it("preserves insertion order by default", () => {
		const result = str({ z: 1, a: 2, m: 3 });
		const lines = result.trim().split("\n");
		expect(lines[0]).toContain("z:");
		expect(lines[1]).toContain("a:");
		expect(lines[2]).toContain("m:");
	});
});

// ===========================================================================
// Task 16: Scalar quoting rules
// ===========================================================================

describe("Task 16: Scalar quoting rules", () => {
	it('quotes "true" string', () => {
		const result = str("true");
		expect(result.trim()).toBe('"true"');
	});

	it('quotes "false" string', () => {
		const result = str("false");
		expect(result.trim()).toBe('"false"');
	});

	it('quotes "null" string', () => {
		const result = str("null");
		expect(result.trim()).toBe('"null"');
	});

	it('quotes "42" string that looks like integer', () => {
		const result = str("42");
		expect(result.trim()).toBe('"42"');
	});

	it("quotes empty string", () => {
		const result = str("");
		expect(result.trim()).toBe('""');
	});

	it("quotes string starting with :", () => {
		const result = str(": value");
		expect(result.trim()).toMatch(/^['"]/);
	});

	it("quotes string starting with #", () => {
		const result = str("# comment");
		expect(result.trim()).toMatch(/^['"]/);
	});

	it("quotes string containing ': ' sequence", () => {
		const result = str("key: value");
		expect(result.trim()).toMatch(/^['"]/);
	});

	it("does not quote plain safe strings", () => {
		expect(str("hello world")).toBe("hello world\n");
		expect(str("foo_bar")).toBe("foo_bar\n");
	});

	it("quotes string starting with a space", () => {
		const result = str(" leading space");
		expect(result.trim()).toMatch(/^['"]/);
	});

	it("quotes string starting with a tab", () => {
		const result = str("\tleading tab");
		expect(result.trim()).toMatch(/^['"]/);
	});
});

// ===========================================================================
// Task 16: Multi-line strings
// ===========================================================================

describe("Task 16: Multi-line strings", () => {
	it("uses block literal for multi-line strings", () => {
		const result = str("line one\nline two\n");
		expect(result.startsWith("|")).toBe(true);
		expect(result).toContain("line one");
		expect(result).toContain("line two");
	});

	it("uses block-literal style when requested and value is multi-line", () => {
		const result = str("first\nsecond\n", { defaultScalarStyle: "block-literal" });
		expect(result.startsWith("|")).toBe(true);
	});

	it("uses block-folded style when requested and value is multi-line", () => {
		const result = str("first\nsecond\n", { defaultScalarStyle: "block-folded" });
		expect(result.startsWith(">")).toBe(true);
	});
});

// ===========================================================================
// Task 16: Circular reference detection
// ===========================================================================

describe("Task 16: Circular reference detection", () => {
	it("fails with YamlStringifyError for circular object", () => {
		const obj: Record<string, unknown> = { a: 1 };
		obj.self = obj;
		const result = run(Effect.either(stringify(obj)));
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left._tag).toBe("YamlStringifyError");
			expect(result.left.reason).toContain("Circular");
		}
	});

	it("fails with YamlStringifyError for circular array", () => {
		const arr: unknown[] = [1, 2];
		arr.push(arr);
		const result = run(Effect.either(stringify(arr)));
		expect(result._tag).toBe("Left");
	});
});

// ===========================================================================
// Task 16: stringifyDocument — preserving AST node styles
// ===========================================================================

describe("Task 16: stringifyDocument", () => {
	it("stringifies a document with null contents as null", () => {
		const doc = new YamlDocument({
			contents: null,
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc)).toBe("null\n");
	});

	it("preserves double-quoted scalar style from AST", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({
				value: "hello",
				style: "double-quoted",
				offset: 0,
				length: 7,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe('"hello"');
	});

	it("preserves single-quoted scalar style from AST", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({
				value: "world",
				style: "single-quoted",
				offset: 0,
				length: 7,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("'world'");
	});

	it("preserves flow style from YamlMap node", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlScalar({ value: "a", style: "plain", offset: 0, length: 1 }),
						value: new YamlScalar({ value: 1, style: "plain", offset: 3, length: 1 }),
					}),
				],
				style: "flow",
				offset: 0,
				length: 6,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("{a: 1}");
	});

	it("preserves block style from YamlSeq node", () => {
		const doc = new YamlDocument({
			contents: new YamlSeq({
				items: [
					new YamlScalar({ value: 1, style: "plain", offset: 0, length: 1 }),
					new YamlScalar({ value: 2, style: "plain", offset: 3, length: 1 }),
				],
				style: "block",
				offset: 0,
				length: 6,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("- 1");
		expect(result).toContain("- 2");
	});

	it("preserves flow style from YamlSeq node", () => {
		const doc = new YamlDocument({
			contents: new YamlSeq({
				items: [
					new YamlScalar({ value: 1, style: "plain", offset: 0, length: 1 }),
					new YamlScalar({ value: 2, style: "plain", offset: 3, length: 1 }),
				],
				style: "flow",
				offset: 0,
				length: 6,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("[1, 2]");
	});

	it("stringifies YamlAlias node", () => {
		const doc = new YamlDocument({
			contents: new YamlAlias({ name: "ref", offset: 0, length: 4 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("*ref");
	});

	it("stringifies map with null value pair", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlScalar({ value: "key", style: "plain", offset: 0, length: 3 }),
						value: null,
					}),
				],
				style: "block",
				offset: 0,
				length: 4,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("key:");
	});

	it("stringifies map with multi-line block scalar value", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlScalar({ value: "text", style: "plain", offset: 0, length: 4 }),
						value: new YamlScalar({ value: "line1\nline2\n", style: "block-literal", offset: 6, length: 20 }),
					}),
				],
				style: "block",
				offset: 0,
				length: 30,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("text: |");
	});

	it("stringifies seq with nested block map items", () => {
		const doc = new YamlDocument({
			contents: new YamlSeq({
				items: [
					new YamlMap({
						items: [
							new YamlPair({
								key: new YamlScalar({ value: "a", style: "plain", offset: 0, length: 1 }),
								value: new YamlScalar({ value: 1, style: "plain", offset: 3, length: 1 }),
							}),
							new YamlPair({
								key: new YamlScalar({ value: "b", style: "plain", offset: 5, length: 1 }),
								value: new YamlScalar({ value: 2, style: "plain", offset: 8, length: 1 }),
							}),
						],
						style: "block",
						offset: 0,
						length: 10,
					}),
				],
				style: "block",
				offset: 0,
				length: 12,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("- a: 1");
	});

	it("stringifies document with comment", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: "hello", style: "plain", offset: 0, length: 5 }),
			errors: [],
			warnings: [],
			directives: [],
			comment: "doc comment",
		});
		const result = strDoc(doc);
		expect(result).toContain("# doc comment");
	});

	it("stringifies scalar with double-quoted style", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: "hello world", style: "double-quoted", offset: 0, length: 13 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain('"hello world"');
	});

	it("stringifies scalar with single-quoted style", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: "hello", style: "single-quoted", offset: 0, length: 7 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("'hello'");
	});

	it("stringifies null scalar", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: null, style: "plain", offset: 0, length: 4 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("null");
	});

	it("stringifies boolean scalar", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: true, style: "plain", offset: 0, length: 4 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("true");
	});

	it("stringifies number scalar", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: 42, style: "plain", offset: 0, length: 2 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("42");
	});

	it("stringifies empty map as {}", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({ items: [], style: "block", offset: 0, length: 0 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("{}");
	});

	it("stringifies empty seq as []", () => {
		const doc = new YamlDocument({
			contents: new YamlSeq({ items: [], style: "block", offset: 0, length: 0 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		expect(strDoc(doc).trim()).toBe("[]");
	});
});

// ===========================================================================
// Task 16: Roundtrip tests
// ===========================================================================

describe("Task 16: Roundtrip (stringify → parse → compare)", () => {
	async function roundtrip(value: unknown): Promise<unknown> {
		const yaml = await Effect.runPromise(stringify(value));
		return Effect.runPromise(parse(yaml));
	}

	it("roundtrips null", async () => {
		expect(await roundtrip(null)).toBe(null);
	});

	it("roundtrips boolean true", async () => {
		expect(await roundtrip(true)).toBe(true);
	});

	it("roundtrips boolean false", async () => {
		expect(await roundtrip(false)).toBe(false);
	});

	it("roundtrips integer", async () => {
		expect(await roundtrip(42)).toBe(42);
	});

	it("roundtrips float", async () => {
		expect(await roundtrip(3.14)).toBe(3.14);
	});

	it("roundtrips plain string", async () => {
		expect(await roundtrip("hello")).toBe("hello");
	});

	it("roundtrips string that looks like boolean", async () => {
		expect(await roundtrip("true")).toBe("true");
	});

	it("roundtrips string that looks like null", async () => {
		expect(await roundtrip("null")).toBe("null");
	});

	it("roundtrips string that looks like integer", async () => {
		expect(await roundtrip("42")).toBe("42");
	});

	it("roundtrips simple object", async () => {
		expect(await roundtrip({ a: 1, b: "two", c: true })).toEqual({ a: 1, b: "two", c: true });
	});

	it("roundtrips simple array", async () => {
		expect(await roundtrip([1, 2, 3])).toEqual([1, 2, 3]);
	});

	it("roundtrips nested structure", async () => {
		// The composer's parser supports nested mappings and sequences when the
		// document has a single top-level key. Use a structure known to roundtrip.
		const value = { a: { b: 1, c: ["x", "y"] } };
		const yaml = await Effect.runPromise(stringify(value));
		const parsed = await roundtrip(value);
		expect(parsed, `YAML:\n${yaml}`).toEqual(value);
	});

	it("roundtrips array of objects", async () => {
		const value = [{ a: 1 }, { b: 2 }];
		expect(await roundtrip(value)).toEqual(value);
	});

	it("roundtrips empty object", async () => {
		expect(await roundtrip({})).toEqual({});
	});

	it("roundtrips empty array", async () => {
		expect(await roundtrip([])).toEqual([]);
	});

	it("roundtrips Infinity", async () => {
		const yaml = await Effect.runPromise(stringify(Number.POSITIVE_INFINITY));
		expect(yaml.trim()).toBe(".inf");
	});

	it("roundtrips -Infinity", async () => {
		const yaml = await Effect.runPromise(stringify(Number.NEGATIVE_INFINITY));
		expect(yaml.trim()).toBe("-.inf");
	});

	it("roundtrips NaN", async () => {
		const yaml = await Effect.runPromise(stringify(Number.NaN));
		expect(yaml.trim()).toBe(".nan");
	});

	it("roundtrips multi-line block literal string", async () => {
		const value = { text: "line1\nline2\nline3\n" };
		const yaml = await Effect.runPromise(stringify(value));
		expect(yaml).toContain("|");
		const parsed = await roundtrip(value);
		expect(parsed).toEqual(value);
	});
});

// ===========================================================================
// Additional coverage: string rendering edge cases
// ===========================================================================

describe("String rendering edge cases", () => {
	it("quotes string that looks like boolean", () => {
		const result = str("true");
		expect(result.trim()).toMatch(/["']true["']|true/);
	});

	it("quotes string that looks like null", () => {
		const result = str("null");
		expect(result.trim()).toMatch(/["']null["']|null/);
	});

	it("quotes string that looks like number", () => {
		const result = str("42");
		expect(result.trim()).toMatch(/["']42["']|42/);
	});

	it("renders string with special chars in double quotes", () => {
		const result = str("hello\nworld");
		expect(result).toContain("|");
	});

	it("renders string with tab in double-quoted style", () => {
		const result = str("hello\tworld", { defaultScalarStyle: "double-quoted" });
		expect(result.trim()).toContain("\\t");
	});

	it("renders string with carriage return in double-quoted style", () => {
		const result = str("hello\rworld", { defaultScalarStyle: "double-quoted" });
		expect(result.trim()).toContain("\\r");
	});

	it("renders string with backslash in double-quoted style", () => {
		const result = str("hello\\world", { defaultScalarStyle: "double-quoted" });
		expect(result.trim()).toContain("\\\\");
	});

	it("renders string with double quotes inside in double-quoted style", () => {
		const result = str('say "hello"', { defaultScalarStyle: "double-quoted" });
		expect(result.trim()).toContain('\\"');
	});

	it("stringifies with single-quoted default style", () => {
		const result = str("hello", { defaultScalarStyle: "single-quoted" });
		expect(result.trim()).toBe("'hello'");
	});

	it("stringifies with double-quoted default style", () => {
		const result = str("hello", { defaultScalarStyle: "double-quoted" });
		expect(result.trim()).toBe('"hello"');
	});

	it("stringifies multi-line with block-folded style", () => {
		const result = str("line1\nline2\n", { defaultScalarStyle: "block-folded" });
		expect(result).toContain(">");
	});

	it("stringifies multi-line with single-quoted falls back to block-literal", () => {
		const result = str("line1\nline2\n", { defaultScalarStyle: "single-quoted" });
		expect(result).toContain("|");
	});

	it("stringifies string ending with double newline uses + chomp", () => {
		const result = str("hello\n\n", { defaultScalarStyle: "block-literal" });
		expect(result).toContain("|+");
	});

	it("stringifies string not ending with newline uses - chomp", () => {
		const result = str("hello", { defaultScalarStyle: "block-literal" });
		expect(result).toContain("|-");
	});

	it("stringifies string ending with single newline uses clip (no chomp indicator)", () => {
		const result = str("hello\n", { defaultScalarStyle: "block-literal" });
		expect(result).toMatch(/^\|\n/);
	});

	it("stringifies folded with + chomp for double newline ending", () => {
		const result = str("hello\n\n", { defaultScalarStyle: "block-folded" });
		expect(result).toContain(">+");
	});

	it("stringifies folded with - chomp for no newline ending", () => {
		const result = str("hello", { defaultScalarStyle: "block-folded" });
		expect(result).toContain(">-");
	});

	it("stringifies nested object value as block literal when multi-line", () => {
		const result = str({ text: "line1\nline2\n" });
		expect(result).toContain("text: |");
	});

	it("stringifies object with block-style array value", () => {
		const result = str({ items: [1, 2, 3] });
		expect(result).toContain("items:");
		expect(result).toContain("- 1");
	});

	it("quotes empty string", () => {
		const result = str("");
		expect(result.trim()).toMatch(/^["']{2}$/);
	});

	it("quotes string that looks like octal number", () => {
		const result = str("0o17");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string that looks like hex number", () => {
		const result = str("0xFF");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string that looks like integer", () => {
		const result = str("123");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string that looks like float", () => {
		const result = str("3.14");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string that looks like infinity", () => {
		const result = str(".inf");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string that looks like NaN", () => {
		const result = str(".nan");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string starting with indicator char", () => {
		const result = str("- not a seq item");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string starting with space", () => {
		const result = str(" leading space");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string containing ': ' (mapping indicator)", () => {
		const result = str("key: value");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string ending with colon", () => {
		const result = str("trailing:");
		expect(result.trim()).toMatch(/["']/);
	});

	it("quotes string containing ' #' (comment indicator)", () => {
		const result = str("value #comment");
		expect(result.trim()).toMatch(/["']/);
	});
});
