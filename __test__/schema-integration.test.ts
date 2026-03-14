/**
 * Tests for bidirectional Schema integration.
 *
 * @packageDocumentation
 */

import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { YamlDocument } from "../src/schemas/YamlDocument.js";
import {
	YamlAllFromString,
	YamlFromString,
	makeYamlAllFromString,
	makeYamlDocumentSchema,
	makeYamlFromString,
	makeYamlSchema,
} from "../src/utils/schema-integration.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decode<A, I>(schema: Schema.Schema<A, I>, input: I): A {
	return Effect.runSync(Schema.decode(schema)(input));
}

function encode<A, I>(schema: Schema.Schema<A, I>, value: A): I {
	return Effect.runSync(Schema.encode(schema)(value));
}

// ===========================================================================
// YamlFromString
// ===========================================================================

describe("YamlFromString", () => {
	it("decodes a YAML string to unknown", () => {
		const result = decode(YamlFromString, "a: 1\nb: true");
		expect(result).toEqual({ a: 1, b: true });
	});

	it("decodes a YAML scalar string", () => {
		const result = decode(YamlFromString, "42");
		expect(result).toBe(42);
	});

	it("encodes unknown to a YAML string", () => {
		const result = encode(YamlFromString, { a: 1 });
		expect(typeof result).toBe("string");
		expect(result).toContain("a:");
		expect(result).toContain("1");
	});

	it("handles edge-case YAML input — empty string decodes to null", () => {
		const result = Effect.runSync(Schema.decode(YamlFromString)(""));
		expect(result).toBeNull();
	});
});

// ===========================================================================
// makeYamlFromString
// ===========================================================================

describe("makeYamlFromString", () => {
	it("creates a schema with custom parse options", () => {
		const schema = makeYamlFromString({ strict: true });
		const result = decode(schema, "hello: world");
		expect(result).toEqual({ hello: "world" });
	});

	it("creates a schema with custom stringify options", () => {
		const schema = makeYamlFromString(undefined, { indent: 4 });
		const result = encode(schema, { a: { b: 1 } });
		expect(typeof result).toBe("string");
	});

	it("creates a schema with both options", () => {
		const schema = makeYamlFromString({ strict: false }, { sortKeys: true });
		const result = decode(schema, "b: 2\na: 1");
		expect(result).toEqual({ b: 2, a: 1 });
	});
});

// ===========================================================================
// makeYamlSchema
// ===========================================================================

describe("makeYamlSchema", () => {
	const PersonSchema = Schema.Struct({
		name: Schema.String,
		age: Schema.Number,
	});

	it("decodes YAML string into typed value", () => {
		const schema = makeYamlSchema(PersonSchema);
		const result = decode(schema, "name: Alice\nage: 30");
		expect(result).toEqual({ name: "Alice", age: 30 });
	});

	it("encodes typed value back to YAML string", () => {
		const schema = makeYamlSchema(PersonSchema);
		const result = encode(schema, { name: "Bob", age: 25 });
		expect(typeof result).toBe("string");
		expect(result).toContain("name:");
		expect(result).toContain("Bob");
	});

	it("fails when YAML does not match target schema shape", () => {
		const schema = makeYamlSchema(PersonSchema);
		const effect = Schema.decode(schema)("name: Alice");
		expect(() => Effect.runSync(effect)).toThrow();
	});

	it("supports custom parse and stringify options", () => {
		const schema = makeYamlSchema(PersonSchema, {
			stringifyOptions: { sortKeys: true },
		});
		const result = decode(schema, "name: Charlie\nage: 40");
		expect(result).toEqual({ name: "Charlie", age: 40 });
	});

	it("roundtrip: decode then encode preserves data", () => {
		const schema = makeYamlSchema(PersonSchema);
		const input = "name: Dana\nage: 35";
		const decoded = decode(schema, input);
		const encoded = encode(schema, decoded);
		const reDecoded = decode(schema, encoded);
		expect(reDecoded).toEqual(decoded);
	});
});

// ===========================================================================
// YamlAllFromString
// ===========================================================================

describe("YamlAllFromString", () => {
	it("decodes multi-document YAML to array", () => {
		const result = decode(YamlAllFromString, "---\na: 1\n---\nb: 2");
		expect(result).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("decodes single-document YAML to single-element array", () => {
		const result = decode(YamlAllFromString, "key: value");
		expect(result).toEqual([{ key: "value" }]);
	});

	it("encodes array of values to multi-document YAML", () => {
		const yaml = encode(YamlAllFromString, [{ a: 1 }, { b: 2 }]);
		expect(yaml).toContain("a: 1");
		expect(yaml).toContain("---");
		expect(yaml).toContain("b: 2");
	});

	it("encodes empty array to empty string", () => {
		const yaml = encode(YamlAllFromString, []);
		expect(yaml).toBe("");
	});
});

// ===========================================================================
// makeYamlAllFromString
// ===========================================================================

describe("makeYamlAllFromString", () => {
	it("accepts custom parse options", () => {
		const schema = makeYamlAllFromString({ strict: false });
		const result = decode(schema, "a: 1");
		expect(result).toEqual([{ a: 1 }]);
	});
});

// ===========================================================================
// makeYamlDocumentSchema
// ===========================================================================

describe("makeYamlDocumentSchema", () => {
	it("decodes YAML to YamlDocument preserving structure", () => {
		const schema = makeYamlDocumentSchema();
		const doc = decode(schema, "key: value");
		expect(doc).toBeInstanceOf(YamlDocument);
		expect(doc.contents).not.toBeNull();
		expect(doc.errors).toEqual([]);
	});

	it("encodes YamlDocument back to YAML string", () => {
		const schema = makeYamlDocumentSchema();
		const doc = decode(schema, "key: value");
		const yaml = encode(schema, doc);
		expect(typeof yaml).toBe("string");
		expect(yaml).toContain("key");
	});

	it("preserves directives", () => {
		const schema = makeYamlDocumentSchema();
		const doc = decode(schema, "%YAML 1.2\n---\na: 1");
		expect(doc.directives.length).toBeGreaterThan(0);
	});
});
