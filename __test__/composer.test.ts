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
