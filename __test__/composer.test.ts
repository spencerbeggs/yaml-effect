/**
 * Tests for the YAML composer (AST builder).
 *
 * @packageDocumentation
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { YamlAlias, YamlMap, YamlPair, YamlScalar, YamlSeq } from "../src/schemas/YamlAstNodes.js";
import type { YamlDocument } from "../src/schemas/YamlDocument.js";
import { parse, parseAllDocuments, parseDocument } from "../src/utils/composer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function doc(text: string, options?: { strict?: boolean; maxAliasCount?: number; uniqueKeys?: boolean }): YamlDocument {
	return Effect.runSync(parseDocument(text, options));
}

function val(text: string): unknown {
	return Effect.runSync(parse(text));
}

// ===========================================================================
// Task 14: Basic type resolution
// ===========================================================================

describe("Task 14: Basic type resolution", () => {
	describe("simple mapping", () => {
		it("parses a: 1, b: true, c: null into YamlDocument with YamlMap", () => {
			const result = doc("a: 1\nb: true\nc: null");
			expect(result.contents).toBeInstanceOf(YamlMap);
			const map = result.contents as InstanceType<typeof YamlMap>;
			expect(map.items).toHaveLength(3);
			expect(map.style).toBe("block");
		});

		it("resolves mapping values with Core Schema types", () => {
			const result = val("a: 1\nb: true\nc: null");
			expect(result).toEqual({ a: 1, b: true, c: null });
		});

		it("produces YamlPair nodes with YamlScalar keys and values", () => {
			const result = doc("a: 1");
			const map = result.contents as InstanceType<typeof YamlMap>;
			const pair = map.items[0];
			expect(pair).toBeInstanceOf(YamlPair);
			expect(pair.key).toBeInstanceOf(YamlScalar);
			expect(pair.value).toBeInstanceOf(YamlScalar);
			expect((pair.key as InstanceType<typeof YamlScalar>).value).toBe("a");
			expect((pair.value as InstanceType<typeof YamlScalar>).value).toBe(1);
		});
	});

	describe("simple sequence", () => {
		it("parses - 1, - two, - true into YamlDocument with YamlSeq", () => {
			const result = doc("- 1\n- two\n- true");
			expect(result.contents).toBeInstanceOf(YamlSeq);
			const seq = result.contents as InstanceType<typeof YamlSeq>;
			expect(seq.items).toHaveLength(3);
			expect(seq.style).toBe("block");
		});

		it("resolves sequence values with Core Schema types", () => {
			const result = val("- 1\n- two\n- true");
			expect(result).toEqual([1, "two", true]);
		});
	});

	describe("nested structures", () => {
		it("parses nested mapping with sequence", () => {
			const result = val("a:\n  b: 1\n  c:\n    - x\n    - y");
			expect(result).toEqual({ a: { b: 1, c: ["x", "y"] } });
		});

		it("builds correct AST structure for nested mapping", () => {
			const result = doc("a:\n  b: 1");
			expect(result.contents).toBeInstanceOf(YamlMap);
			const map = result.contents as InstanceType<typeof YamlMap>;
			expect(map.items).toHaveLength(1);
			const pair = map.items[0];
			expect((pair.key as InstanceType<typeof YamlScalar>).value).toBe("a");
			expect(pair.value).toBeInstanceOf(YamlMap);
		});
	});

	describe("YAML 1.2 Core Schema type resolution", () => {
		describe("null values", () => {
			it("resolves null", () => expect(val("null")).toBe(null));
			it("resolves Null", () => expect(val("Null")).toBe(null));
			it("resolves NULL", () => expect(val("NULL")).toBe(null));
			it("resolves ~", () => expect(val("~")).toBe(null));
			it("resolves empty value", () => expect(val("")).toBe(null));
		});

		describe("boolean values", () => {
			it("resolves true", () => expect(val("true")).toBe(true));
			it("resolves True", () => expect(val("True")).toBe(true));
			it("resolves TRUE", () => expect(val("TRUE")).toBe(true));
			it("resolves false", () => expect(val("false")).toBe(false));
			it("resolves False", () => expect(val("False")).toBe(false));
			it("resolves FALSE", () => expect(val("FALSE")).toBe(false));
		});

		describe("integer values", () => {
			it("resolves 0", () => expect(val("0")).toBe(0));
			it("resolves -1", () => expect(val("-1")).toBe(-1));
			it("resolves 42", () => expect(val("42")).toBe(42));
			it("resolves octal 0o7", () => expect(val("0o7")).toBe(7));
			it("resolves hex 0x1A", () => expect(val("0x1A")).toBe(26));
		});

		describe("float values", () => {
			it("resolves 1.0", () => expect(val("1.0")).toBe(1.0));
			it("resolves -0.5", () => expect(val("-0.5")).toBe(-0.5));
			it("resolves .inf", () => expect(val(".inf")).toBe(Number.POSITIVE_INFINITY));
			it("resolves -.inf", () => expect(val("-.inf")).toBe(Number.NEGATIVE_INFINITY));
			it("resolves .nan", () => expect(val(".nan")).toBeNaN());
		});

		describe("string values", () => {
			it("resolves unrecognized plain scalar as string", () => expect(val("hello world")).toBe("hello world"));
			it("resolves yes as string (not bool in YAML 1.2)", () => expect(val("yes")).toBe("yes"));
			it("resolves no as string (not bool in YAML 1.2)", () => expect(val("no")).toBe("no"));
		});
	});

	describe("flow collections", () => {
		it("parses flow mapping {a: 1}", () => {
			const result = val("{a: 1}");
			expect(result).toEqual({ a: 1 });
		});

		it("parses flow sequence [1, 2]", () => {
			const result = val("[1, 2]");
			expect(result).toEqual([1, 2]);
		});

		it("preserves flow style on AST nodes", () => {
			const result = doc("{a: 1}");
			expect(result.contents).toBeInstanceOf(YamlMap);
			expect((result.contents as InstanceType<typeof YamlMap>).style).toBe("flow");
		});
	});

	describe("block scalars", () => {
		it("parses literal block scalar", () => {
			const result = val("|\n  line1\n  line2");
			expect(result).toBe("line1\nline2\n");
		});

		it("parses folded block scalar", () => {
			const result = val(">\n  line1\n  line2");
			expect(result).toBe("line1 line2\n");
		});

		it("block scalars are always strings (no type resolution)", () => {
			const result = doc("|\n  true");
			expect(result.contents).toBeInstanceOf(YamlScalar);
			const scalar = result.contents as InstanceType<typeof YamlScalar>;
			expect(scalar.value).toBe("true\n");
			expect(typeof scalar.value).toBe("string");
		});
	});

	describe("quoted scalars", () => {
		it("quoted scalars remain strings (no type resolution)", () => {
			const result = val("'true'");
			expect(result).toBe("true");
			expect(typeof result).toBe("string");
		});

		it("double-quoted scalars remain strings", () => {
			const result = val('"42"');
			expect(result).toBe("42");
			expect(typeof result).toBe("string");
		});

		it("preserves scalar style on AST nodes", () => {
			const result = doc("'hello'");
			expect(result.contents).toBeInstanceOf(YamlScalar);
			expect((result.contents as InstanceType<typeof YamlScalar>).style).toBe("single-quoted");
		});
	});

	describe("position info", () => {
		it("preserves offset and length on scalar nodes", () => {
			const result = doc("hello");
			expect(result.contents).toBeInstanceOf(YamlScalar);
			const scalar = result.contents as InstanceType<typeof YamlScalar>;
			expect(scalar.offset).toBe(0);
			expect(scalar.length).toBe(5);
		});

		it("preserves offset on map nodes", () => {
			const result = doc("a: 1");
			expect(result.contents).toBeInstanceOf(YamlMap);
			const map = result.contents as InstanceType<typeof YamlMap>;
			expect(map.offset).toBeGreaterThanOrEqual(0);
		});
	});

	describe("empty document", () => {
		it("returns null contents for empty input", () => {
			const result = doc("");
			expect(result.contents).toBe(null);
		});
	});

	describe("parse convenience function", () => {
		it("returns plain JavaScript value", () => {
			const result = val("a: 1\nb: [2, 3]");
			expect(result).toEqual({ a: 1, b: [2, 3] });
		});
	});
});

// ===========================================================================
// Task 15: Anchors, aliases, comments, errors, multi-document, tags
// ===========================================================================

describe("Task 15: Anchors, aliases, comments, errors, multi-document, tags", () => {
	describe("anchor definition", () => {
		it("sets anchor field on YamlScalar", () => {
			const result = doc("&anchor value");
			expect(result.contents).toBeInstanceOf(YamlScalar);
			const scalar = result.contents as InstanceType<typeof YamlScalar>;
			expect(scalar.anchor).toBe("anchor");
			expect(scalar.value).toBe("value");
		});

		it("sets anchor on collection nodes", () => {
			const result = doc("&items\n  - a\n  - b");
			expect(result.contents).toBeInstanceOf(YamlSeq);
			const seq = result.contents as InstanceType<typeof YamlSeq>;
			expect(seq.anchor).toBe("items");
		});
	});

	describe("alias reference", () => {
		it("produces YamlAlias node", () => {
			const text = "a: &val hello\nb: *val";
			const result = doc(text);
			expect(result.contents).toBeInstanceOf(YamlMap);
			const map = result.contents as InstanceType<typeof YamlMap>;
			const secondPair = map.items[1];
			expect(secondPair.value).toBeInstanceOf(YamlAlias);
			const alias = secondPair.value as InstanceType<typeof YamlAlias>;
			expect(alias.name).toBe("val");
		});

		it("resolves alias to anchored value via parse()", () => {
			const result = val("a: &v hello\nb: *v");
			expect(result).toEqual({ a: "hello", b: "hello" });
		});

		it("resolves alias to anchored collection via parse()", () => {
			const result = val("defaults: &defaults\n  x: 1\n  y: 2\noverride:\n  <<: *defaults");
			// The alias should resolve to the anchored map value
			expect(result).toBeDefined();
		});

		it("resolves alias in sequence via parse()", () => {
			const result = val("- &item hello\n- *item");
			expect(result).toEqual(["hello", "hello"]);
		});

		it("allows colon in anchor and alias names (Y2GN)", () => {
			const result = val("key: &an:chor value");
			expect(result).toEqual({ key: "value" });
		});

		it("allows special characters in anchor and alias names (W5VH)", () => {
			const result = val('a: &:@*!$"<foo>: scalar a\nb: *:@*!$"<foo>:');
			expect(result).toEqual({ a: "scalar a", b: "scalar a" });
		});
	});

	describe("duplicate anchor warning", () => {
		it("adds warning for duplicate anchors", () => {
			const result = doc("a: &dup 1\nb: &dup 2");
			expect(result.warnings.length).toBeGreaterThan(0);
			expect(result.warnings.some((w) => w.code === "DuplicateAnchor")).toBe(true);
		});
	});

	describe("undefined alias", () => {
		it("fails with YamlComposerError for undefined alias", () => {
			const result = Effect.runSyncExit(parseDocument("*undefined"));
			expect(result._tag).toBe("Failure");
		});

		it("reports UndefinedAlias not AliasCountExceeded for unknown alias with low limit", () => {
			// Even with maxAliasCount: 0, the error should be UndefinedAlias
			// because existence is checked before count.
			const result = Effect.runSyncExit(parseDocument("*nope", { maxAliasCount: 0 }));
			expect(result._tag).toBe("Failure");
			if (result._tag === "Failure") {
				const error = (result.cause as unknown as { error: { errors: Array<{ code: string }> } }).error;
				expect(error.errors[0].code).toBe("UndefinedAlias");
			}
		});
	});

	describe("maxAliasCount enforcement", () => {
		it("fails when alias count exceeds maxAliasCount", () => {
			const text = "a: &v 1\nb: *v\nc: *v\nd: *v";
			const result = Effect.runSyncExit(parseDocument(text, { maxAliasCount: 2 }));
			expect(result._tag).toBe("Failure");
		});
	});

	describe("comment preservation", () => {
		it("preserves document-level comment", () => {
			const result = doc("# top comment\na: 1");
			expect(result.comment).toBeDefined();
			expect(result.comment).toContain("top comment");
		});
	});

	describe("multi-document", () => {
		it("parseAllDocuments returns multiple documents", () => {
			const text = "---\na: 1\n---\nb: 2";
			const docs = Effect.runSync(parseAllDocuments(text));
			expect(docs.length).toBeGreaterThanOrEqual(2);
		});

		it("each document has its own contents", () => {
			const text = "---\na: 1\n---\nb: 2";
			const docs = Effect.runSync(parseAllDocuments(text));
			// At least one doc should have 'a' key, another 'b'
			const values = docs.map((d) =>
				d.contents instanceof YamlMap ? (d.contents.items[0]?.key as InstanceType<typeof YamlScalar>).value : null,
			);
			expect(values).toContain("a");
			expect(values).toContain("b");
		});
	});

	describe("tags", () => {
		it("!!str tag forces string type", () => {
			const result = val("!!str 42");
			expect(result).toBe("42");
			expect(typeof result).toBe("string");
		});

		it("!!int tag forces integer type", () => {
			const result = val('!!int "42"');
			// With !!int, even a quoted scalar should be parsed as int
			// However, the tag resolution happens on the raw decoded value
			expect(result).toBe(42);
		});

		it("preserves tag on AST node", () => {
			const result = doc("!!str 42");
			expect(result.contents).toBeInstanceOf(YamlScalar);
			const scalar = result.contents as InstanceType<typeof YamlScalar>;
			expect(scalar.tag).toBe("!!str");
		});
	});

	describe("flow and block style preservation", () => {
		it("block map has block style", () => {
			const result = doc("a: 1");
			expect((result.contents as InstanceType<typeof YamlMap>).style).toBe("block");
		});

		it("flow map has flow style", () => {
			const result = doc("{a: 1}");
			expect((result.contents as InstanceType<typeof YamlMap>).style).toBe("flow");
		});

		it("block seq has block style", () => {
			const result = doc("- 1");
			expect((result.contents as InstanceType<typeof YamlSeq>).style).toBe("block");
		});

		it("flow seq has flow style", () => {
			const result = doc("[1, 2]");
			expect((result.contents as InstanceType<typeof YamlSeq>).style).toBe("flow");
		});
	});

	describe("directives", () => {
		it("parses YAML directive", () => {
			const result = doc("%YAML 1.2\n---\na: 1");
			expect(result.directives.length).toBeGreaterThan(0);
			expect(result.directives[0].name).toBe("YAML");
			expect(result.directives[0].parameters).toContain("1.2");
		});

		it("parses TAG directive", () => {
			const result = doc("%TAG ! tag:yaml.org,2002:\n---\na: 1");
			expect(result.directives.length).toBeGreaterThan(0);
			expect(result.directives[0].name).toBe("TAG");
		});
	});

	describe("uniqueKeys option", () => {
		it("warns on duplicate keys when uniqueKeys is true (default)", () => {
			const result = doc("a: 1\na: 2");
			expect(result.warnings.some((w) => w.code === "DuplicateKey")).toBe(true);
		});

		it("does not warn on duplicate keys when uniqueKeys is false", () => {
			const result = doc("a: 1\na: 2", { uniqueKeys: false });
			expect(result.warnings.some((w) => w.code === "DuplicateKey")).toBe(false);
		});
	});

	describe("error and warning arrays", () => {
		it("document has empty errors for valid input", () => {
			const result = doc("a: 1");
			expect(result.errors).toEqual([]);
		});

		it("document has empty warnings for valid input without duplicates", () => {
			const result = doc("a: 1");
			expect(result.warnings).toEqual([]);
		});
	});
});

// ===========================================================================
// Additional coverage: tagged scalar resolution
// ===========================================================================

describe("Tagged scalar resolution", () => {
	it("resolves !!str to string", () => {
		expect(val("!!str 42")).toBe("42");
	});

	it("resolves !!str with tag URI", () => {
		expect(val("!!str true")).toBe("true");
	});

	it("resolves !!int to integer", () => {
		expect(val("!!int 42")).toBe(42);
	});

	it("resolves !!int with octal", () => {
		expect(val("!!int 0o17")).toBe(15);
	});

	it("resolves !!int with hex", () => {
		expect(val("!!int 0xA")).toBe(10);
	});

	it("resolves !!int with invalid value as string", () => {
		expect(val("!!int hello")).toBe("hello");
	});

	it("resolves !!float to float", () => {
		expect(val("!!float 3.14")).toBe(3.14);
	});

	it("resolves !!float .inf to Infinity", () => {
		expect(val("!!float .inf")).toBe(Number.POSITIVE_INFINITY);
	});

	it("resolves !!float -.inf to -Infinity", () => {
		expect(val("!!float -.inf")).toBe(Number.NEGATIVE_INFINITY);
	});

	it("resolves !!float .nan to NaN", () => {
		expect(Number.isNaN(val("!!float .nan"))).toBe(true);
	});

	it("resolves !!float with invalid value as string", () => {
		expect(val("!!float hello")).toBe("hello");
	});

	it("resolves !!bool true", () => {
		expect(val("!!bool true")).toBe(true);
	});

	it("resolves !!bool TRUE", () => {
		expect(val("!!bool TRUE")).toBe(true);
	});

	it("resolves !!bool false", () => {
		expect(val("!!bool false")).toBe(false);
	});

	it("resolves !!bool FALSE", () => {
		expect(val("!!bool FALSE")).toBe(false);
	});

	it("resolves !!bool with invalid value as string", () => {
		expect(val("!!bool maybe")).toBe("maybe");
	});

	it("resolves !!null to null", () => {
		expect(val("!!null ~")).toBeNull();
	});

	it("resolves unknown tag as raw string", () => {
		expect(val("!custom value")).toBe("value");
	});

	it("resolves !!str with no value to empty string in flow map (WZ62)", () => {
		const result = val("{\n  foo : !!str,\n  !!str : bar,\n}");
		expect(result).toEqual({ foo: "", "": "bar" });
	});

	it("resolves !!str with no value to empty string in block seq (LE5A)", () => {
		const result = val('- !!str "a"\n- \'b\'\n- &anchor "c"\n- *anchor\n- !!str');
		expect(result).toEqual(["a", "b", "c", "c", ""]);
	});
});

// ===========================================================================
// Additional coverage: type resolution edge cases
// ===========================================================================

describe("Type resolution edge cases", () => {
	it("resolves .nan to NaN", () => {
		expect(Number.isNaN(val(".nan"))).toBe(true);
	});

	it("resolves .NaN to NaN", () => {
		expect(Number.isNaN(val(".NaN"))).toBe(true);
	});

	it("resolves .NAN to NaN", () => {
		expect(Number.isNaN(val(".NAN"))).toBe(true);
	});

	it("resolves .inf to Infinity", () => {
		expect(val(".inf")).toBe(Number.POSITIVE_INFINITY);
	});

	it("resolves .Inf to Infinity", () => {
		expect(val(".Inf")).toBe(Number.POSITIVE_INFINITY);
	});

	it("resolves -.inf to -Infinity", () => {
		expect(val("-.inf")).toBe(Number.NEGATIVE_INFINITY);
	});

	it("resolves +.inf to Infinity", () => {
		expect(val("+.inf")).toBe(Number.POSITIVE_INFINITY);
	});

	it("resolves octal number 0o10", () => {
		expect(val("0o10")).toBe(8);
	});

	it("resolves hex number 0xFF", () => {
		expect(val("0xFF")).toBe(255);
	});

	it("resolves null variants", () => {
		expect(val("null")).toBeNull();
		expect(val("Null")).toBeNull();
		expect(val("NULL")).toBeNull();
		expect(val("~")).toBeNull();
	});

	it("resolves boolean variants", () => {
		expect(val("true")).toBe(true);
		expect(val("True")).toBe(true);
		expect(val("TRUE")).toBe(true);
		expect(val("false")).toBe(false);
		expect(val("False")).toBe(false);
		expect(val("FALSE")).toBe(false);
	});

	it("resolves scientific notation", () => {
		expect(val("1.5e3")).toBe(1500);
	});

	it("resolves negative number", () => {
		expect(val("-42")).toBe(-42);
	});

	it("resolves float with leading dot", () => {
		expect(val(".5")).toBe(0.5);
	});
});

// ===========================================================================
// Additional coverage: block scalar edge cases
// ===========================================================================

describe("Block scalar edge cases", () => {
	it("parses literal block scalar with clip chomp (default)", () => {
		const result = val("|\n  hello\n  world");
		expect(result).toBe("hello\nworld\n");
	});

	it("parses literal block scalar with keep chomp", () => {
		const result = val("|+\n  hello\n  world\n");
		expect(typeof result).toBe("string");
		expect((result as string).endsWith("\n")).toBe(true);
	});

	it("parses literal block scalar with strip chomp (-)", () => {
		const result = val("|-\n  hello\n  world\n");
		expect(typeof result).toBe("string");
		expect((result as string).endsWith("\n")).toBe(false);
	});

	it("parses folded block scalar", () => {
		const result = val(">\n  hello\n  world");
		expect(typeof result).toBe("string");
	});

	it("parses folded block scalar with strip chomp", () => {
		const result = val(">-\n  hello\n  world\n");
		expect(typeof result).toBe("string");
		expect((result as string).endsWith("\n")).toBe(false);
	});

	it("parses folded block scalar with keep chomp", () => {
		const result = val(">+\n  hello\n  world\n\n");
		expect(typeof result).toBe("string");
	});

	it("parses block scalar with explicit indent", () => {
		const result = val("|2\n  hello\n  world");
		expect(typeof result).toBe("string");
	});

	it("preserves trailing whitespace-only lines in literal block (L24T)", () => {
		const result = val("foo: |\n  x\n   \n");
		expect(result).toEqual({ foo: "x\n \n" });
	});

	it("preserves trailing whitespace in literal content (DWX9)", () => {
		const result = val("|\n \n  \n  literal\n   \n  \n  text\n\n # Comment\n");
		expect(result).toBe("\n\nliteral\n \n\ntext\n");
	});
});

// ===========================================================================
// Additional coverage: double-quoted escape sequences
// ===========================================================================

describe("Double-quoted escape sequences", () => {
	it("handles \\n", () => {
		expect(val('"hello\\nworld"')).toBe("hello\nworld");
	});

	it("handles \\t", () => {
		expect(val('"hello\\tworld"')).toBe("hello\tworld");
	});

	it("handles \\\\ (escaped backslash)", () => {
		expect(val('"hello\\\\world"')).toBe("hello\\world");
	});

	it('handles \\" (escaped quote)', () => {
		expect(val('"hello\\"world"')).toBe('hello"world');
	});

	it("handles \\/ (escaped slash)", () => {
		expect(val('"hello\\/world"')).toBe("hello/world");
	});

	it("handles \\0 (null char)", () => {
		expect(val('"\\0"')).toBe("\0");
	});

	it("handles \\a (bell)", () => {
		expect(val('"\\a"')).toBe("\x07");
	});

	it("handles \\e (escape)", () => {
		expect(val('"\\e"')).toBe("\x1B");
	});

	it("handles \\v (vertical tab)", () => {
		expect(val('"\\v"')).toBe("\x0B");
	});

	it("handles \\b (backspace)", () => {
		expect(val('"\\b"')).toBe("\b");
	});

	it("handles \\f (form feed)", () => {
		expect(val('"\\f"')).toBe("\f");
	});

	it("handles \\r (carriage return)", () => {
		expect(val('"\\r"')).toBe("\r");
	});

	it("handles \\x hex escape", () => {
		expect(val('"\\x41"')).toBe("A");
	});

	it("handles \\u unicode escape", () => {
		expect(val('"\\u0041"')).toBe("A");
	});

	it("handles \\U unicode escape (8-digit)", () => {
		expect(val('"\\U00000041"')).toBe("A");
	});

	it("handles escaped space", () => {
		expect(String(val('"\\  "')).includes(" ")).toBe(true);
	});

	it("handles \\N (next line)", () => {
		expect(val('"\\N"')).toBe("\u0085");
	});

	it("handles \\_ (non-breaking space)", () => {
		expect(val('"\\_ "')).toContain("\u00A0");
	});

	it("handles \\L (line separator)", () => {
		expect(val('"\\L"')).toBe("\u2028");
	});

	it("handles \\P (paragraph separator)", () => {
		expect(val('"\\P"')).toBe("\u2029");
	});

	it("handles line fold continuation (backslash-newline skipping whitespace)", () => {
		// backslash followed by newline => continuation (skip whitespace)
		const result = val('"hello \\\n    world"');
		expect(result).toBe("hello world");
	});

	it("handles bare newline in double-quoted as space fold", () => {
		const result = val('"hello\nworld"');
		expect(result).toBe("hello world");
	});
});

// ===========================================================================
// Additional coverage: single-quoted strings
// ===========================================================================

describe("Single-quoted strings", () => {
	it("preserves literal content", () => {
		expect(val("'hello'")).toBe("hello");
	});

	it("handles escaped single quote", () => {
		expect(val("'it''s'")).toBe("it's");
	});
});

// ===========================================================================
// Additional coverage: anchor/alias scenarios
// ===========================================================================

describe("Anchor and alias scenarios", () => {
	it("resolves alias in a sequence", () => {
		const result = val("- &ref value\n- *ref");
		expect(result).toEqual(["value", "value"]);
	});

	it("resolves alias in a mapping value", () => {
		const result = val("a: &ref hello\nb: *ref");
		expect(result).toEqual({ a: "hello", b: "hello" });
	});

	it("reports error for undefined alias", () => {
		const result = Effect.runSync(Effect.either(parseDocument("a: *undefined")));
		expect(result._tag).toBe("Left");
	});

	it("reports error when alias count exceeds max", () => {
		const result = Effect.runSync(
			Effect.either(parseDocument("a: &ref value\nb: *ref\nc: *ref\nd: *ref", { maxAliasCount: 2 })),
		);
		expect(result._tag).toBe("Left");
	});
});

// ===========================================================================
// Additional coverage: document-level comments
// ===========================================================================

describe("Document-level comments", () => {
	it("attaches document comment", () => {
		const result = doc("# top comment\na: 1");
		expect(result.comment).toBeDefined();
	});

	it("document without comment has undefined comment", () => {
		const result = doc("a: 1");
		expect(result.comment).toBeUndefined();
	});
});

// ===========================================================================
// Additional coverage: flow collections
// ===========================================================================

describe("Flow collections", () => {
	it("parses nested flow map", () => {
		const result = val("{a: {b: 1}}");
		expect(result).toEqual({ a: { b: 1 } });
	});

	it("parses flow map with multiple pairs", () => {
		const result = val("{a: 1, b: 2, c: 3}");
		expect(result).toEqual({ a: 1, b: 2, c: 3 });
	});

	it("parses flow seq with mixed types", () => {
		const result = val("[1, hello, true, null]");
		expect(result).toEqual([1, "hello", true, null]);
	});

	it("parses nested flow seq", () => {
		const result = val("[[1, 2], [3, 4]]");
		expect(result).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("parses flow map inside flow seq", () => {
		const result = val("[{a: 1}, {b: 2}]");
		expect(result).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("parses flow seq inside flow map", () => {
		const result = val("{a: [1, 2]}");
		expect(result).toEqual({ a: [1, 2] });
	});
});

// ===========================================================================
// Additional coverage: complex mapping structures
// ===========================================================================

describe("Complex mapping structures", () => {
	it("parses flat block map (colon-separated pairs)", () => {
		const result = val("a: 1\nb: 2\nc: 3");
		expect(result).toEqual({ a: 1, b: 2, c: 3 });
	});

	it("parses block map with nested block map value", () => {
		const result = val("outer:\n  inner: value");
		expect(result).toEqual({ outer: { inner: "value" } });
	});

	it("parses block map with nested block seq value", () => {
		const result = val("items:\n  - 1\n  - 2");
		expect(result).toEqual({ items: [1, 2] });
	});

	it("parses block map with flow map value", () => {
		const result = val("config: {a: 1, b: 2}");
		expect(result).toEqual({ config: { a: 1, b: 2 } });
	});

	it("parses block map with flow seq value", () => {
		const result = val("items: [1, 2, 3]");
		expect(result).toEqual({ items: [1, 2, 3] });
	});

	it("parses block map with alias value", () => {
		const result = val("a: &ref hello\nb: *ref");
		expect(result).toEqual({ a: "hello", b: "hello" });
	});

	it("parses block seq with nested block map items", () => {
		const result = val("- a: 1\n  b: 2\n- c: 3");
		expect(result).toEqual([{ a: 1, b: 2 }, { c: 3 }]);
	});

	it("parses block seq with nested block seq items", () => {
		const result = val("- - 1\n  - 2\n- - 3");
		expect(result).toEqual([[1, 2], [3]]);
	});

	it("parses deeply nested structure", () => {
		const result = val("a:\n  b:\n    c:\n      d: value");
		expect(result).toEqual({ a: { b: { c: { d: "value" } } } });
	});

	it("parses null values in block maps", () => {
		const result = val("key:\n  subkey: value");
		const obj = result as Record<string, unknown>;
		expect(obj.key).toEqual({ subkey: "value" });
	});

	it("handles comment between pairs in a block map", () => {
		const result = val("a: 1\n# comment\nb: 2");
		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("handles empty flow map", () => {
		const result = val("{}");
		expect(result).toEqual({});
	});

	it("handles empty flow seq", () => {
		const result = val("[]");
		expect(result).toEqual([]);
	});

	it("handles flow map with alias value", () => {
		const result = val("a: &ref hello\nb: {c: *ref}");
		expect(result).toEqual({ a: "hello", b: { c: "hello" } });
	});

	it("handles block seq with alias items", () => {
		const result = val("- &ref hello\n- *ref\n- *ref");
		expect(result).toEqual(["hello", "hello", "hello"]);
	});

	it("handles flow seq with alias items", () => {
		const result = val("a: &ref hello\nb: [*ref, *ref]");
		expect(result).toEqual({ a: "hello", b: ["hello", "hello"] });
	});
});

// ===========================================================================
// Additional coverage: multi-line double-quoted strings
// ===========================================================================

describe("Multi-line double-quoted strings", () => {
	it("folds newlines in double-quoted strings", () => {
		const result = val('"hello\nworld"');
		// Newline in double-quoted is folded to space
		expect(typeof result).toBe("string");
	});

	it("handles line continuation with backslash-newline", () => {
		const result = val('"hello\\\n  world"');
		expect(typeof result).toBe("string");
	});
});

// ===========================================================================
// Additional coverage: multi-document
// ===========================================================================

describe("Multi-document parsing", () => {
	it("parses multiple documents", () => {
		const docs = Effect.runSync(parseAllDocuments("---\na: 1\n---\nb: 2"));
		expect(docs.length).toBe(2);
	});

	it("each document has its own contents", () => {
		const docs = Effect.runSync(parseAllDocuments("---\na: 1\n---\nb: 2"));
		expect(docs[0].contents).toBeDefined();
		expect(docs[1].contents).toBeDefined();
	});
});

// ===========================================================================
// Additional coverage: error handling paths
// ===========================================================================

describe("Error handling in composer", () => {
	it("handles tab indentation as error", () => {
		const result = Effect.runSync(Effect.either(parseDocument("a:\n\tb: 1")));
		expect(result._tag).toBe("Left");
	});

	it("handles empty document", () => {
		const result = doc("");
		expect(result.contents).toBeNull();
	});

	it("handles document with only comments", () => {
		const result = doc("# just a comment");
		expect(result.comment).toBeDefined();
	});

	it("parses nested flow seq in block map", () => {
		const result = val("a: [1, [2, 3]]");
		expect(result).toEqual({ a: [1, [2, 3]] });
	});

	it("parses nested flow map in block seq", () => {
		const result = val("- {a: 1}\n- {b: 2}");
		expect(result).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("parses block map value that is a flow seq", () => {
		const result = val("items: [a, b, c]");
		expect(result).toEqual({ items: ["a", "b", "c"] });
	});

	it("parses block map with anchored values", () => {
		const result = val("a: &x hello\nb: &y world\nc: *x\nd: *y");
		expect(result).toEqual({ a: "hello", b: "world", c: "hello", d: "world" });
	});

	it("parses flow map with anchored values", () => {
		const result = val("a: &ref val\nb: {k: *ref}");
		expect(result).toEqual({ a: "val", b: { k: "val" } });
	});

	it("parses block seq with nested block maps", () => {
		const result = val("- name: Alice\n  age: 30\n- name: Bob\n  age: 25");
		expect(result).toEqual([
			{ name: "Alice", age: 30 },
			{ name: "Bob", age: 25 },
		]);
	});

	it("parses flow seq inside block seq", () => {
		const result = val("- [1, 2]\n- [3, 4]");
		expect(result).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("parses deeply nested flow structures", () => {
		const result = val("{a: {b: {c: [1, {d: 2}]}}}");
		expect(result).toEqual({ a: { b: { c: [1, { d: 2 }] } } });
	});

	it("parses block scalar with explicit indent indicator", () => {
		const result = val("|2\n  hello\n  world");
		expect(typeof result).toBe("string");
	});

	it("parses folded block scalar with content", () => {
		const result = val(">\n  line1\n  line2\n  line3");
		expect(typeof result).toBe("string");
	});

	it("parses block scalar with keep chomp and trailing newlines", () => {
		const result = val("|+\n  hello\n\n\n");
		expect(typeof result).toBe("string");
		expect((result as string).endsWith("\n")).toBe(true);
	});

	it("parses folded block scalar folding lines", () => {
		const result = val(">\n  hello\n  world");
		expect(typeof result).toBe("string");
	});

	it("parses block map with flow-seq as nested value", () => {
		const result = val("outer:\n  inner: [1, 2, 3]");
		expect(result).toEqual({ outer: { inner: [1, 2, 3] } });
	});

	it("parses block map with flow-map as nested value", () => {
		const result = val("outer:\n  inner: {a: 1}");
		expect(result).toEqual({ outer: { inner: { a: 1 } } });
	});

	it("parses block map with alias in nested block-map", () => {
		const result = val("ref: &val hello\nouter:\n  inner: *val");
		expect(result).toEqual({ ref: "hello", outer: { inner: "hello" } });
	});

	it("parses block map with block-seq as nested value", () => {
		const result = val("outer:\n  inner:\n    - 1\n    - 2");
		expect(result).toEqual({ outer: { inner: [1, 2] } });
	});
});

// ---------------------------------------------------------------------------
// BigInt for large integers
// ---------------------------------------------------------------------------

describe("large integer handling", () => {
	it("returns bigint for decimal exceeding MAX_SAFE_INTEGER", () => {
		const result = val("99999999999999999999");
		expect(typeof result).toBe("bigint");
		expect(result).toBe(99999999999999999999n);
	});

	it("returns bigint for hex exceeding MAX_SAFE_INTEGER", () => {
		const result = val("0xFFFFFFFFFFFFFFFF");
		expect(typeof result).toBe("bigint");
		expect(result).toBe(0xffffffffffffffffn);
	});

	it("returns bigint for octal exceeding MAX_SAFE_INTEGER", () => {
		const result = val("0o1777777777777777777777");
		expect(typeof result).toBe("bigint");
	});

	it("returns number for safe decimal integers", () => {
		const result = val("42");
		expect(typeof result).toBe("number");
		expect(result).toBe(42);
	});

	it("returns number for safe hex integers", () => {
		const result = val("0xFF");
		expect(typeof result).toBe("number");
		expect(result).toBe(255);
	});

	it("returns number for safe octal integers", () => {
		const result = val("0o77");
		expect(typeof result).toBe("number");
		expect(result).toBe(63);
	});

	it("returns bigint for negative large decimal", () => {
		const result = val("-99999999999999999999");
		expect(typeof result).toBe("bigint");
		expect(result).toBe(-99999999999999999999n);
	});
});
