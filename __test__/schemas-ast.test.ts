/**
 * Tests for AST node schemas: YamlScalar, YamlAlias, YamlPair, YamlMap,
 * YamlSeq, YamlNode, YamlDirective, and YamlDocument.
 *
 * @packageDocumentation
 */

import { Equal, Schema, Utils } from "effect";
import { describe, expect, it } from "vitest";
import { YamlAlias, YamlMap, YamlNode, YamlPair, YamlScalar, YamlSeq } from "../src/schemas/YamlAstNodes.js";
import { YamlDirective, YamlDocument } from "../src/schemas/YamlDocument.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScalar(value: unknown, overrides?: Partial<ConstructorParameters<typeof YamlScalar>[0]>): YamlScalar {
	return new YamlScalar({ value, style: "plain", offset: 0, length: 1, ...overrides });
}

// ---------------------------------------------------------------------------
// YamlScalar
// ---------------------------------------------------------------------------

describe("YamlScalar", () => {
	it("has _tag of 'YamlScalar'", () => {
		const node = makeScalar("hello");
		expect(node._tag).toBe("YamlScalar");
	});

	it("accepts null value", () => {
		const node = makeScalar(null);
		expect(node.value).toBeNull();
	});

	it("accepts boolean value", () => {
		const node = makeScalar(true);
		expect(node.value).toBe(true);
	});

	it("accepts number value", () => {
		const node = makeScalar(42);
		expect(node.value).toBe(42);
	});

	it("accepts string value", () => {
		const node = makeScalar("hello");
		expect(node.value).toBe("hello");
	});

	it("accepts all 5 scalar styles", () => {
		const styles = ["plain", "single-quoted", "double-quoted", "block-literal", "block-folded"] as const;
		for (const style of styles) {
			const node = makeScalar("x", { style });
			expect(node.style).toBe(style);
		}
	});

	it("rejects invalid style via decode", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlScalar)({
				_tag: "YamlScalar",
				value: "x",
				style: "invalid-style",
				offset: 0,
				length: 1,
			}),
		).toThrow();
	});

	it("accepts optional tag", () => {
		const node = makeScalar("42", { tag: "!!int" });
		expect(node.tag).toBe("!!int");
	});

	it("accepts optional anchor", () => {
		const node = makeScalar("hello", { anchor: "myAnchor" });
		expect(node.anchor).toBe("myAnchor");
	});

	it("accepts optional comment", () => {
		const node = makeScalar("hello", { comment: "# a comment" });
		expect(node.comment).toBe("# a comment");
	});

	it("rejects negative offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlScalar)({
				_tag: "YamlScalar",
				value: "x",
				style: "plain",
				offset: -1,
				length: 1,
			}),
		).toThrow();
	});

	it("rejects fractional length", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlScalar)({
				_tag: "YamlScalar",
				value: "x",
				style: "plain",
				offset: 0,
				length: 1.5,
			}),
		).toThrow();
	});

	it("supports structural equality", () => {
		const a = makeScalar("hello");
		const b = makeScalar("hello");
		expect(Utils.structuralRegion(() => Equal.equals(a, b))).toBe(true);
	});

	it("structural equality returns false for differing nodes", () => {
		const a = makeScalar("hello");
		const b = makeScalar("world");
		expect(Utils.structuralRegion(() => Equal.equals(a, b))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// YamlAlias
// ---------------------------------------------------------------------------

describe("YamlAlias", () => {
	it("has _tag of 'YamlAlias'", () => {
		const node = new YamlAlias({ name: "myAnchor", offset: 0, length: 9 });
		expect(node._tag).toBe("YamlAlias");
	});

	it("stores name, offset, and length", () => {
		const node = new YamlAlias({ name: "ref", offset: 5, length: 4 });
		expect(node.name).toBe("ref");
		expect(node.offset).toBe(5);
		expect(node.length).toBe(4);
	});

	it("rejects negative offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlAlias)({
				_tag: "YamlAlias",
				name: "ref",
				offset: -1,
				length: 4,
			}),
		).toThrow();
	});

	it("rejects fractional length", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlAlias)({
				_tag: "YamlAlias",
				name: "ref",
				offset: 0,
				length: 1.5,
			}),
		).toThrow();
	});

	it("supports structural equality", () => {
		const a = new YamlAlias({ name: "ref", offset: 0, length: 4 });
		const b = new YamlAlias({ name: "ref", offset: 0, length: 4 });
		expect(Utils.structuralRegion(() => Equal.equals(a, b))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// YamlPair
// ---------------------------------------------------------------------------

describe("YamlPair", () => {
	it("has _tag of 'YamlPair'", () => {
		const key = makeScalar("key");
		const pair = new YamlPair({ key, value: null });
		expect(pair._tag).toBe("YamlPair");
	});

	it("holds a YamlNode key and null value", () => {
		const key = makeScalar("key");
		const pair = new YamlPair({ key, value: null });
		expect(pair.key).toBe(key);
		expect(pair.value).toBeNull();
	});

	it("holds a YamlNode key and YamlNode value", () => {
		const key = makeScalar("key");
		const value = makeScalar("value");
		const pair = new YamlPair({ key, value });
		expect(pair.key).toBe(key);
		expect(pair.value).toBe(value);
	});

	it("accepts optional comment", () => {
		const key = makeScalar("key");
		const pair = new YamlPair({ key, value: null, comment: "# pair comment" });
		expect(pair.comment).toBe("# pair comment");
	});

	it("can be decoded from a plain object", () => {
		const pair = Schema.decodeUnknownSync(YamlPair)({
			_tag: "YamlPair",
			key: { _tag: "YamlScalar", value: "k", style: "plain", offset: 0, length: 1 },
			value: { _tag: "YamlScalar", value: "v", style: "plain", offset: 3, length: 1 },
		});
		expect(pair._tag).toBe("YamlPair");
		expect((pair.key as YamlScalar).value).toBe("k");
	});

	it("supports structural equality", () => {
		const key = makeScalar("k");
		const a = new YamlPair({ key, value: null });
		const b = new YamlPair({ key, value: null });
		expect(Utils.structuralRegion(() => Equal.equals(a, b))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// YamlMap
// ---------------------------------------------------------------------------

describe("YamlMap", () => {
	it("has _tag of 'YamlMap'", () => {
		const node = new YamlMap({ items: [], style: "block", offset: 0, length: 0 });
		expect(node._tag).toBe("YamlMap");
	});

	it("accepts block and flow styles", () => {
		const block = new YamlMap({ items: [], style: "block", offset: 0, length: 0 });
		const flow = new YamlMap({ items: [], style: "flow", offset: 0, length: 0 });
		expect(block.style).toBe("block");
		expect(flow.style).toBe("flow");
	});

	it("rejects invalid style", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlMap)({
				_tag: "YamlMap",
				items: [],
				style: "invalid",
				offset: 0,
				length: 0,
			}),
		).toThrow();
	});

	it("stores items array of YamlPair", () => {
		const key = makeScalar("k");
		const value = makeScalar("v");
		const pair = new YamlPair({ key, value });
		const map = new YamlMap({ items: [pair], style: "block", offset: 0, length: 8 });
		expect(map.items).toHaveLength(1);
		expect(map.items[0]).toBe(pair);
	});

	it("accepts optional tag, anchor, comment", () => {
		const map = new YamlMap({
			items: [],
			style: "block",
			offset: 0,
			length: 0,
			tag: "!!map",
			anchor: "myMap",
			comment: "# map comment",
		});
		expect(map.tag).toBe("!!map");
		expect(map.anchor).toBe("myMap");
		expect(map.comment).toBe("# map comment");
	});

	it("rejects negative offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlMap)({
				_tag: "YamlMap",
				items: [],
				style: "block",
				offset: -1,
				length: 0,
			}),
		).toThrow();
	});

	it("supports structural equality", () => {
		const a = new YamlMap({ items: [], style: "block", offset: 0, length: 0 });
		const b = new YamlMap({ items: [], style: "block", offset: 0, length: 0 });
		expect(Utils.structuralRegion(() => Equal.equals(a, b))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// YamlSeq
// ---------------------------------------------------------------------------

describe("YamlSeq", () => {
	it("has _tag of 'YamlSeq'", () => {
		const node = new YamlSeq({ items: [], style: "block", offset: 0, length: 0 });
		expect(node._tag).toBe("YamlSeq");
	});

	it("accepts block and flow styles", () => {
		const block = new YamlSeq({ items: [], style: "block", offset: 0, length: 0 });
		const flow = new YamlSeq({ items: [], style: "flow", offset: 0, length: 0 });
		expect(block.style).toBe("block");
		expect(flow.style).toBe("flow");
	});

	it("stores items array of YamlNode", () => {
		const scalar = makeScalar("item");
		const seq = new YamlSeq({ items: [scalar], style: "block", offset: 0, length: 6 });
		expect(seq.items).toHaveLength(1);
		expect(seq.items[0]).toBe(scalar);
	});

	it("accepts optional tag, anchor, comment", () => {
		const seq = new YamlSeq({
			items: [],
			style: "flow",
			offset: 0,
			length: 0,
			tag: "!!seq",
			anchor: "mySeq",
			comment: "# seq comment",
		});
		expect(seq.tag).toBe("!!seq");
		expect(seq.anchor).toBe("mySeq");
		expect(seq.comment).toBe("# seq comment");
	});

	it("rejects negative length", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlSeq)({
				_tag: "YamlSeq",
				items: [],
				style: "block",
				offset: 0,
				length: -1,
			}),
		).toThrow();
	});

	it("supports structural equality", () => {
		const a = new YamlSeq({ items: [], style: "flow", offset: 0, length: 0 });
		const b = new YamlSeq({ items: [], style: "flow", offset: 0, length: 0 });
		expect(Utils.structuralRegion(() => Equal.equals(a, b))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// YamlNode (discriminated union)
// ---------------------------------------------------------------------------

describe("YamlNode", () => {
	it("can hold a YamlScalar", () => {
		const scalar = makeScalar("hello");
		const node = Schema.decodeUnknownSync(YamlNode)(scalar);
		expect(node._tag).toBe("YamlScalar");
	});

	it("can hold a YamlAlias", () => {
		const alias = new YamlAlias({ name: "ref", offset: 0, length: 4 });
		const node = Schema.decodeUnknownSync(YamlNode)(alias);
		expect(node._tag).toBe("YamlAlias");
	});

	it("can hold a YamlMap", () => {
		const map = new YamlMap({ items: [], style: "block", offset: 0, length: 0 });
		const node = Schema.decodeUnknownSync(YamlNode)(map);
		expect(node._tag).toBe("YamlMap");
	});

	it("can hold a YamlSeq", () => {
		const seq = new YamlSeq({ items: [], style: "block", offset: 0, length: 0 });
		const node = Schema.decodeUnknownSync(YamlNode)(seq);
		expect(node._tag).toBe("YamlSeq");
	});

	it("rejects unknown _tag", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlNode)({
				_tag: "Unknown",
				value: "x",
				style: "plain",
				offset: 0,
				length: 1,
			}),
		).toThrow();
	});

	it("can decode from a plain object using _tag discriminant", () => {
		const node = Schema.decodeUnknownSync(YamlNode)({
			_tag: "YamlAlias",
			name: "someRef",
			offset: 2,
			length: 8,
		});
		expect(node._tag).toBe("YamlAlias");
		expect((node as YamlAlias).name).toBe("someRef");
	});
});

// ---------------------------------------------------------------------------
// Recursive structures
// ---------------------------------------------------------------------------

describe("Recursive structures", () => {
	it("YamlMap can contain a nested YamlMap via YamlPair", () => {
		const innerScalar = makeScalar("innerValue");
		const innerKey = makeScalar("innerKey");
		const innerPair = new YamlPair({ key: innerKey, value: innerScalar });
		const innerMap = new YamlMap({ items: [innerPair], style: "block", offset: 10, length: 20 });
		const outerKey = makeScalar("outerKey");
		const outerPair = new YamlPair({ key: outerKey, value: innerMap });
		const outerMap = new YamlMap({ items: [outerPair], style: "block", offset: 0, length: 40 });

		expect(outerMap.items[0].value).toBe(innerMap);
		expect((outerMap.items[0].value as YamlMap).items[0].value).toBe(innerScalar);
	});

	it("YamlSeq can contain nested YamlSeq", () => {
		const inner = new YamlSeq({ items: [makeScalar(1), makeScalar(2)], style: "flow", offset: 2, length: 6 });
		const outer = new YamlSeq({ items: [inner], style: "block", offset: 0, length: 10 });
		expect((outer.items[0] as YamlSeq).items).toHaveLength(2);
	});

	it("can decode a recursive structure from plain objects", () => {
		const doc = Schema.decodeUnknownSync(YamlNode)({
			_tag: "YamlMap",
			items: [
				{
					_tag: "YamlPair",
					key: { _tag: "YamlScalar", value: "name", style: "plain", offset: 0, length: 4 },
					value: {
						_tag: "YamlSeq",
						items: [
							{ _tag: "YamlScalar", value: "Alice", style: "plain", offset: 7, length: 5 },
							{ _tag: "YamlScalar", value: "Bob", style: "plain", offset: 14, length: 3 },
						],
						style: "block",
						offset: 6,
						length: 12,
					},
				},
			],
			style: "block",
			offset: 0,
			length: 20,
		});
		expect(doc._tag).toBe("YamlMap");
		const map = doc as YamlMap;
		expect(map.items[0]._tag).toBe("YamlPair");
		const seq = map.items[0].value as YamlSeq;
		expect(seq._tag).toBe("YamlSeq");
		expect(seq.items).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// YamlDirective
// ---------------------------------------------------------------------------

describe("YamlDirective", () => {
	it("accepts YAML directive name", () => {
		const d = new YamlDirective({ name: "YAML", parameters: ["1.2"] });
		expect(d.name).toBe("YAML");
		expect(d.parameters).toEqual(["1.2"]);
	});

	it("accepts TAG directive name", () => {
		const d = new YamlDirective({ name: "TAG", parameters: ["!!", "tag:yaml.org,2002:"] });
		expect(d.name).toBe("TAG");
	});

	it("rejects invalid directive name", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlDirective)({
				name: "INVALID",
				parameters: [],
			}),
		).toThrow();
	});
});

// ---------------------------------------------------------------------------
// YamlDocument
// ---------------------------------------------------------------------------

describe("YamlDocument", () => {
	it("can be constructed with null contents", () => {
		const doc = new YamlDocument({ contents: null, errors: [], warnings: [], directives: [] });
		expect(doc.contents).toBeNull();
		expect(doc.errors).toHaveLength(0);
	});

	it("can be constructed with a scalar contents", () => {
		const scalar = makeScalar("hello");
		const doc = new YamlDocument({ contents: scalar, errors: [], warnings: [], directives: [] });
		expect(doc.contents).toBe(scalar);
		expect((doc.contents as YamlScalar).value).toBe("hello");
	});

	it("accepts optional comment", () => {
		const doc = new YamlDocument({
			contents: null,
			errors: [],
			warnings: [],
			directives: [],
			comment: "# doc comment",
		});
		expect(doc.comment).toBe("# doc comment");
	});

	it("stores directives array", () => {
		const directive = new YamlDirective({ name: "YAML", parameters: ["1.2"] });
		const doc = new YamlDocument({ contents: null, errors: [], warnings: [], directives: [directive] });
		expect(doc.directives).toHaveLength(1);
		expect(doc.directives[0].name).toBe("YAML");
	});

	it("can be decoded from a plain object", () => {
		const doc = Schema.decodeUnknownSync(YamlDocument)({
			contents: { _tag: "YamlScalar", value: "hello", style: "plain", offset: 0, length: 5 },
			errors: [],
			warnings: [],
			directives: [{ name: "YAML", parameters: ["1.2"] }],
		});
		expect(doc.contents?._tag).toBe("YamlScalar");
		expect(doc.directives[0].name).toBe("YAML");
	});

	it("can contain a complex map as contents", () => {
		const key = makeScalar("version");
		const value = makeScalar("1.0");
		const pair = new YamlPair({ key, value });
		const map = new YamlMap({ items: [pair], style: "block", offset: 0, length: 14 });
		const doc = new YamlDocument({ contents: map, errors: [], warnings: [], directives: [] });
		expect(doc.contents?._tag).toBe("YamlMap");
	});

	it("supports structural equality", () => {
		const a = new YamlDocument({ contents: null, errors: [], warnings: [], directives: [] });
		const b = new YamlDocument({ contents: null, errors: [], warnings: [], directives: [] });
		expect(Utils.structuralRegion(() => Equal.equals(a, b))).toBe(true);
	});
});
