/**
 * Tests for CstNode schema and CstNodeType literal union.
 *
 * @packageDocumentation
 */

import { Equal, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CstNode, CstNodeType } from "../src/schemas/CstNode.js";

// ---------------------------------------------------------------------------
// CstNodeType
// ---------------------------------------------------------------------------

describe("CstNodeType", () => {
	const validTypes = [
		"document",
		"directive",
		"comment",
		"block-map",
		"block-seq",
		"flow-map",
		"flow-seq",
		"block-scalar",
		"flow-scalar",
		"alias",
		"anchor",
		"tag",
		"whitespace",
		"newline",
		"error",
	] as const;

	it("accepts all 15 valid node types", () => {
		expect(validTypes).toHaveLength(15);
		for (const type of validTypes) {
			expect(() => Schema.decodeUnknownSync(CstNodeType)(type)).not.toThrow();
			expect(Schema.decodeUnknownSync(CstNodeType)(type)).toBe(type);
		}
	});

	it("rejects invalid node types", () => {
		expect(() => Schema.decodeUnknownSync(CstNodeType)("unknown")).toThrow();
		expect(() => Schema.decodeUnknownSync(CstNodeType)("")).toThrow();
		expect(() => Schema.decodeUnknownSync(CstNodeType)("DOCUMENT")).toThrow();
		expect(() => Schema.decodeUnknownSync(CstNodeType)(42)).toThrow();
		expect(() => Schema.decodeUnknownSync(CstNodeType)(null)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// CstNode
// ---------------------------------------------------------------------------

describe("CstNode", () => {
	it("can be constructed with required fields only", () => {
		const node = new CstNode({
			type: "document",
			source: "---\nfoo: bar\n",
			offset: 0,
			length: 12,
		});
		expect(node.type).toBe("document");
		expect(node.source).toBe("---\nfoo: bar\n");
		expect(node.offset).toBe(0);
		expect(node.length).toBe(12);
		expect(node.children).toBeUndefined();
	});

	it("can be decoded from a plain object", () => {
		const node = Schema.decodeUnknownSync(CstNode)({
			type: "flow-scalar",
			source: "true",
			offset: 5,
			length: 4,
		});
		expect(node.type).toBe("flow-scalar");
		expect(node.source).toBe("true");
		expect(node.offset).toBe(5);
		expect(node.length).toBe(4);
	});

	it("supports children array via Schema.suspend recursion", () => {
		const child = new CstNode({
			type: "flow-scalar",
			source: "bar",
			offset: 5,
			length: 3,
		});
		const parent = new CstNode({
			type: "block-map",
			source: "foo: bar",
			offset: 0,
			length: 8,
			children: [child],
		});
		expect(parent.children).toHaveLength(1);
		expect(parent.children?.[0].type).toBe("flow-scalar");
		expect(parent.children?.[0].source).toBe("bar");
	});

	it("supports nested recursive children", () => {
		const grandchild = new CstNode({
			type: "anchor",
			source: "&ref",
			offset: 0,
			length: 4,
		});
		const child = new CstNode({
			type: "block-map",
			source: "&ref foo: bar",
			offset: 0,
			length: 13,
			children: [grandchild],
		});
		const root = new CstNode({
			type: "document",
			source: "&ref foo: bar\n",
			offset: 0,
			length: 14,
			children: [child],
		});
		expect(root.children?.[0].children?.[0].type).toBe("anchor");
		expect(root.children?.[0].children?.[0].source).toBe("&ref");
	});

	it("can decode a node with children from a plain object", () => {
		const node = Schema.decodeUnknownSync(CstNode)({
			type: "flow-seq",
			source: "[1, 2]",
			offset: 0,
			length: 6,
			children: [
				{ type: "flow-scalar", source: "1", offset: 1, length: 1 },
				{ type: "flow-scalar", source: "2", offset: 4, length: 1 },
			],
		});
		expect(node.type).toBe("flow-seq");
		expect(node.children).toHaveLength(2);
		expect(node.children?.[0].type).toBe("flow-scalar");
		expect(node.children?.[1].source).toBe("2");
	});

	it("supports structural equality between identical nodes", () => {
		const a = new CstNode({
			type: "comment",
			source: "# note",
			offset: 10,
			length: 6,
		});
		const b = new CstNode({
			type: "comment",
			source: "# note",
			offset: 10,
			length: 6,
		});
		expect(Equal.equals(a, b)).toBe(true);
	});

	it("structural equality returns false for differing nodes", () => {
		const a = new CstNode({
			type: "comment",
			source: "# note",
			offset: 0,
			length: 6,
		});
		const b = new CstNode({
			type: "comment",
			source: "# other",
			offset: 0,
			length: 7,
		});
		expect(Equal.equals(a, b)).toBe(false);
	});

	it("rejects invalid node type", () => {
		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				type: "not-a-type",
				source: "x",
				offset: 0,
				length: 1,
			}),
		).toThrow();
	});

	it("rejects negative offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				type: "document",
				source: "x",
				offset: -1,
				length: 1,
			}),
		).toThrow();
	});

	it("rejects fractional offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				type: "document",
				source: "x",
				offset: 0.5,
				length: 1,
			}),
		).toThrow();
	});

	it("rejects negative length", () => {
		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				type: "document",
				source: "x",
				offset: 0,
				length: -1,
			}),
		).toThrow();
	});

	it("rejects fractional length", () => {
		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				type: "document",
				source: "x",
				offset: 0,
				length: 1.5,
			}),
		).toThrow();
	});

	it("rejects missing required fields", () => {
		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				type: "document",
				source: "x",
				offset: 0,
				// missing length
			}),
		).toThrow();

		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				type: "document",
				// missing source
				offset: 0,
				length: 1,
			}),
		).toThrow();

		expect(() =>
			Schema.decodeUnknownSync(CstNode)({
				// missing type
				source: "x",
				offset: 0,
				length: 1,
			}),
		).toThrow();
	});

	it("accepts all 15 node types via constructor", () => {
		const types = [
			"document",
			"directive",
			"comment",
			"block-map",
			"block-seq",
			"flow-map",
			"flow-seq",
			"block-scalar",
			"flow-scalar",
			"alias",
			"anchor",
			"tag",
			"whitespace",
			"newline",
			"error",
		] as const;
		for (const type of types) {
			const node = new CstNode({ type, source: "", offset: 0, length: 0 });
			expect(node.type).toBe(type);
		}
	});
});
