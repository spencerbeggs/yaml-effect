/**
 * Integration tests for the public API.
 *
 * @packageDocumentation
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
	isDocument,
	isMap,
	isNode,
	isScalar,
	isSeq,
	parse,
	parseAllDocuments,
	parseDocument,
	stringify,
} from "../src/index.js";

// ===========================================================================
// End-to-end integration tests via public API
// ===========================================================================

describe("Public API integration", () => {
	describe("parse", () => {
		it('parses "a: 1" into { a: 1 }', () => {
			const result = Effect.runSync(parse("a: 1"));
			expect(result).toEqual({ a: 1 });
		});

		it("parses nested structures", () => {
			const result = Effect.runSync(parse("a:\n  b: 2\n  c: 3"));
			expect(result).toEqual({ a: { b: 2, c: 3 } });
		});

		it("parses sequences", () => {
			const result = Effect.runSync(parse("- 1\n- 2\n- 3"));
			expect(result).toEqual([1, 2, 3]);
		});
	});

	describe("stringify", () => {
		it("stringifies { a: 1 } to valid YAML", () => {
			const result = Effect.runSync(stringify({ a: 1 }));
			expect(typeof result).toBe("string");
			expect(result).toContain("a:");
			expect(result).toContain("1");
		});

		it("stringifies arrays", () => {
			const result = Effect.runSync(stringify([1, 2, 3]));
			expect(result).toContain("- 1");
			expect(result).toContain("- 2");
			expect(result).toContain("- 3");
		});
	});

	describe("parseDocument", () => {
		it("returns a YamlDocument with AST", () => {
			const doc = Effect.runSync(parseDocument("a: 1"));
			expect(isDocument(doc)).toBe(true);
			expect(doc.contents).not.toBeNull();
			expect(isMap(doc.contents)).toBe(true);
		});

		it("includes errors and warnings arrays", () => {
			const doc = Effect.runSync(parseDocument("hello"));
			expect(Array.isArray(doc.errors)).toBe(true);
			expect(Array.isArray(doc.warnings)).toBe(true);
		});
	});

	describe("parseAllDocuments", () => {
		it("handles multi-document YAML", () => {
			const docs = Effect.runSync(parseAllDocuments("---\na: 1\n---\nb: 2"));
			expect(docs.length).toBeGreaterThanOrEqual(2);
			expect(isDocument(docs[0])).toBe(true);
			expect(isDocument(docs[1])).toBe(true);
		});

		it("handles single document", () => {
			const docs = Effect.runSync(parseAllDocuments("hello"));
			expect(docs.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("type guards via public API", () => {
		it("isScalar identifies scalar nodes", () => {
			const doc = Effect.runSync(parseDocument("hello"));
			expect(isScalar(doc.contents)).toBe(true);
		});

		it("isMap identifies mapping nodes", () => {
			const doc = Effect.runSync(parseDocument("a: 1"));
			expect(isMap(doc.contents)).toBe(true);
		});

		it("isSeq identifies sequence nodes", () => {
			const doc = Effect.runSync(parseDocument("- 1\n- 2"));
			expect(isSeq(doc.contents)).toBe(true);
		});

		it("isNode returns true for any AST node", () => {
			const doc = Effect.runSync(parseDocument("hello"));
			expect(isNode(doc.contents)).toBe(true);
		});

		it("isDocument returns true for documents", () => {
			const doc = Effect.runSync(parseDocument("hello"));
			expect(isDocument(doc)).toBe(true);
		});
	});

	describe("roundtrip", () => {
		it("parse(stringify(value)) preserves simple objects", () => {
			const original = { name: "test", count: 42, active: true };
			const yaml = Effect.runSync(stringify(original));
			const result = Effect.runSync(parse(yaml));
			expect(result).toEqual(original);
		});

		it("parse(stringify(value)) preserves arrays", () => {
			const original = [1, 2, 3];
			const yaml = Effect.runSync(stringify(original));
			const result = Effect.runSync(parse(yaml));
			expect(result).toEqual(original);
		});

		it("parse(stringify(value)) preserves scalars", () => {
			const original = { a: 1, b: "hello", c: true, d: null };
			const yaml = Effect.runSync(stringify(original));
			const result = Effect.runSync(parse(yaml));
			expect(result).toEqual(original);
		});
	});
});
