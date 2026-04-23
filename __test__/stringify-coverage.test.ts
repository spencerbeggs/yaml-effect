/**
 * Tests for stringify coverage gaps — explicit key syntax, tag normalization,
 * document-start handling, and edge cases.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { parseDocument, stringify, stringifyDocument } from "../src/index.js";
import { YamlAlias, YamlMap, YamlPair, YamlScalar, YamlSeq } from "../src/schemas/YamlAstNodes.js";
import { YamlDocument } from "../src/schemas/YamlDocument.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(value: unknown, options?: Record<string, unknown>): string {
	return Effect.runSync(stringify(value, options));
}

function strDoc(doc: YamlDocument, options?: Record<string, unknown>): string {
	return Effect.runSync(stringifyDocument(doc, options));
}

function roundtripCanonical(yaml: string): string {
	const doc = Effect.runSync(parseDocument(yaml, { uniqueKeys: false }));
	return Effect.runSync(stringifyDocument(doc, { forceDefaultStyles: true }));
}

// ---------------------------------------------------------------------------
// Explicit key syntax for non-scalar keys
// ---------------------------------------------------------------------------

describe("Explicit key syntax for complex mapping keys", () => {
	it("renders sequence key with ? syntax", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlSeq({
							items: [
								new YamlScalar({ value: "a", style: "plain", offset: 0, length: 1 }),
								new YamlScalar({ value: "b", style: "plain", offset: 0, length: 1 }),
							],
							style: "block",
							offset: 0,
							length: 1,
						}),
						value: new YamlScalar({ value: "val", style: "plain", offset: 0, length: 3 }),
					}),
				],
				style: "block",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("? - a");
		expect(result).toContain(": val");
	});

	it("renders map key with ? syntax", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlMap({
							items: [
								new YamlPair({
									key: new YamlScalar({ value: "k", style: "plain", offset: 0, length: 1 }),
									value: new YamlScalar({ value: "v", style: "plain", offset: 0, length: 1 }),
								}),
							],
							style: "block",
							offset: 0,
							length: 1,
						}),
						value: new YamlScalar({ value: "val", style: "plain", offset: 0, length: 3 }),
					}),
				],
				style: "block",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("?");
		expect(result).toContain("k: v");
		expect(result).toContain(": val");
	});

	it("renders complex key with null value", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlSeq({
							items: [new YamlScalar({ value: "x", style: "plain", offset: 0, length: 1 })],
							style: "block",
							offset: 0,
							length: 1,
						}),
						value: null,
					}),
				],
				style: "block",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("? - x");
		expect(result).toContain(":");
	});

	it("renders complex key with block scalar value", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlSeq({
							items: [new YamlScalar({ value: "key", style: "plain", offset: 0, length: 3 })],
							style: "block",
							offset: 0,
							length: 1,
						}),
						value: new YamlScalar({ value: "multi\nline\n", style: "block-literal", offset: 0, length: 10 }),
					}),
				],
				style: "block",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("? - key");
		expect(result).toContain(": |");
	});

	it("renders complex key with sequence value", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlSeq({
							items: [new YamlScalar({ value: "key", style: "plain", offset: 0, length: 3 })],
							style: "block",
							offset: 0,
							length: 1,
						}),
						value: new YamlSeq({
							items: [new YamlScalar({ value: "v1", style: "plain", offset: 0, length: 2 })],
							style: "block",
							offset: 0,
							length: 1,
						}),
					}),
				],
				style: "block",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("? - key");
		expect(result).toContain("- v1");
	});
});

// ---------------------------------------------------------------------------
// Tag normalization in canonical mode
// ---------------------------------------------------------------------------

describe("Tag normalization in canonical mode", () => {
	it("normalizes !!str shorthand tag", () => {
		const result = roundtripCanonical("!!str foo\n");
		expect(result).toContain("!!str");
	});

	it("normalizes verbatim standard tag to shorthand", () => {
		const result = roundtripCanonical("!<tag:yaml.org,2002:str> foo\n");
		expect(result).toContain("!!str");
	});

	it("expands custom tag handle via %TAG directive", () => {
		const result = roundtripCanonical("%TAG !e! tag:example.com,2000:app/\n---\n!e!foo bar\n");
		expect(result).toContain("!<tag:example.com,2000:app/foo>");
	});

	it("expands redefined !! handle", () => {
		const result = roundtripCanonical("%TAG !! tag:example.com,2000:app/\n---\n!!int 1 - 3\n");
		expect(result).toContain("!<tag:example.com,2000:app/int>");
	});

	it("expands primary ! handle via %TAG directive", () => {
		const result = roundtripCanonical("%TAG ! tag:example.com,2000:\n---\n!shape foo\n");
		expect(result).toContain("!<tag:example.com,2000:shape>");
	});

	it("simplifies verbatim local tag", () => {
		const result = roundtripCanonical("!<!bar> baz\n");
		expect(result).toContain("!bar");
	});
});

// ---------------------------------------------------------------------------
// Document start handling
// ---------------------------------------------------------------------------

describe("stringifyDocument document-start handling", () => {
	it("emits --- for root collection with hasDocumentStart", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlScalar({ value: "a", style: "plain", offset: 0, length: 1 }),
						value: new YamlScalar({ value: 1, style: "plain", offset: 0, length: 1 }),
					}),
				],
				style: "block",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
			hasDocumentStart: true,
		});
		const result = strDoc(doc);
		expect(result).toMatch(/^---\n/);
	});

	it("emits --- with tag and anchor on root scalar", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({
				value: "hello",
				style: "plain",
				tag: "!!str",
				anchor: "a1",
				offset: 0,
				length: 5,
			}),
			errors: [],
			warnings: [],
			directives: [],
			hasDocumentStart: true,
		});
		const result = strDoc(doc);
		expect(result).toMatch(/^--- &a1 !!str hello/);
	});

	it("emits --- with tag on root collection", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlScalar({ value: "k", style: "plain", offset: 0, length: 1 }),
						value: new YamlScalar({ value: "v", style: "plain", offset: 0, length: 1 }),
					}),
				],
				style: "block",
				tag: "!!map",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
			hasDocumentStart: true,
		});
		const result = strDoc(doc);
		expect(result).toMatch(/^--- !!map\n/);
	});

	it("emits ... for document with hasDocumentEnd", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: "text", style: "plain", offset: 0, length: 4 }),
			errors: [],
			warnings: [],
			directives: [],
			hasDocumentStart: true,
			hasDocumentEnd: true,
		});
		const result = strDoc(doc);
		expect(result).toContain("...\n");
	});

	it("handles empty document with hasDocumentStart in canonical mode", () => {
		const doc = new YamlDocument({
			contents: null,
			errors: [],
			warnings: [],
			directives: [],
			hasDocumentStart: true,
		});
		const result = strDoc(doc, { forceDefaultStyles: true });
		expect(result).toBe("---\n");
	});

	it("handles empty document with doc-end in canonical mode", () => {
		const doc = new YamlDocument({
			contents: null,
			errors: [],
			warnings: [],
			directives: [],
			hasDocumentStart: true,
			hasDocumentEnd: true,
		});
		const result = strDoc(doc, { forceDefaultStyles: true });
		expect(result).toBe("---\n...\n");
	});
});

// ---------------------------------------------------------------------------
// Edge cases in scalar rendering
// ---------------------------------------------------------------------------

describe("Scalar rendering edge cases", () => {
	it("renders non-ASCII string as double-quoted in canonical mode", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: "caf\u00E9", style: "plain", offset: 0, length: 4 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc, { forceDefaultStyles: true });
		expect(result).toContain("\\u00E9");
	});

	it("renders whitespace-only multiline as double-quoted", () => {
		const result = str("\n\n");
		expect(result.trim()).toMatch(/^"/);
	});

	it("renders empty block-folded as double-quoted", () => {
		const doc = new YamlDocument({
			contents: new YamlScalar({ value: "", style: "block-folded", offset: 0, length: 3 }),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result.trim()).toBe('""');
	});

	it("renders control chars in multiline as double-quoted", () => {
		const result = str("line1\n\x08line2\n");
		expect(result).toContain("\\b");
		expect(result).toContain('"');
	});

	it("renders carriage returns in multiline as double-quoted", () => {
		const result = str("line1\r\nline2");
		expect(result).toContain("\\r");
	});

	it("quotes strings ending with tab", () => {
		const result = str("trailing\t");
		expect(result.trim()).toMatch(/^['"]/);
	});

	it("quotes strings starting with double quote", () => {
		const result = str('"hello"');
		expect(result.trim()).toMatch(/^'/);
	});

	it("quotes strings starting with single quote", () => {
		const result = str("'hello'");
		expect(result.trim()).toMatch(/^["']/);
	});

	it("quotes strings with tab-before-hash", () => {
		const result = str("value\t#comment");
		expect(result.trim()).toMatch(/^['"]/);
	});

	it("quotes strings with colon-tab", () => {
		const result = str("key:\tvalue");
		expect(result.trim()).toMatch(/^['"]/);
	});
});

// ---------------------------------------------------------------------------
// Alias rendering
// ---------------------------------------------------------------------------

describe("Alias rendering in stringifyDocument", () => {
	it("renders alias nodes as *name", () => {
		const doc = new YamlDocument({
			contents: new YamlMap({
				items: [
					new YamlPair({
						key: new YamlScalar({ value: "anchor", style: "plain", anchor: "a1", offset: 0, length: 6 }),
						value: new YamlScalar({ value: "value", style: "plain", offset: 0, length: 5 }),
					}),
					new YamlPair({
						key: new YamlScalar({ value: "ref", style: "plain", offset: 0, length: 3 }),
						value: new YamlAlias({ name: "a1", offset: 0, length: 3 }),
					}),
				],
				style: "block",
				offset: 0,
				length: 1,
			}),
			errors: [],
			warnings: [],
			directives: [],
		});
		const result = strDoc(doc);
		expect(result).toContain("&a1 anchor");
		expect(result).toContain("*a1");
	});
});

// ---------------------------------------------------------------------------
// JS value stringify edge cases
// ---------------------------------------------------------------------------

describe("JS value stringify edge cases", () => {
	it("renders bigint values", () => {
		const result = str(BigInt("9007199254740993"));
		expect(result.trim()).toBe("9007199254740993");
	});

	it("renders NaN as .nan", () => {
		const result = str(Number.NaN);
		expect(result.trim()).toBe(".nan");
	});

	it("renders Infinity as .inf", () => {
		const result = str(Number.POSITIVE_INFINITY);
		expect(result.trim()).toBe(".inf");
	});

	it("renders -Infinity as -.inf", () => {
		const result = str(Number.NEGATIVE_INFINITY);
		expect(result.trim()).toBe("-.inf");
	});

	it("detects and fails on circular references", () => {
		const obj: Record<string, unknown> = { a: 1 };
		obj.self = obj;
		const result = Effect.runSync(Effect.either(stringify(obj)));
		expect(result._tag).toBe("Left");
	});

	it("renders flow-style collections", () => {
		const result = str({ a: [1, 2] }, { defaultCollectionStyle: "flow" });
		expect(result.trim()).toBe("{a: [1, 2]}");
	});

	it("renders sorted keys", () => {
		const result = str({ z: 1, a: 2 }, { sortKeys: true });
		expect(result.indexOf("a:")).toBeLessThan(result.indexOf("z:"));
	});

	it("renders without final newline when option is false", () => {
		const result = str("hello", { finalNewline: false });
		expect(result).toBe("hello");
	});

	it("uses double-quoted for multiline mapping keys", () => {
		const result = str({ "multi\nline": "value" });
		expect(result).toContain('"multi\\nline"');
	});
});
