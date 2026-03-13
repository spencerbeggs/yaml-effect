/**
 * Tests for YAML option schemas and shared type schemas.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { YamlFormattingOptions } from "../src/schemas/YamlFormattingOptions.js";
import { YamlParseOptions } from "../src/schemas/YamlParseOptions.js";
import type { YamlPath } from "../src/schemas/YamlShared.js";
import { YamlEdit, YamlRange } from "../src/schemas/YamlShared.js";
import { YamlStringifyOptions } from "../src/schemas/YamlStringifyOptions.js";

// ---------------------------------------------------------------------------
// YamlParseOptions
// ---------------------------------------------------------------------------

describe("YamlParseOptions", () => {
	it("has correct defaults when decoded from {}", () => {
		const options = Schema.decodeUnknownSync(YamlParseOptions)({});
		expect(options.strict).toBe(true);
		expect(options.maxAliasCount).toBe(100);
		expect(options.uniqueKeys).toBe(true);
	});

	it("accepts valid option combinations", () => {
		const options = Schema.decodeUnknownSync(YamlParseOptions)({
			strict: false,
			maxAliasCount: 50,
			uniqueKeys: false,
		});
		expect(options.strict).toBe(false);
		expect(options.maxAliasCount).toBe(50);
		expect(options.uniqueKeys).toBe(false);
	});

	it("can be constructed directly with new", () => {
		const options = new YamlParseOptions({ strict: false });
		expect(options.strict).toBe(false);
		expect(options.maxAliasCount).toBe(100);
		expect(options.uniqueKeys).toBe(true);
	});

	it("rejects negative maxAliasCount", () => {
		expect(() => Schema.decodeUnknownSync(YamlParseOptions)({ maxAliasCount: -1 })).toThrow();
	});

	it("rejects non-integer maxAliasCount", () => {
		expect(() => Schema.decodeUnknownSync(YamlParseOptions)({ maxAliasCount: 1.5 })).toThrow();
	});

	it("rejects non-boolean strict", () => {
		expect(() => Schema.decodeUnknownSync(YamlParseOptions)({ strict: "yes" })).toThrow();
	});
});

// ---------------------------------------------------------------------------
// YamlStringifyOptions
// ---------------------------------------------------------------------------

describe("YamlStringifyOptions", () => {
	it("has correct defaults when decoded from {}", () => {
		const options = Schema.decodeUnknownSync(YamlStringifyOptions)({});
		expect(options.indent).toBe(2);
		expect(options.lineWidth).toBe(80);
		expect(options.defaultScalarStyle).toBe("plain");
		expect(options.defaultCollectionStyle).toBe("block");
		expect(options.sortKeys).toBe(false);
		expect(options.finalNewline).toBe(true);
	});

	it("accepts valid option combinations", () => {
		const options = Schema.decodeUnknownSync(YamlStringifyOptions)({
			indent: 4,
			lineWidth: 120,
			defaultScalarStyle: "double-quoted",
			defaultCollectionStyle: "flow",
			sortKeys: true,
			finalNewline: false,
		});
		expect(options.indent).toBe(4);
		expect(options.lineWidth).toBe(120);
		expect(options.defaultScalarStyle).toBe("double-quoted");
		expect(options.defaultCollectionStyle).toBe("flow");
		expect(options.sortKeys).toBe(true);
		expect(options.finalNewline).toBe(false);
	});

	it("accepts all valid scalar styles", () => {
		const styles = ["plain", "single-quoted", "double-quoted", "block-literal", "block-folded"] as const;
		for (const style of styles) {
			const options = Schema.decodeUnknownSync(YamlStringifyOptions)({ defaultScalarStyle: style });
			expect(options.defaultScalarStyle).toBe(style);
		}
	});

	it("accepts all valid collection styles", () => {
		for (const style of ["block", "flow"] as const) {
			const options = Schema.decodeUnknownSync(YamlStringifyOptions)({ defaultCollectionStyle: style });
			expect(options.defaultCollectionStyle).toBe(style);
		}
	});

	it("rejects negative indent", () => {
		expect(() => Schema.decodeUnknownSync(YamlStringifyOptions)({ indent: -1 })).toThrow();
	});

	it("rejects non-integer indent", () => {
		expect(() => Schema.decodeUnknownSync(YamlStringifyOptions)({ indent: 2.5 })).toThrow();
	});

	it("rejects zero lineWidth", () => {
		expect(() => Schema.decodeUnknownSync(YamlStringifyOptions)({ lineWidth: 0 })).toThrow();
	});

	it("rejects negative lineWidth", () => {
		expect(() => Schema.decodeUnknownSync(YamlStringifyOptions)({ lineWidth: -1 })).toThrow();
	});

	it("rejects fractional lineWidth", () => {
		expect(() => Schema.decodeUnknownSync(YamlStringifyOptions)({ lineWidth: 80.5 })).toThrow();
	});

	it("rejects invalid scalar style", () => {
		expect(() => Schema.decodeUnknownSync(YamlStringifyOptions)({ defaultScalarStyle: "invalid" })).toThrow();
	});

	it("rejects invalid collection style", () => {
		expect(() => Schema.decodeUnknownSync(YamlStringifyOptions)({ defaultCollectionStyle: "invalid" })).toThrow();
	});
});

// ---------------------------------------------------------------------------
// YamlFormattingOptions
// ---------------------------------------------------------------------------

describe("YamlFormattingOptions", () => {
	it("has correct defaults when decoded from {}", () => {
		const options = Schema.decodeUnknownSync(YamlFormattingOptions)({});
		// Inherited from YamlStringifyOptions
		expect(options.indent).toBe(2);
		expect(options.lineWidth).toBe(80);
		expect(options.defaultScalarStyle).toBe("plain");
		expect(options.defaultCollectionStyle).toBe("block");
		expect(options.sortKeys).toBe(false);
		expect(options.finalNewline).toBe(true);
		// Formatting-specific
		expect(options.preserveComments).toBe(true);
		expect(options.range).toBeUndefined();
	});

	it("accepts preserveComments: false", () => {
		const options = Schema.decodeUnknownSync(YamlFormattingOptions)({ preserveComments: false });
		expect(options.preserveComments).toBe(false);
	});

	it("accepts a range value", () => {
		const options = Schema.decodeUnknownSync(YamlFormattingOptions)({
			range: { offset: 10, length: 20 },
		});
		expect(options.range?.offset).toBe(10);
		expect(options.range?.length).toBe(20);
	});

	it("rejects invalid range (missing length)", () => {
		expect(() => Schema.decodeUnknownSync(YamlFormattingOptions)({ range: { offset: 0 } })).toThrow();
	});

	it("rejects negative indent", () => {
		expect(() => Schema.decodeUnknownSync(YamlFormattingOptions)({ indent: -1 })).toThrow();
	});

	it("rejects zero lineWidth", () => {
		expect(() => Schema.decodeUnknownSync(YamlFormattingOptions)({ lineWidth: 0 })).toThrow();
	});

	it("rejects negative lineWidth", () => {
		expect(() => Schema.decodeUnknownSync(YamlFormattingOptions)({ lineWidth: -1 })).toThrow();
	});

	it("rejects fractional lineWidth", () => {
		expect(() => Schema.decodeUnknownSync(YamlFormattingOptions)({ lineWidth: 80.5 })).toThrow();
	});
});

// ---------------------------------------------------------------------------
// YamlShared — YamlRange
// ---------------------------------------------------------------------------

describe("YamlRange", () => {
	it("constructs correctly", () => {
		const range = new YamlRange({ offset: 5, length: 10 });
		expect(range.offset).toBe(5);
		expect(range.length).toBe(10);
	});

	it("decodes from plain object", () => {
		const range = Schema.decodeUnknownSync(YamlRange)({ offset: 0, length: 42 });
		expect(range.offset).toBe(0);
		expect(range.length).toBe(42);
	});

	it("rejects missing fields", () => {
		expect(() => Schema.decodeUnknownSync(YamlRange)({ offset: 0 })).toThrow();
		expect(() => Schema.decodeUnknownSync(YamlRange)({ length: 5 })).toThrow();
	});

	it("rejects negative offset", () => {
		expect(() => Schema.decodeUnknownSync(YamlRange)({ offset: -1, length: 0 })).toThrow();
	});

	it("rejects negative length", () => {
		expect(() => Schema.decodeUnknownSync(YamlRange)({ offset: 0, length: -1 })).toThrow();
	});

	it("rejects fractional offset", () => {
		expect(() => Schema.decodeUnknownSync(YamlRange)({ offset: 1.5, length: 0 })).toThrow();
	});

	it("rejects fractional length", () => {
		expect(() => Schema.decodeUnknownSync(YamlRange)({ offset: 0, length: 2.5 })).toThrow();
	});
});

// ---------------------------------------------------------------------------
// YamlShared — YamlEdit
// ---------------------------------------------------------------------------

describe("YamlEdit", () => {
	it("constructs correctly", () => {
		const edit = new YamlEdit({ offset: 0, length: 3, content: "foo" });
		expect(edit.offset).toBe(0);
		expect(edit.length).toBe(3);
		expect(edit.content).toBe("foo");
	});

	it("decodes from plain object", () => {
		const edit = Schema.decodeUnknownSync(YamlEdit)({ offset: 5, length: 0, content: "bar" });
		expect(edit.content).toBe("bar");
	});

	it("rejects missing content", () => {
		expect(() => Schema.decodeUnknownSync(YamlEdit)({ offset: 0, length: 0 })).toThrow();
	});

	it("rejects negative offset", () => {
		expect(() => Schema.decodeUnknownSync(YamlEdit)({ offset: -1, length: 0, content: "" })).toThrow();
	});

	it("rejects negative length", () => {
		expect(() => Schema.decodeUnknownSync(YamlEdit)({ offset: 0, length: -1, content: "" })).toThrow();
	});

	it("rejects fractional offset", () => {
		expect(() => Schema.decodeUnknownSync(YamlEdit)({ offset: 0.5, length: 0, content: "" })).toThrow();
	});

	it("rejects fractional length", () => {
		expect(() => Schema.decodeUnknownSync(YamlEdit)({ offset: 0, length: 0.5, content: "" })).toThrow();
	});
});

// ---------------------------------------------------------------------------
// YamlShared — YamlPath type alias
// ---------------------------------------------------------------------------

describe("YamlPath", () => {
	it("is a ReadonlyArray of string | number", () => {
		const path: YamlPath = ["key", 0, "nested"];
		expect(path).toEqual(["key", 0, "nested"]);
	});
});
