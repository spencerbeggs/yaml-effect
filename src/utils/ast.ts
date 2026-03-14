/**
 * AST navigation utilities for traversing and inspecting YAML AST nodes.
 *
 * All functions support both direct and pipeline calling conventions via
 * `Fn.dual`.
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn, Option } from "effect";
import type { YamlNode } from "../schemas/YamlAstNodes.js";
import { YamlAlias, YamlMap, YamlPair, YamlScalar, YamlSeq } from "../schemas/YamlAstNodes.js";
import { YamlDocument } from "../schemas/YamlDocument.js";
import type { YamlPath } from "../schemas/YamlShared.js";

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the value is a {@link YamlScalar} instance.
 *
 * @public
 */
export function isScalar(node: unknown): node is YamlScalar {
	return node instanceof YamlScalar;
}

/**
 * Returns `true` if the value is a {@link YamlMap} instance.
 *
 * @public
 */
export function isMap(node: unknown): node is YamlMap {
	return node instanceof YamlMap;
}

/**
 * Returns `true` if the value is a {@link YamlSeq} instance.
 *
 * @public
 */
export function isSeq(node: unknown): node is YamlSeq {
	return node instanceof YamlSeq;
}

/**
 * Returns `true` if the value is a {@link YamlPair} instance.
 *
 * @public
 */
export function isPair(node: unknown): node is YamlPair {
	return node instanceof YamlPair;
}

/**
 * Returns `true` if the value is a {@link YamlAlias} instance.
 *
 * @public
 */
export function isAlias(node: unknown): node is YamlAlias {
	return node instanceof YamlAlias;
}

/**
 * Returns `true` if the value is any YAML AST node type.
 *
 * @public
 */
export function isNode(node: unknown): node is YamlNode {
	return isScalar(node) || isMap(node) || isSeq(node) || isAlias(node);
}

/**
 * Returns `true` if the value is a {@link YamlDocument} instance.
 *
 * @public
 */
export function isDocument(node: unknown): node is YamlDocument {
	return node instanceof YamlDocument;
}

// ---------------------------------------------------------------------------
// findNode
// ---------------------------------------------------------------------------

/**
 * Navigate to a node within the AST tree by following a path of string keys
 * (for mappings) and numeric indices (for sequences).
 *
 * @public
 */
export const findNode: {
	(path: YamlPath): (root: YamlNode) => Effect.Effect<Option.Option<YamlNode>>;
	(root: YamlNode, path: YamlPath): Effect.Effect<Option.Option<YamlNode>>;
} = Fn.dual(
	2,
	(root: YamlNode, path: YamlPath): Effect.Effect<Option.Option<YamlNode>> =>
		Effect.sync(() => {
			let current: YamlNode | null = root;

			for (const segment of path) {
				if (current === null) {
					return Option.none();
				}

				if (typeof segment === "string") {
					// Navigate by key — requires a YamlMap
					if (!(current instanceof YamlMap)) {
						return Option.none();
					}
					const pair: YamlPair | undefined = current.items.find((p: YamlPair) => {
						if (p.key instanceof YamlScalar && typeof p.key.value === "string") {
							return p.key.value === segment;
						}
						return false;
					});
					if (!pair || pair.value === null) {
						return Option.none();
					}
					current = pair.value;
				} else {
					// Navigate by index — requires a YamlSeq
					if (!(current instanceof YamlSeq)) {
						return Option.none();
					}
					const item: YamlNode | undefined = current.items[segment];
					if (item === undefined) {
						return Option.none();
					}
					current = item;
				}
			}

			return current === null ? Option.none() : Option.some(current);
		}),
);

// ---------------------------------------------------------------------------
// findNodeAtOffset
// ---------------------------------------------------------------------------

/**
 * Find the deepest AST node that contains the given character offset.
 *
 * @public
 */
export const findNodeAtOffset: {
	(offset: number): (root: YamlNode) => Effect.Effect<Option.Option<YamlNode>>;
	(root: YamlNode, offset: number): Effect.Effect<Option.Option<YamlNode>>;
} = Fn.dual(
	2,
	(root: YamlNode, offset: number): Effect.Effect<Option.Option<YamlNode>> =>
		Effect.sync(() => findDeepestAtOffset(root, offset)),
);

function containsOffset(node: YamlNode, offset: number): boolean {
	const nodeOffset = getOffset(node);
	const nodeLength = getLength(node);
	return offset >= nodeOffset && offset < nodeOffset + nodeLength;
}

function getOffset(node: YamlNode): number {
	if (node instanceof YamlScalar) return node.offset;
	if (node instanceof YamlMap) return node.offset;
	if (node instanceof YamlSeq) return node.offset;
	if (node instanceof YamlAlias) return node.offset;
	return 0;
}

function getLength(node: YamlNode): number {
	if (node instanceof YamlScalar) return node.length;
	if (node instanceof YamlMap) return node.length;
	if (node instanceof YamlSeq) return node.length;
	if (node instanceof YamlAlias) return node.length;
	return 0;
}

function findDeepestAtOffset(node: YamlNode, offset: number): Option.Option<YamlNode> {
	if (!containsOffset(node, offset)) {
		return Option.none();
	}

	// Try to go deeper into children
	if (node instanceof YamlMap) {
		for (const pair of node.items) {
			// Check key
			if (pair.key) {
				const keyResult = findDeepestAtOffset(pair.key, offset);
				if (Option.isSome(keyResult)) return keyResult;
			}
			// Check value
			if (pair.value) {
				const valResult = findDeepestAtOffset(pair.value, offset);
				if (Option.isSome(valResult)) return valResult;
			}
		}
	}

	if (node instanceof YamlSeq) {
		for (const item of node.items) {
			const itemResult = findDeepestAtOffset(item, offset);
			if (Option.isSome(itemResult)) return itemResult;
		}
	}

	// This node contains the offset but no child does — this is the deepest
	return Option.some(node);
}

// ---------------------------------------------------------------------------
// getNodePath
// ---------------------------------------------------------------------------

/**
 * Return the path segments leading to the node at the given offset.
 *
 * @public
 */
export const getNodePath: {
	(offset: number): (root: YamlNode) => Effect.Effect<Option.Option<YamlPath>>;
	(root: YamlNode, offset: number): Effect.Effect<Option.Option<YamlPath>>;
} = Fn.dual(
	2,
	(root: YamlNode, offset: number): Effect.Effect<Option.Option<YamlPath>> =>
		Effect.sync(() => {
			const path: Array<string | number> = [];
			const found = buildPath(root, offset, path);
			return found ? Option.some(path) : Option.none();
		}),
);

function buildPath(node: YamlNode, offset: number, path: Array<string | number>): boolean {
	if (!containsOffset(node, offset)) {
		return false;
	}

	if (node instanceof YamlMap) {
		for (const pair of node.items) {
			if (pair.key instanceof YamlScalar && typeof pair.key.value === "string") {
				// Check if the offset is in the key itself
				if (containsOffset(pair.key, offset)) {
					path.push(pair.key.value);
					return true;
				}
				// Check if the offset is in the value
				if (pair.value) {
					path.push(pair.key.value);
					if (buildPath(pair.value, offset, path)) {
						return true;
					}
					path.pop();
				}
			}
		}
	}

	if (node instanceof YamlSeq) {
		for (let i = 0; i < node.items.length; i++) {
			const item = node.items[i];
			if (containsOffset(item, offset)) {
				path.push(i);
				if (buildPath(item, offset, path)) {
					return true;
				}
				// The item itself is the target
				return true;
			}
		}
	}

	// The node itself is the target (leaf or no deeper match)
	return true;
}

// ---------------------------------------------------------------------------
// getNodeValue
// ---------------------------------------------------------------------------

/**
 * Extract the plain JavaScript value from a YAML AST node.
 *
 * - {@link YamlScalar} returns its `value` field.
 * - {@link YamlMap} returns a plain JS object built from its pairs.
 * - {@link YamlSeq} returns a plain JS array built from its items.
 * - {@link YamlAlias} returns the anchor name string (not resolved).
 *
 * @public
 */
export function getNodeValue(node: YamlNode): Effect.Effect<unknown> {
	return Effect.sync(() => extractValue(node));
}

function extractValue(node: YamlNode): unknown {
	if (node instanceof YamlScalar) {
		return node.value;
	}

	if (node instanceof YamlMap) {
		const obj: Record<string, unknown> = {};
		for (const pair of node.items) {
			const key = pair.key instanceof YamlScalar ? String(pair.key.value) : String(extractValue(pair.key));
			obj[key] = pair.value === null ? null : extractValue(pair.value);
		}
		return obj;
	}

	if (node instanceof YamlSeq) {
		return node.items.map((item) => extractValue(item));
	}

	if (node instanceof YamlAlias) {
		return node.name;
	}

	return null;
}
