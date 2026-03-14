/**
 * Tests for the YAML 1.2 lexer.
 *
 * @packageDocumentation
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { YamlTokenKind } from "../src/schemas/YamlToken.js";
import { lexAll } from "../src/utils/lexer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenize(text: string) {
	return Effect.runSync(lexAll(text));
}

/** Extract only token kinds (filtering whitespace/newline for easier assertions). */
function kinds(text: string, filter = true): YamlTokenKind[] {
	const tokens = tokenize(text);
	if (filter) {
		return tokens.filter((t) => t.kind !== "whitespace" && t.kind !== "newline").map((t) => t.kind);
	}
	return tokens.map((t) => t.kind);
}

/** Extract kind+value pairs, filtering whitespace/newline. */
function kindValues(text: string): Array<[YamlTokenKind, string]> {
	const tokens = tokenize(text);
	return tokens.filter((t) => t.kind !== "whitespace" && t.kind !== "newline").map((t) => [t.kind, t.value]);
}

// ===========================================================================
// Task 8: Plain scalars and basic structure
// ===========================================================================

describe("Task 8: Plain scalars and basic structure", () => {
	describe("plain scalars", () => {
		it("tokenizes a single plain scalar", () => {
			const result = kindValues("hello");
			expect(result).toEqual([["scalar", "hello"]]);
		});

		it("tokenizes a plain scalar with spaces", () => {
			const result = kindValues("hello world");
			expect(result).toEqual([["scalar", "hello world"]]);
		});

		it("tokenizes a numeric plain scalar", () => {
			const result = kindValues("42");
			expect(result).toEqual([["scalar", "42"]]);
		});

		it("tokenizes boolean-like plain scalars", () => {
			expect(kindValues("true")).toEqual([["scalar", "true"]]);
			expect(kindValues("false")).toEqual([["scalar", "false"]]);
		});

		it("tokenizes null-like plain scalar", () => {
			expect(kindValues("null")).toEqual([["scalar", "null"]]);
		});
	});

	describe("key-value pairs", () => {
		it("tokenizes a simple key: value", () => {
			const result = kindValues("key: value");
			expect(result).toEqual([
				["scalar", "key"],
				["block-map-start", ""],
				["block-map-value", ":"],
				["scalar", "value"],
			]);
		});

		it("tokenizes key with no value", () => {
			const result = kindValues("key:");
			expect(result).toEqual([
				["scalar", "key"],
				["block-map-start", ""],
				["block-map-value", ":"],
			]);
		});

		it("tokenizes key: value with extra spaces", () => {
			const result = kindValues("key:  value");
			expect(result).toEqual([
				["scalar", "key"],
				["block-map-start", ""],
				["block-map-value", ":"],
				["scalar", "value"],
			]);
		});
	});

	describe("block mapping", () => {
		it("tokenizes a multi-line block mapping", () => {
			const result = kinds("a: 1\nb: 2");
			expect(result).toEqual([
				"scalar",
				"block-map-start",
				"block-map-value",
				"scalar",
				"scalar",
				"block-map-value",
				"scalar",
			]);
		});

		it("preserves scalar values in block mapping", () => {
			const result = kindValues("name: Alice\nage: 30");
			expect(result).toEqual([
				["scalar", "name"],
				["block-map-start", ""],
				["block-map-value", ":"],
				["scalar", "Alice"],
				["scalar", "age"],
				["block-map-value", ":"],
				["scalar", "30"],
			]);
		});

		it("emits block-map-start only once per indent level", () => {
			const result = kinds("a: 1\nb: 2\nc: 3");
			// block-map-start should appear only once (at the first colon)
			const mapStarts = result.filter((k) => k === "block-map-start");
			expect(mapStarts).toHaveLength(1);
		});
	});

	describe("block sequence", () => {
		it("tokenizes a block sequence", () => {
			const result = kinds("- a\n- b");
			expect(result).toEqual(["block-seq-start", "block-seq-entry", "scalar", "block-seq-entry", "scalar"]);
		});

		it("tokenizes a block sequence with three items", () => {
			const result = kinds("- x\n- y\n- z");
			expect(result).toEqual([
				"block-seq-start",
				"block-seq-entry",
				"scalar",
				"block-seq-entry",
				"scalar",
				"block-seq-entry",
				"scalar",
			]);
		});
	});

	describe("comments", () => {
		it("tokenizes an inline comment after a value", () => {
			const result = kindValues("key: value # comment");
			expect(result).toEqual([
				["scalar", "key"],
				["block-map-start", ""],
				["block-map-value", ":"],
				["scalar", "value"],
				["comment", "# comment"],
			]);
		});

		it("tokenizes a full-line comment", () => {
			const result = kindValues("# this is a comment");
			expect(result).toEqual([["comment", "# this is a comment"]]);
		});

		it("tokenizes comment after sequence entry", () => {
			const result = kinds("- item # note");
			expect(result).toEqual(["block-seq-start", "block-seq-entry", "scalar", "comment"]);
		});
	});

	describe("document markers", () => {
		it("tokenizes document start ---", () => {
			const result = kinds("---\nfoo");
			expect(result).toEqual(["document-start", "scalar"]);
		});

		it("tokenizes document end ...", () => {
			const result = kinds("foo\n...");
			expect(result).toEqual(["scalar", "document-end"]);
		});

		it("tokenizes --- followed by content on same line", () => {
			const result = kindValues("--- foo");
			expect(result).toEqual([
				["document-start", "---"],
				["scalar", "foo"],
			]);
		});

		it("does not treat --- in the middle of a line as document start", () => {
			const result = kindValues("a: ---");
			expect(result).toEqual([
				["scalar", "a"],
				["block-map-start", ""],
				["block-map-value", ":"],
				["scalar", "---"],
			]);
		});
	});

	describe("newlines and whitespace", () => {
		it("tracks newline tokens", () => {
			const tokens = tokenize("a\nb");
			const newlines = tokens.filter((t) => t.kind === "newline");
			expect(newlines).toHaveLength(1);
			expect(newlines[0]?.value).toBe("\n");
		});

		it("tracks whitespace tokens", () => {
			const tokens = tokenize("a: b");
			const ws = tokens.filter((t) => t.kind === "whitespace");
			expect(ws.length).toBeGreaterThan(0);
		});

		it("handles CRLF newlines", () => {
			const tokens = tokenize("a\r\nb");
			const newlines = tokens.filter((t) => t.kind === "newline");
			expect(newlines).toHaveLength(1);
			expect(newlines[0]?.value).toBe("\r\n");
		});
	});

	describe("position tracking", () => {
		it("tracks offset, line, and column for first token", () => {
			const tokens = tokenize("hello");
			expect(tokens[0]?.offset).toBe(0);
			expect(tokens[0]?.line).toBe(0);
			expect(tokens[0]?.column).toBe(0);
		});

		it("tracks position across newlines", () => {
			const tokens = tokenize("a\nb");
			const bToken = tokens.find((t) => t.kind === "scalar" && t.value === "b");
			expect(bToken?.line).toBe(1);
			expect(bToken?.column).toBe(0);
		});

		it("tracks column within a line", () => {
			const tokens = tokenize("key: val");
			const valToken = tokens.find((t) => t.kind === "scalar" && t.value === "val");
			expect(valToken).toBeDefined();
			expect(valToken?.column).toBe(5);
		});
	});

	describe("empty input", () => {
		it("returns no tokens for empty string", () => {
			expect(tokenize("")).toHaveLength(0);
		});

		it("returns only whitespace/newline for blank lines", () => {
			const result = kinds("\n\n");
			expect(result).toEqual([]);
		});
	});
});

// ===========================================================================
// Task 9: Quoted scalars and escape sequences
// ===========================================================================

describe("Task 9: Quoted scalars and escape sequences", () => {
	describe("single-quoted scalars", () => {
		it("tokenizes a simple single-quoted scalar", () => {
			const result = kindValues("'hello'");
			expect(result).toEqual([["scalar", "hello"]]);
		});

		it("handles escaped single quote (doubled)", () => {
			const result = kindValues("'it''s'");
			expect(result).toEqual([["scalar", "it's"]]);
		});

		it("handles empty single-quoted scalar", () => {
			const result = kindValues("''");
			expect(result).toEqual([["scalar", ""]]);
		});

		it("emits error for unterminated single-quoted scalar", () => {
			const result = kinds("'unterminated");
			expect(result).toContain("error");
		});
	});

	describe("double-quoted scalars", () => {
		it("tokenizes a simple double-quoted scalar", () => {
			const result = kindValues('"hello"');
			expect(result).toEqual([["scalar", "hello"]]);
		});

		it("handles empty double-quoted scalar", () => {
			const result = kindValues('""');
			expect(result).toEqual([["scalar", ""]]);
		});

		it("emits error for unterminated double-quoted scalar", () => {
			const result = kinds('"unterminated');
			expect(result).toContain("error");
		});
	});

	describe("escape sequences", () => {
		it("handles \\n (newline)", () => {
			const result = kindValues('"line\\nbreak"');
			expect(result).toEqual([["scalar", "line\nbreak"]]);
		});

		it("handles \\\\ (backslash)", () => {
			const result = kindValues('"back\\\\slash"');
			expect(result).toEqual([["scalar", "back\\slash"]]);
		});

		it("handles \\t (tab)", () => {
			const result = kindValues('"tab\\there"');
			expect(result).toEqual([["scalar", "tab\there"]]);
		});

		it("handles \\r (carriage return)", () => {
			const result = kindValues('"cr\\rhere"');
			expect(result).toEqual([["scalar", "cr\rhere"]]);
		});

		it('handles \\" (double quote)', () => {
			const result = kindValues('"say \\"hi\\""');
			expect(result).toEqual([["scalar", 'say "hi"']]);
		});

		it("handles \\/ (slash)", () => {
			const result = kindValues('"a\\/b"');
			expect(result).toEqual([["scalar", "a/b"]]);
		});

		it("handles \\b (backspace)", () => {
			const result = kindValues('"a\\bb"');
			expect(result).toEqual([["scalar", "a\bb"]]);
		});

		it("handles \\f (form feed)", () => {
			const result = kindValues('"a\\fb"');
			expect(result).toEqual([["scalar", "a\fb"]]);
		});

		it("handles \\0 (null)", () => {
			const result = kindValues('"a\\0b"');
			expect(result).toEqual([["scalar", "a\0b"]]);
		});

		it("handles \\a (bell)", () => {
			const result = kindValues('"a\\ab"');
			expect(result).toEqual([["scalar", "a\x07b"]]);
		});

		it("handles \\e (escape)", () => {
			const result = kindValues('"a\\eb"');
			expect(result).toEqual([["scalar", "a\x1Bb"]]);
		});

		it("handles \\v (vertical tab)", () => {
			const result = kindValues('"a\\vb"');
			expect(result).toEqual([["scalar", "a\x0Bb"]]);
		});

		it("handles \\N (next line)", () => {
			const result = kindValues('"a\\Nb"');
			expect(result).toEqual([["scalar", "a\u0085b"]]);
		});

		it("handles \\_ (non-breaking space)", () => {
			const result = kindValues('"a\\_b"');
			expect(result).toEqual([["scalar", "a\u00A0b"]]);
		});

		it("handles \\L (line separator)", () => {
			const result = kindValues('"a\\Lb"');
			expect(result).toEqual([["scalar", "a\u2028b"]]);
		});

		it("handles \\P (paragraph separator)", () => {
			const result = kindValues('"a\\Pb"');
			expect(result).toEqual([["scalar", "a\u2029b"]]);
		});
	});

	describe("unicode escapes", () => {
		it("handles \\xNN (2-digit hex)", () => {
			const result = kindValues('"\\x41"');
			expect(result).toEqual([["scalar", "A"]]);
		});

		it("handles \\uNNNN (4-digit hex)", () => {
			const result = kindValues('"\\u0041"');
			expect(result).toEqual([["scalar", "A"]]);
		});

		it("handles \\UNNNNNNNN (8-digit hex)", () => {
			const result = kindValues('"\\U00000041"');
			expect(result).toEqual([["scalar", "A"]]);
		});

		it("handles \\u with emoji code point", () => {
			const result = kindValues('"\\u00e9"');
			expect(result).toEqual([["scalar", "\u00e9"]]);
		});

		it("emits error for invalid \\x escape", () => {
			const result = kinds('"\\xGG"');
			expect(result).toContain("error");
		});

		it("emits error for invalid \\u escape", () => {
			const result = kinds('"\\uZZZZ"');
			expect(result).toContain("error");
		});

		it("emits error for invalid \\U escape", () => {
			const result = kinds('"\\UZZZZZZZZ"');
			expect(result).toContain("error");
		});

		it("emits error for invalid escape character", () => {
			const result = kinds('"\\q"');
			expect(result).toContain("error");
		});
	});

	describe("multi-line quoted scalars", () => {
		it("folds newlines in single-quoted scalar", () => {
			const result = kindValues("'line1\nline2'");
			expect(result).toEqual([["scalar", "line1 line2"]]);
		});

		it("folds newlines in double-quoted scalar", () => {
			const result = kindValues('"line1\nline2"');
			expect(result).toEqual([["scalar", "line1 line2"]]);
		});

		it("handles line continuation in double-quoted scalar", () => {
			const result = kindValues('"line1\\\nline2"');
			expect(result).toEqual([["scalar", "line1line2"]]);
		});
	});

	describe("length field (source span)", () => {
		it("uses source span length for single-quoted scalars", () => {
			// 'hello' is 7 source chars, decoded value is 5
			const tokens = tokenize("'hello'");
			const scalar = tokens.find((t) => t.kind === "scalar");
			expect(scalar?.value).toBe("hello");
			expect(scalar?.length).toBe(7); // includes quotes
		});

		it("uses source span length for double-quoted scalars with escapes", () => {
			// "a\nb" is 6 source chars, decoded value is 3
			const tokens = tokenize('"a\\nb"');
			const scalar = tokens.find((t) => t.kind === "scalar");
			expect(scalar?.value).toBe("a\nb");
			expect(scalar?.length).toBe(6); // includes quotes and escape
		});

		it("uses source span length for unicode escapes", () => {
			// "\u0041" is 8 source chars, decoded value is 1
			const tokens = tokenize('"\\u0041"');
			const scalar = tokens.find((t) => t.kind === "scalar");
			expect(scalar?.value).toBe("A");
			expect(scalar?.length).toBe(8);
		});

		it("uses value length for plain scalars (no difference)", () => {
			const tokens = tokenize("hello");
			const scalar = tokens.find((t) => t.kind === "scalar");
			expect(scalar?.value).toBe("hello");
			expect(scalar?.length).toBe(5);
		});
	});
});

// ===========================================================================
// Task 10: Block scalars (literal and folded)
// ===========================================================================

describe("Task 10: Block scalars", () => {
	describe("literal block scalar (|)", () => {
		it("tokenizes a literal block scalar", () => {
			const result = kindValues("|\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello\nworld\n"]]);
		});

		it("preserves newlines in literal block", () => {
			const result = kindValues("|\n  line1\n  line2\n  line3");
			expect(result).toEqual([["scalar", "line1\nline2\nline3\n"]]);
		});

		it("handles extra indentation in literal block", () => {
			const result = kindValues("|\n  base\n    indented");
			expect(result).toEqual([["scalar", "base\n  indented\n"]]);
		});
	});

	describe("folded block scalar (>)", () => {
		it("folds line breaks to spaces between non-empty lines", () => {
			const result = kindValues(">\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello world\n"]]);
		});

		it("folds multiple consecutive non-empty lines", () => {
			const result = kindValues(">\n  a\n  b\n  c");
			expect(result).toEqual([["scalar", "a b c\n"]]);
		});

		it("preserves blank lines as paragraph breaks", () => {
			const result = kindValues(">\n  para1\n\n  para2");
			expect(result).toEqual([["scalar", "para1\npara2\n"]]);
		});
	});

	describe("chomping indicators", () => {
		it("strips trailing newline with |-", () => {
			const result = kindValues("|-\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello\nworld"]]);
		});

		it("keeps trailing newlines with |+", () => {
			const result = kindValues("|+\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello\nworld\n"]]);
		});

		it("clips trailing newline by default (|)", () => {
			const result = kindValues("|\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello\nworld\n"]]);
		});

		it("strips trailing newline with >-", () => {
			const result = kindValues(">-\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello world"]]);
		});

		it("clips trailing newline with > (default)", () => {
			const result = kindValues(">\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello world\n"]]);
		});
	});

	describe("explicit indentation indicator", () => {
		it("handles explicit indent with |2", () => {
			const result = kindValues("|2\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello\nworld\n"]]);
		});

		it("handles combined indicator |2-", () => {
			const result = kindValues("|2-\n  hello\n  world");
			expect(result).toEqual([["scalar", "hello\nworld"]]);
		});
	});

	describe("block scalar with blank lines", () => {
		it("preserves blank lines in literal block", () => {
			const result = kindValues("|\n  line1\n\n  line2");
			expect(result).toEqual([["scalar", "line1\n\nline2\n"]]);
		});

		it("preserves trailing whitespace-only lines in literal block (L24T)", () => {
			const result = kindValues("|\n  x\n   \n");
			expect(result).toEqual([["scalar", "x\n \n"]]);
		});
	});

	describe("empty block scalar", () => {
		it("handles empty literal block", () => {
			const result = kindValues("|\n");
			expect(result).toEqual([["scalar", ""]]);
		});
	});

	describe("block scalar length field", () => {
		it("uses source span for block scalar length", () => {
			// "|\n  hello\n  world" is 17 chars total
			const input = "|\n  hello\n  world";
			const tokens = tokenize(input);
			const scalar = tokens.find((t) => t.kind === "scalar");
			expect(scalar?.value).toBe("hello\nworld\n");
			expect(scalar?.length).toBe(input.length);
		});
	});
});

// ===========================================================================
// Task 11: Flow collections, anchors, aliases, tags, directives
// ===========================================================================

describe("Task 11: Flow collections, anchors, aliases, tags, directives", () => {
	describe("flow mapping", () => {
		it("tokenizes a flow mapping", () => {
			const result = kinds("{a: 1, b: 2}");
			expect(result).toEqual([
				"flow-map-start",
				"scalar",
				"block-map-value",
				"scalar",
				"flow-separator",
				"scalar",
				"block-map-value",
				"scalar",
				"flow-map-end",
			]);
		});

		it("tokenizes empty flow mapping", () => {
			const result = kinds("{}");
			expect(result).toEqual(["flow-map-start", "flow-map-end"]);
		});
	});

	describe("flow sequence", () => {
		it("tokenizes a flow sequence", () => {
			const result = kinds("[1, 2, 3]");
			expect(result).toEqual([
				"flow-seq-start",
				"scalar",
				"flow-separator",
				"scalar",
				"flow-separator",
				"scalar",
				"flow-seq-end",
			]);
		});

		it("tokenizes empty flow sequence", () => {
			const result = kinds("[]");
			expect(result).toEqual(["flow-seq-start", "flow-seq-end"]);
		});
	});

	describe("nested flow collections", () => {
		it("tokenizes nested flow mapping in sequence", () => {
			const result = kinds("[{a: 1}]");
			expect(result).toEqual([
				"flow-seq-start",
				"flow-map-start",
				"scalar",
				"block-map-value",
				"scalar",
				"flow-map-end",
				"flow-seq-end",
			]);
		});

		it("tokenizes nested flow sequence in mapping", () => {
			const result = kinds("{a: [1, 2]}");
			expect(result).toEqual([
				"flow-map-start",
				"scalar",
				"block-map-value",
				"flow-seq-start",
				"scalar",
				"flow-separator",
				"scalar",
				"flow-seq-end",
				"flow-map-end",
			]);
		});
	});

	describe("anchors", () => {
		it("tokenizes an anchor", () => {
			const result = kindValues("&name value");
			expect(result).toEqual([
				["anchor", "name"],
				["scalar", "value"],
			]);
		});

		it("emits error for empty anchor", () => {
			const result = kinds("& ");
			expect(result).toContain("error");
		});
	});

	describe("aliases", () => {
		it("tokenizes an alias", () => {
			const result = kindValues("*name");
			expect(result).toEqual([["alias", "name"]]);
		});

		it("emits error for empty alias", () => {
			const result = kinds("* ");
			expect(result).toContain("error");
		});
	});

	describe("tags", () => {
		it("tokenizes primary tag handle !!str", () => {
			const result = kindValues("!!str value");
			expect(result).toEqual([
				["tag", "!!str"],
				["scalar", "value"],
			]);
		});

		it("tokenizes single-bang tag !foo", () => {
			const result = kindValues("!foo value");
			expect(result).toEqual([
				["tag", "!foo"],
				["scalar", "value"],
			]);
		});

		it("tokenizes verbatim tag !<tag:yaml.org,2002:str>", () => {
			const result = kindValues("!<tag:yaml.org,2002:str> value");
			expect(result).toEqual([
				["tag", "!<tag:yaml.org,2002:str>"],
				["scalar", "value"],
			]);
		});
	});

	describe("directives", () => {
		it("tokenizes %YAML directive", () => {
			const result = kindValues("%YAML 1.2");
			expect(result).toEqual([["directive", "%YAML 1.2"]]);
		});

		it("tokenizes %TAG directive", () => {
			const result = kindValues("%TAG !e! tag:example.com,2000:");
			expect(result).toEqual([["directive", "%TAG !e! tag:example.com,2000:"]]);
		});
	});

	describe("explicit block map key", () => {
		it("tokenizes explicit key indicator ?", () => {
			const result = kinds("? key");
			expect(result).toEqual(["block-map-start", "block-map-key", "scalar"]);
		});
	});

	describe("flow context colon handling", () => {
		it("allows colon followed by space in flow context", () => {
			const result = kinds("{a: 1}");
			expect(result).toEqual(["flow-map-start", "scalar", "block-map-value", "scalar", "flow-map-end"]);
		});

		it("allows colon before flow indicator in flow context", () => {
			// {a:} — colon is followed by }, which is a flow indicator
			const result = kinds("{a:}");
			expect(result).toEqual(["flow-map-start", "scalar", "block-map-value", "flow-map-end"]);
		});
	});

	describe("byte order mark", () => {
		it("tokenizes BOM at start of document", () => {
			const result = kinds("\uFEFFhello");
			expect(result).toEqual(["byte-order-mark", "scalar"]);
		});
	});
});

// ===========================================================================
// Issue 4: Error channel type safety
// ===========================================================================

describe("Error channel type", () => {
	it("lex returns Stream<YamlToken, never> (no error channel)", () => {
		// This test verifies the error channel is `never` by running
		// lexAll synchronously without needing error handling
		const result = Effect.runSync(lexAll("hello: world"));
		expect(result.length).toBeGreaterThan(0);
	});

	it("lexer errors are embedded as error tokens in success channel", () => {
		const tokens = tokenize('"unterminated');
		const errorTokens = tokens.filter((t) => t.kind === "error");
		expect(errorTokens.length).toBeGreaterThan(0);
	});
});

// ===========================================================================
// Tab handling (issue #7)
// ===========================================================================

describe("Tab handling (issue #7)", () => {
	describe("Change 2: tab-only blank/separator lines", () => {
		it("emits whitespace for tab-only blank line between mappings (DK95/04)", () => {
			// foo: 1\n<TAB>\nbar: 2
			const yaml = "foo: 1\n\t\nbar: 2";
			const tokens = tokenize(yaml);
			const hasError = tokens.some((t) => t.kind === "error");
			expect(hasError).toBe(false);
		});

		it("emits whitespace for tab-only blank line before document marker (DK95/07)", () => {
			// %YAML 1.2\n<TAB>\n---
			const yaml = "%YAML 1.2\n\t\n---\n";
			const tokens = tokenize(yaml);
			const hasError = tokens.some((t) => t.kind === "error");
			expect(hasError).toBe(false);
		});
	});

	describe("Change 3: tab before flow-opening indicators", () => {
		it("emits whitespace for tab before [ at start of line (6CA3)", () => {
			// <TAB>[\n<TAB>]
			const yaml = "\t[\n\t]";
			const tokens = tokenize(yaml);
			// The tab before [ should be whitespace, not error
			// The tab before ] should also be ok (lineIndentLocked after [)
			const errors = tokens.filter((t) => t.kind === "error");
			expect(errors).toHaveLength(0);
		});

		it("emits whitespace for tab before { at start of line (Q5MG)", () => {
			// <TAB>{}
			const yaml = "\t{}";
			const tokens = tokenize(yaml);
			const errors = tokens.filter((t) => t.kind === "error");
			expect(errors).toHaveLength(0);
		});

		it("still errors on tab before non-flow content (Y79Y/003 protection)", () => {
			// Tab before plain scalar — not a flow opener
			const yaml = "a: 1\n\tb: 2";
			const tokens = tokenize(yaml);
			const hasError = tokens.some((t) => t.kind === "error");
			expect(hasError).toBe(true);
		});
	});

	describe("Change 5a: mixed tab+space indentation", () => {
		it("errors on space-then-tab indentation in block context (DK95/06)", () => {
			// foo:\n  a: 1\n  <TAB>b: 2
			const yaml = "foo:\n  a: 1\n  \tb: 2";
			const tokens = tokenize(yaml);
			const hasError = tokens.some((t) => t.kind === "error");
			expect(hasError).toBe(true);
		});

		it("allows space-then-tab after indentation is locked", () => {
			// After indentation is locked, tabs in whitespace are content
			const yaml = "a:  \tb";
			const tokens = tokenize(yaml);
			const hasError = tokens.some((t) => t.kind === "error");
			expect(hasError).toBe(false);
		});
	});

	describe("Change 1: backslash-tab escape in double-quoted scalars", () => {
		it("decodes backslash followed by literal tab as tab character", () => {
			// The backslash-escape uses a literal 0x09 byte, not the letter 't'
			const yaml = '"hello\\\tbig"';
			const tokens = tokenize(yaml);
			const scalar = tokens.find((t) => t.kind === "scalar");
			expect(scalar?.value).toBe("hello\tbig");
		});

		it("does not error on backslash-tab in double-quoted scalar (3RLN/01)", () => {
			// "2 leading\n    \<TAB>tab"
			const yaml = '"2 leading\n    \\\ttab"';
			const tokens = tokenize(yaml);
			const hasError = tokens.some((t) => t.kind === "error");
			expect(hasError).toBe(false);
		});
	});
});
