/**
 * SAX-style CST visitor for YAML documents.
 *
 * @remarks
 * `visitCST()` walks YAML source text and emits a `Stream` of
 * {@link YamlCstVisitorEvent} values in document order.  `visitCSTCollect()`
 * is a convenience wrapper that runs the stream to completion and returns only
 * the events matched by a caller-supplied predicate.
 *
 * All content is delivered as raw source strings — no type resolution occurs
 * at the CST level.  CST-level parse errors are surfaced as
 * {@link CstErrorEvent} nodes rather than stream failures, so the error
 * channel is always `never`.
 *
 * ### CST structure notes
 *
 * The parser produces a CST where block-map nodes do NOT include their first
 * key scalar.  Instead, the first key of a block mapping appears as a sibling
 * node (at the parent level) immediately before the block-map node that holds
 * the `:` indicator and value.  This means:
 *
 * For `name: John`, the document children are:
 * - `flow-scalar("name")` — the key (outside the block-map)
 * - `block-map(": John")` — children start with whitespace(":") then the value
 *
 * The visitor detects this "scalar → block-map" sibling pattern and emits the
 * scalar as a `CstKeyEvent`.  Inside a block-map, the first non-trivia scalar
 * is always a value; scalars then alternate as key/value pairs for subsequent
 * entries.
 *
 * @packageDocumentation
 */

import type { Option } from "effect";
import { Effect, Stream } from "effect";
import type { CstNode } from "../schemas/CstNode.js";
import type { YamlCstVisitorEvent } from "../schemas/YamlCstVisitorEvent.js";
import {
	CstAliasEvent,
	CstCommentEvent,
	CstDirectiveEvent,
	CstDocumentEndEvent,
	CstDocumentStartEvent,
	CstErrorEvent,
	CstKeyEvent,
	CstMapEndEvent,
	CstMapStartEvent,
	CstScalarEvent,
	CstSeqEndEvent,
	CstSeqStartEvent,
	CstValueEvent,
} from "../schemas/YamlCstVisitorEvent.js";
import { parseCSTAll } from "./parser.js";

// ---------------------------------------------------------------------------
// Internal path type
// ---------------------------------------------------------------------------

type Path = ReadonlyArray<string | number>;

// ---------------------------------------------------------------------------
// Node classification helpers
// ---------------------------------------------------------------------------

/**
 * Test whether a CST node is structural trivia (whitespace, newline, anchor, or tag).
 *
 * @privateRemarks
 * Trivia nodes are skipped during traversal — they carry no semantic content
 * and are only meaningful for source fidelity. Anchors and tags are classified
 * as trivia here because they are metadata attached to the following content
 * node rather than standalone events.
 *
 * @internal
 */
function isTriviaCstNode(node: CstNode): boolean {
	return node.type === "whitespace" || node.type === "newline" || node.type === "anchor" || node.type === "tag";
}

/**
 * Test whether a CST node is a scalar (flow-scalar or block-scalar).
 *
 * @privateRemarks
 * Both flow and block scalars carry raw source text. The distinction matters
 * for the parser but not for the visitor's key/value classification logic.
 *
 * @internal
 */
function isScalarCstNode(node: CstNode): boolean {
	return node.type === "flow-scalar" || node.type === "block-scalar";
}

/**
 * Test whether a CST node is specifically a block-map.
 *
 * @privateRemarks
 * Distinguished from {@link isMapCstNode} because the "scalar followed by
 * block-map" sibling pattern only applies to block maps, not flow maps.
 *
 * @internal
 */
function isBlockMapCstNode(node: CstNode): boolean {
	return node.type === "block-map";
}

/**
 * Test whether a CST node is any kind of map (block-map or flow-map).
 *
 * @privateRemarks
 * Used when the traversal needs to emit MapStart/MapEnd events regardless
 * of the map's block vs flow representation.
 *
 * @internal
 */
function isMapCstNode(node: CstNode): boolean {
	return node.type === "block-map" || node.type === "flow-map";
}

/**
 * Test whether a CST node is any kind of sequence (block-seq or flow-seq).
 *
 * @privateRemarks
 * Sequences are walked via {@link walkSiblings} for their children, as
 * sequence entries do not have the key/value alternation of maps.
 *
 * @internal
 */
function isSeqCstNode(node: CstNode): boolean {
	return node.type === "block-seq" || node.type === "flow-seq";
}

// ---------------------------------------------------------------------------
// walkSiblings — walk a flat list of sibling nodes, handling the
// "scalar → block-map" pattern for block mapping key detection
// ---------------------------------------------------------------------------

/**
 * Walk an ordered list of sibling CST nodes, emitting events.
 *
 * This is the core traversal used for document-level children and for
 * sequence entry content.  It detects the "scalar immediately followed by a
 * block-map sibling" pattern and emits the scalar as a {@link CstKeyEvent},
 * then walks the block-map as a continuation of the same mapping pair.
 *
 * All other scalars in this context are emitted as {@link CstScalarEvent}.
 *
 * @privateRemarks
 * This function is the entry point for both document-level and sequence-level
 * children. It does not maintain key/value alternation state — that logic
 * lives in {@link walkBlockMapChildren} and {@link walkFlowMapChildren}. The
 * look-ahead via {@link findNextContent} is intentionally limited to one node
 * because the CST guarantees that a block-map immediately follows its key
 * scalar without intervening content nodes.
 *
 * @internal
 */
function* walkSiblings(nodes: ReadonlyArray<CstNode>, path: Path, depth: number): Generator<YamlCstVisitorEvent> {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node === undefined) continue;

		// Skip trivia
		if (isTriviaCstNode(node)) continue;

		if (node.type === "comment") {
			yield new CstCommentEvent({ path, depth, source: node.source });
			continue;
		}

		if (node.type === "directive") {
			yield new CstDirectiveEvent({ path, depth, source: node.source });
			continue;
		}

		if (node.type === "error") {
			yield new CstErrorEvent({ path, depth, source: node.source });
			continue;
		}

		if (node.type === "alias") {
			yield new CstAliasEvent({ path, depth, source: node.source });
			continue;
		}

		if (isScalarCstNode(node)) {
			// Look ahead: if the next non-trivia sibling is a block-map, this
			// scalar is the key for that mapping.
			const nextContent = findNextContent(nodes, i + 1);
			if (nextContent !== undefined && isBlockMapCstNode(nextContent)) {
				// Emit the scalar as a key event
				yield new CstKeyEvent({ path, depth, source: node.source });
				// Skip to the block-map (it will be picked up in the next iteration)
			} else {
				yield new CstScalarEvent({ path, depth, source: node.source });
			}
			continue;
		}

		if (isMapCstNode(node)) {
			yield new CstMapStartEvent({ path, depth, source: node.source });
			if (node.type === "block-map") {
				// Block-map children: first scalar is the value for the key
				// that appeared as the previous sibling. Subsequent scalars
				// alternate as key, value, key, value...
				yield* walkBlockMapChildren(node.children ?? [], path, depth + 1);
			} else {
				// flow-map: key/value alternation starting with key
				yield* walkFlowMapChildren(node.children ?? [], path, depth + 1);
			}
			yield new CstMapEndEvent({ path, depth });
			continue;
		}

		if (isSeqCstNode(node)) {
			yield new CstSeqStartEvent({ path, depth, source: node.source });
			yield* walkSiblings(node.children ?? [], path, depth + 1);
			yield new CstSeqEndEvent({ path, depth });
		}
	}
}

// ---------------------------------------------------------------------------
// findNextContent — look ahead past trivia to the next content node
// ---------------------------------------------------------------------------

/**
 * Look ahead past trivia and comment nodes to find the next content node.
 *
 * @privateRemarks
 * Used by {@link walkSiblings} and {@link walkBlockMapChildren} to detect
 * the "scalar followed by block-map" pattern. Returns `undefined` when no
 * content node exists after `startIdx`, which means the scalar is a
 * standalone value rather than a mapping key.
 *
 * @internal
 */
function findNextContent(nodes: ReadonlyArray<CstNode>, startIdx: number): CstNode | undefined {
	for (let i = startIdx; i < nodes.length; i++) {
		const node = nodes[i];
		if (node !== undefined && !isTriviaCstNode(node) && node.type !== "comment") {
			return node;
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// walkBlockMapChildren — the block-map's own children
// ---------------------------------------------------------------------------

/**
 * Walk children of a `block-map` node.
 *
 * Because the first key is emitted as a sibling before the block-map node,
 * the block-map's children start with the `:` indicator (whitespace) and then
 * the first value.  After the first value, scalars alternate as key/value
 * pairs for remaining entries.
 *
 * State machine:
 * - `expectingKey = false` initially (first non-trivia scalar is a value)
 * - After each value scalar or collection value, toggle to expecting a key
 * - After each key scalar, toggle to expecting a value
 *
 * @privateRemarks
 * The `expectingKey` flag starts as `false` because the first key has already
 * been consumed by the parent {@link walkSiblings} call and emitted as a
 * CstKeyEvent. Nested block-maps are handled recursively; after a nested
 * map is fully walked, the state resets to expecting a key for the next
 * entry. The look-ahead for "scalar → block-map" applies here too, to
 * detect nested mapping keys within the same block-map.
 *
 * @internal
 */
function* walkBlockMapChildren(
	children: ReadonlyArray<CstNode>,
	path: Path,
	depth: number,
): Generator<YamlCstVisitorEvent> {
	// Start expecting a value, because the key was consumed as a sibling of
	// the block-map node (outside the block-map).
	let expectingKey = false;

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child === undefined) continue;

		// Always emit comments
		if (child.type === "comment") {
			yield new CstCommentEvent({ path, depth, source: child.source });
			continue;
		}

		// Skip trivia
		if (isTriviaCstNode(child)) {
			continue;
		}

		if (child.type === "directive") {
			yield new CstDirectiveEvent({ path, depth, source: child.source });
			continue;
		}

		if (child.type === "error") {
			yield new CstErrorEvent({ path, depth, source: child.source });
			continue;
		}

		if (isScalarCstNode(child)) {
			// Look ahead to detect if this scalar is followed by a block-map
			// (meaning it is a key for a nested mapping).
			const nextContent = findNextContent(children, i + 1);
			if (!expectingKey && nextContent !== undefined && isBlockMapCstNode(nextContent)) {
				// This scalar is a key for a nested block-map that follows.
				// The nested map's first value will be the value for this key.
				yield new CstKeyEvent({ path, depth, source: child.source });
				// expectingKey stays false because the nested block-map will
				// handle the value; after the nested map we'll be back to
				// expecting a key (reset in the isMapCstNode branch).
				// Actually: expectingKey was false, and this is a key, so after
				// emitting the key event we should remain expecting value (false).
				// The nested block-map will consume the value. Don't toggle here.
			} else if (expectingKey) {
				yield new CstKeyEvent({ path, depth, source: child.source });
				expectingKey = false;
			} else {
				yield new CstValueEvent({ path, depth, source: child.source });
				expectingKey = true;
			}
			continue;
		}

		if (isBlockMapCstNode(child)) {
			// Nested block-map: it's the value for the key just emitted.
			yield new CstMapStartEvent({ path, depth, source: child.source });
			yield* walkBlockMapChildren(child.children ?? [], path, depth + 1);
			yield new CstMapEndEvent({ path, depth });
			// After a nested block-map value, next scalar is a key
			expectingKey = true;
			continue;
		}

		if (isMapCstNode(child)) {
			// flow-map as value
			yield new CstMapStartEvent({ path, depth, source: child.source });
			yield* walkFlowMapChildren(child.children ?? [], path, depth + 1);
			yield new CstMapEndEvent({ path, depth });
			expectingKey = true;
			continue;
		}

		if (isSeqCstNode(child)) {
			yield new CstSeqStartEvent({ path, depth, source: child.source });
			yield* walkSiblings(child.children ?? [], path, depth + 1);
			yield new CstSeqEndEvent({ path, depth });
			expectingKey = true;
			continue;
		}

		if (child.type === "alias") {
			yield new CstAliasEvent({ path, depth, source: child.source });
			// Alias is a value; next scalar is a key
			expectingKey = true;
		}
	}
}

// ---------------------------------------------------------------------------
// walkFlowMapChildren — flow-map children (key/value start with key)
// ---------------------------------------------------------------------------

/**
 * Walk children of a `flow-map` node.
 *
 * Flow maps include all their content (including the opening `{` key scalars,
 * `:` separators, and closing `}`) as children.  All structural punctuation
 * is typed as `whitespace`.  Scalars alternate key/value starting with key.
 *
 * @privateRemarks
 * Unlike block maps, flow maps contain their own keys as children, so
 * `expectingKey` starts as `true`. Structural punctuation (`{`, `}`, `:`,
 * `,`) is classified as `whitespace` by the CST parser and skipped as
 * trivia. Nested collections (maps or sequences) found in the value
 * position reset the state to expecting a key after they are fully walked.
 *
 * @internal
 */
function* walkFlowMapChildren(
	children: ReadonlyArray<CstNode>,
	path: Path,
	depth: number,
): Generator<YamlCstVisitorEvent> {
	let expectingKey = true;

	for (const child of children) {
		// Always emit comments
		if (child.type === "comment") {
			yield new CstCommentEvent({ path, depth, source: child.source });
			continue;
		}

		// Skip trivia (includes structural whitespace like "{", "}", ":", ",")
		if (isTriviaCstNode(child)) {
			continue;
		}

		if (child.type === "error") {
			yield new CstErrorEvent({ path, depth, source: child.source });
			continue;
		}

		if (isScalarCstNode(child)) {
			if (expectingKey) {
				yield new CstKeyEvent({ path, depth, source: child.source });
				expectingKey = false;
			} else {
				yield new CstValueEvent({ path, depth, source: child.source });
				expectingKey = true;
			}
			continue;
		}

		if (isMapCstNode(child)) {
			yield new CstMapStartEvent({ path, depth, source: child.source });
			if (child.type === "block-map") {
				yield* walkBlockMapChildren(child.children ?? [], path, depth + 1);
			} else {
				yield* walkFlowMapChildren(child.children ?? [], path, depth + 1);
			}
			yield new CstMapEndEvent({ path, depth });
			expectingKey = true;
			continue;
		}

		if (isSeqCstNode(child)) {
			yield new CstSeqStartEvent({ path, depth, source: child.source });
			yield* walkSiblings(child.children ?? [], path, depth + 1);
			yield new CstSeqEndEvent({ path, depth });
			expectingKey = true;
			continue;
		}

		if (child.type === "alias") {
			yield new CstAliasEvent({ path, depth, source: child.source });
			expectingKey = true;
		}
	}
}

// ---------------------------------------------------------------------------
// walkDocument — generator that yields all events for a single document node
// ---------------------------------------------------------------------------

/**
 * Generator that yields all CST visitor events for a single document node.
 *
 * @privateRemarks
 * Wraps the document's children in CstDocumentStartEvent / CstDocumentEndEvent
 * and delegates child traversal to {@link walkSiblings}. The root path is an
 * empty array, and child depth starts at 1 (the document itself is at depth 0).
 *
 * @internal
 */
function* walkDocument(doc: CstNode): Generator<YamlCstVisitorEvent> {
	const path: Path = [];
	const depth = 0;

	yield new CstDocumentStartEvent({ path, depth });
	yield* walkSiblings(doc.children ?? [], path, depth + 1);
	yield new CstDocumentEndEvent({ path, depth });
}

// ---------------------------------------------------------------------------
// visitCST — public API
// ---------------------------------------------------------------------------

/**
 * Walk YAML source text at the CST level and emit a `Stream` of
 * {@link YamlCstVisitorEvent} values in document order.
 *
 * @remarks
 * The stream emits events for every CST node encountered during traversal,
 * including `CstDocumentStartEvent`/`CstDocumentEndEvent` pairs, collection
 * open/close events, and leaf-node events for scalars, aliases, comments, and
 * directives.
 *
 * All content is delivered as raw source strings — `true` is still the string
 * `"true"`.  CST-level errors are surfaced as {@link CstErrorEvent} nodes; the
 * error channel is always `never`.
 *
 * @example Streaming CST events
 * ```typescript
 * import { Effect, Stream } from "effect"
 * import type { YamlCstVisitorEvent } from "yaml-effect"
 * import { visitCST } from "yaml-effect"
 *
 * const yaml = "name: John\nage: 30\n"
 *
 * const program = Effect.gen(function* () {
 *   const events: ReadonlyArray<YamlCstVisitorEvent> = yield* Stream.runCollect(
 *     visitCST(yaml),
 *   ).pipe(Effect.map((chunk) => [...chunk]))
 *   return events
 * })
 * ```
 *
 * @param text - The YAML source text to visit.
 * @returns A `Stream` of `YamlCstVisitorEvent` values, never failing.
 *
 * @public
 */
export function visitCST(text: string): Stream.Stream<YamlCstVisitorEvent, never> {
	return Stream.fromEffect(parseCSTAll(text)).pipe(
		Stream.flatMap((docs) =>
			Stream.fromIterable(
				(function* () {
					for (const doc of docs) {
						yield* walkDocument(doc);
					}
				})(),
			),
		),
	);
}

// ---------------------------------------------------------------------------
// visitCSTCollect — convenience collector
// ---------------------------------------------------------------------------

/**
 * Walk YAML source text at the CST level and collect the results of applying
 * `predicate` to each {@link YamlCstVisitorEvent}.
 *
 * @remarks
 * Only events for which `predicate` returns `Option.some(value)` are included
 * in the result array.  Events that return `Option.none()` are silently
 * discarded.
 *
 * @example Collecting all CST keys from a document
 * ```typescript
 * import { Effect, Option } from "effect"
 * import { isCstKeyEvent, visitCSTCollect } from "yaml-effect"
 *
 * const yaml = "name: John\nage: 30\n"
 *
 * const program = Effect.gen(function* () {
 *   const keys: ReadonlyArray<string> = yield* visitCSTCollect(
 *     yaml,
 *     (event) =>
 *       isCstKeyEvent(event) ? Option.some(event.source) : Option.none(),
 *   )
 *   // keys contains the raw source strings: ["name", "age"]
 *   return keys
 * })
 * ```
 *
 * @typeParam A - The type of values extracted by the predicate.
 * @param text - The YAML source text to visit.
 * @param predicate - A function mapping each event to `Option.some(value)` to
 *   collect it or `Option.none()` to skip it.
 * @returns An `Effect` resolving to a `ReadonlyArray<A>` of collected values,
 *   never failing.
 *
 * @public
 */
export function visitCSTCollect<A>(
	text: string,
	predicate: (event: YamlCstVisitorEvent) => Option.Option<A>,
): Effect.Effect<ReadonlyArray<A>, never> {
	return Stream.runCollect(visitCST(text).pipe(Stream.filterMap((event) => predicate(event)))).pipe(
		Effect.map((chunk) => [...chunk]),
	);
}
