/**
 * Tests for AST navigation utilities.
 *
 * @packageDocumentation
 */

import { Effect, Option, pipe } from "effect";
import { describe, expect, it } from "vitest";
import type { YamlMap, YamlScalar } from "../src/schemas/YamlAstNodes.js";
import { YamlAlias } from "../src/schemas/YamlAstNodes.js";
import {
	findNode,
	findNodeAtOffset,
	getNodePath,
	getNodeValue,
	isAlias,
	isDocument,
	isMap,
	isNode,
	isPair,
	isScalar,
	isSeq,
} from "../src/utils/ast.js";
import { parseDocument } from "../src/utils/composer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function doc(text: string) {
	return Effect.runSync(parseDocument(text));
}

function contents(text: string) {
	const d = doc(text);
	if (d.contents === null) throw new Error("No contents");
	return d.contents;
}

// ===========================================================================
// Type guards
// ===========================================================================

describe("Type guards", () => {
	it("isScalar identifies YamlScalar instances", () => {
		const node = contents("hello");
		expect(isScalar(node)).toBe(true);
		expect(isMap(node)).toBe(false);
		expect(isSeq(node)).toBe(false);
		expect(isAlias(node)).toBe(false);
	});

	it("isMap identifies YamlMap instances", () => {
		const node = contents("a: 1");
		expect(isMap(node)).toBe(true);
		expect(isScalar(node)).toBe(false);
	});

	it("isSeq identifies YamlSeq instances", () => {
		const node = contents("- 1\n- 2");
		expect(isSeq(node)).toBe(true);
		expect(isMap(node)).toBe(false);
	});

	it("isPair identifies YamlPair instances", () => {
		const map = contents("a: 1") as InstanceType<typeof YamlMap>;
		expect(isPair(map.items[0])).toBe(true);
		expect(isPair(map)).toBe(false);
	});

	it("isNode returns true for any AST node", () => {
		expect(isNode(contents("hello"))).toBe(true);
		expect(isNode(contents("a: 1"))).toBe(true);
		expect(isNode(contents("- 1"))).toBe(true);
		expect(isNode("not a node")).toBe(false);
		expect(isNode(null)).toBe(false);
		expect(isNode(42)).toBe(false);
	});

	it("isDocument identifies YamlDocument instances", () => {
		const d = doc("hello");
		expect(isDocument(d)).toBe(true);
		expect(isDocument(contents("hello"))).toBe(false);
		expect(isDocument(null)).toBe(false);
	});

	it("isAlias identifies YamlAlias instances", () => {
		// Build an alias node directly since aliases require anchors
		const alias = new YamlAlias({ name: "foo", offset: 0, length: 4 });
		expect(isAlias(alias)).toBe(true);
		expect(isAlias(contents("hello"))).toBe(false);
	});
});

// ===========================================================================
// findNode
// ===========================================================================

describe("findNode", () => {
	it("navigates mapping by key string", () => {
		const root = contents("a: 1\nb: 2");
		const result = Effect.runSync(findNode(root, ["b"]));
		expect(Option.isSome(result)).toBe(true);
		const node = Option.getOrThrow(result);
		expect(isScalar(node)).toBe(true);
		expect((node as InstanceType<typeof YamlScalar>).value).toBe(2);
	});

	it("navigates nested mappings", () => {
		const root = contents("a:\n  b:\n    c: 42");
		const result = Effect.runSync(findNode(root, ["a", "b", "c"]));
		expect(Option.isSome(result)).toBe(true);
		const node = Option.getOrThrow(result);
		expect((node as InstanceType<typeof YamlScalar>).value).toBe(42);
	});

	it("navigates sequences by index", () => {
		const root = contents("- 10\n- 20\n- 30");
		const result = Effect.runSync(findNode(root, [1]));
		expect(Option.isSome(result)).toBe(true);
		const node = Option.getOrThrow(result);
		expect((node as InstanceType<typeof YamlScalar>).value).toBe(20);
	});

	it("navigates mixed mapping and sequence paths", () => {
		const root = contents("a:\n  b: 1\n  c:\n    - x\n    - y");
		// Navigate: root map -> "a" -> map -> "c" -> seq -> index 1
		const result = Effect.runSync(findNode(root, ["a", "c", 1]));
		expect(Option.isSome(result)).toBe(true);
		const node = Option.getOrThrow(result);
		expect((node as InstanceType<typeof YamlScalar>).value).toBe("y");
	});

	it("returns none for missing key", () => {
		const root = contents("a: 1");
		const result = Effect.runSync(findNode(root, ["missing"]));
		expect(Option.isNone(result)).toBe(true);
	});

	it("returns none for out-of-bounds index", () => {
		const root = contents("- 1\n- 2");
		const result = Effect.runSync(findNode(root, [99]));
		expect(Option.isNone(result)).toBe(true);
	});

	it("returns none when navigating key on non-map", () => {
		const root = contents("- 1\n- 2");
		const result = Effect.runSync(findNode(root, ["key"]));
		expect(Option.isNone(result)).toBe(true);
	});

	it("returns none when navigating index on non-seq", () => {
		const root = contents("a: 1");
		const result = Effect.runSync(findNode(root, [0]));
		expect(Option.isNone(result)).toBe(true);
	});

	it("returns the root with empty path", () => {
		const root = contents("a: 1");
		const result = Effect.runSync(findNode(root, []));
		expect(Option.isSome(result)).toBe(true);
		const node = Option.getOrThrow(result);
		expect(node).toBe(root);
	});

	it("supports pipeline style via Function.dual", () => {
		const root = contents("a: 1\nb: 2");
		const result = Effect.runSync(pipe(root, findNode(["b"])));
		expect(Option.isSome(result)).toBe(true);
		const node = Option.getOrThrow(result);
		expect((node as InstanceType<typeof YamlScalar>).value).toBe(2);
	});
});

// ===========================================================================
// findNodeAtOffset
// ===========================================================================

describe("findNodeAtOffset", () => {
	it("finds the deepest node at a given offset", () => {
		const root = contents("a: 1");
		// offset 0 should be the key "a"
		const result = Effect.runSync(findNodeAtOffset(root, 0));
		expect(Option.isSome(result)).toBe(true);
		const node = Option.getOrThrow(result);
		expect(isScalar(node)).toBe(true);
	});

	it("returns none for offset outside the root", () => {
		const root = contents("a: 1");
		const result = Effect.runSync(findNodeAtOffset(root, 9999));
		expect(Option.isNone(result)).toBe(true);
	});

	it("supports pipeline style", () => {
		const root = contents("a: 1");
		const result = Effect.runSync(pipe(root, findNodeAtOffset(0)));
		expect(Option.isSome(result)).toBe(true);
	});
});

// ===========================================================================
// getNodePath
// ===========================================================================

describe("getNodePath", () => {
	it("returns the path to a node at an offset", () => {
		const root = contents("a: 1\nb: 2");
		// "b" key starts after "a: 1\n" = offset 5
		const result = Effect.runSync(getNodePath(root, 5));
		expect(Option.isSome(result)).toBe(true);
		const path = Option.getOrThrow(result);
		expect(path).toContain("b");
	});

	it("returns none for offset outside the root", () => {
		const root = contents("a: 1");
		const result = Effect.runSync(getNodePath(root, 9999));
		expect(Option.isNone(result)).toBe(true);
	});

	it("supports pipeline style", () => {
		const root = contents("a: 1");
		const result = Effect.runSync(pipe(root, getNodePath(0)));
		expect(Option.isSome(result)).toBe(true);
	});
});

// ===========================================================================
// getNodeValue
// ===========================================================================

describe("getNodeValue", () => {
	it("extracts scalar value", () => {
		const node = contents("42");
		const result = Effect.runSync(getNodeValue(node));
		expect(result).toBe(42);
	});

	it("extracts string scalar value", () => {
		const node = contents("hello");
		const result = Effect.runSync(getNodeValue(node));
		expect(result).toBe("hello");
	});

	it("extracts map as plain object", () => {
		const node = contents("a: 1\nb: 2");
		const result = Effect.runSync(getNodeValue(node));
		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("extracts seq as plain array", () => {
		const node = contents("- 1\n- 2\n- 3");
		const result = Effect.runSync(getNodeValue(node));
		expect(result).toEqual([1, 2, 3]);
	});

	it("extracts alias as anchor name", () => {
		const alias = new YamlAlias({ name: "myanchor", offset: 0, length: 9 });
		const result = Effect.runSync(getNodeValue(alias));
		expect(result).toBe("myanchor");
	});

	it("extracts nested structures", () => {
		const node = contents("a:\n  b: 1\n  c:\n    - 2\n    - 3");
		const result = Effect.runSync(getNodeValue(node));
		expect(result).toEqual({ a: { b: 1, c: [2, 3] } });
	});
});
