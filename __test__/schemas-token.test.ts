/**
 * Tests for YamlToken schema and YamlTokenKind literal union.
 *
 * @packageDocumentation
 */

import { Equal, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { YamlToken, YamlTokenKind } from "../src/schemas/YamlToken.js";

// ---------------------------------------------------------------------------
// YamlTokenKind
// ---------------------------------------------------------------------------

describe("YamlTokenKind", () => {
	const validKinds = [
		"document-start",
		"document-end",
		"directive",
		"tag",
		"anchor",
		"alias",
		"scalar",
		"block-map-start",
		"block-map-key",
		"block-map-value",
		"block-seq-start",
		"block-seq-entry",
		"flow-map-start",
		"flow-map-end",
		"flow-seq-start",
		"flow-seq-end",
		"flow-separator",
		"newline",
		"whitespace",
		"comment",
		"byte-order-mark",
		"error",
	] as const;

	it("accepts all 22 valid token kinds", () => {
		expect(validKinds).toHaveLength(22);
		for (const kind of validKinds) {
			expect(() => Schema.decodeUnknownSync(YamlTokenKind)(kind)).not.toThrow();
			expect(Schema.decodeUnknownSync(YamlTokenKind)(kind)).toBe(kind);
		}
	});

	it("rejects invalid token kinds", () => {
		expect(() => Schema.decodeUnknownSync(YamlTokenKind)("unknown")).toThrow();
		expect(() => Schema.decodeUnknownSync(YamlTokenKind)("")).toThrow();
		expect(() => Schema.decodeUnknownSync(YamlTokenKind)("SCALAR")).toThrow();
		expect(() => Schema.decodeUnknownSync(YamlTokenKind)(42)).toThrow();
		expect(() => Schema.decodeUnknownSync(YamlTokenKind)(null)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// YamlToken
// ---------------------------------------------------------------------------

describe("YamlToken", () => {
	it("can be constructed with all required fields", () => {
		const token = new YamlToken({
			kind: "scalar",
			value: "hello",
			offset: 0,
			length: 5,
			line: 0,
			column: 0,
		});
		expect(token.kind).toBe("scalar");
		expect(token.value).toBe("hello");
		expect(token.offset).toBe(0);
		expect(token.length).toBe(5);
		expect(token.line).toBe(0);
		expect(token.column).toBe(0);
	});

	it("can be decoded from a plain object", () => {
		const token = Schema.decodeUnknownSync(YamlToken)({
			kind: "document-start",
			value: "---",
			offset: 0,
			length: 3,
			line: 0,
			column: 0,
		});
		expect(token.kind).toBe("document-start");
		expect(token.value).toBe("---");
		expect(token.offset).toBe(0);
		expect(token.length).toBe(3);
	});

	it("supports structural equality between identical tokens", () => {
		const a = new YamlToken({
			kind: "scalar",
			value: "foo",
			offset: 10,
			length: 3,
			line: 1,
			column: 4,
		});
		const b = new YamlToken({
			kind: "scalar",
			value: "foo",
			offset: 10,
			length: 3,
			line: 1,
			column: 4,
		});
		expect(Equal.equals(a, b)).toBe(true);
	});

	it("structural equality returns false for differing tokens", () => {
		const a = new YamlToken({
			kind: "scalar",
			value: "foo",
			offset: 0,
			length: 3,
			line: 0,
			column: 0,
		});
		const b = new YamlToken({
			kind: "scalar",
			value: "bar",
			offset: 0,
			length: 3,
			line: 0,
			column: 0,
		});
		expect(Equal.equals(a, b)).toBe(false);
	});

	it("rejects invalid token kind", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "not-a-kind",
				value: "x",
				offset: 0,
				length: 1,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects negative offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: -1,
				length: 1,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects fractional offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0.5,
				length: 1,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects negative length", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0,
				length: -1,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects fractional length", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0,
				length: 1.5,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects negative line", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0,
				length: 1,
				line: -1,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects fractional line", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0,
				length: 1,
				line: 0.5,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects negative column", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0,
				length: 1,
				line: 0,
				column: -1,
			}),
		).toThrow();
	});

	it("rejects fractional column", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0,
				length: 1,
				line: 0,
				column: 0.5,
			}),
		).toThrow();
	});

	it("rejects missing required fields", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlToken)({
				kind: "scalar",
				value: "x",
				offset: 0,
				length: 1,
				line: 0,
				// missing column
			}),
		).toThrow();
	});

	it("encodes back to a plain object", () => {
		const token = new YamlToken({
			kind: "comment",
			value: "# note",
			offset: 5,
			length: 6,
			line: 2,
			column: 0,
		});
		const encoded = Schema.encodeSync(YamlToken)(token);
		expect(encoded).toEqual({
			kind: "comment",
			value: "# note",
			offset: 5,
			length: 6,
			line: 2,
			column: 0,
		});
	});

	it("accepts all 22 token kinds via constructor", () => {
		const kinds = [
			"document-start",
			"document-end",
			"directive",
			"tag",
			"anchor",
			"alias",
			"scalar",
			"block-map-start",
			"block-map-key",
			"block-map-value",
			"block-seq-start",
			"block-seq-entry",
			"flow-map-start",
			"flow-map-end",
			"flow-seq-start",
			"flow-seq-end",
			"flow-separator",
			"newline",
			"whitespace",
			"comment",
			"byte-order-mark",
			"error",
		] as const;
		for (const kind of kinds) {
			const token = new YamlToken({ kind, value: "", offset: 0, length: 0, line: 0, column: 0 });
			expect(token.kind).toBe(kind);
		}
	});
});
