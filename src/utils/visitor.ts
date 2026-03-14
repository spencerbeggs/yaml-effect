/**
 * SAX-style AST visitor for YAML documents.
 *
 * @remarks
 * `visit()` walks a YAML text string and emits a `Stream` of
 * {@link YamlVisitorEvent} values in document order.  `visitCollect()` is a
 * convenience wrapper that runs the stream to completion and returns only the
 * events matched by a caller-supplied predicate.
 *
 * @packageDocumentation
 */

import type { Option } from "effect";
import { Effect, Stream } from "effect";
import type { YamlComposerError } from "../errors/YamlComposerError.js";
import type { YamlNode, YamlPair } from "../schemas/YamlAstNodes.js";
import { YamlAlias, YamlMap, YamlScalar, YamlSeq } from "../schemas/YamlAstNodes.js";
import type { YamlDocument } from "../schemas/YamlDocument.js";
import type { YamlParseOptions } from "../schemas/YamlParseOptions.js";
import type { YamlVisitorEvent } from "../schemas/YamlVisitorEvent.js";
import {
	AliasEvent,
	CommentEvent,
	DirectiveEvent,
	DocumentEndEvent,
	DocumentStartEvent,
	MapEndEvent,
	MapStartEvent,
	PairEvent,
	ScalarEvent,
	SeqEndEvent,
	SeqStartEvent,
} from "../schemas/YamlVisitorEvent.js";
import { parseAllDocuments } from "./composer.js";

// ---------------------------------------------------------------------------
// Internal path type
// ---------------------------------------------------------------------------

type Path = ReadonlyArray<string | number>;

// ---------------------------------------------------------------------------
// walkNode — generator that yields events for a single AST node
// ---------------------------------------------------------------------------

/**
 * Generator that yields visitor events for a single AST node and its children.
 *
 * @privateRemarks
 * Dispatches on the runtime type of the node (YamlScalar, YamlAlias, YamlMap,
 * YamlSeq) and emits the appropriate start/end bracket events for collections.
 * Comments attached to nodes are emitted as CommentEvent before the node's own
 * event. For maps, iteration delegates to {@link walkPair} for each item. For
 * sequences, child nodes are recursively walked with an indexed path segment.
 *
 * @internal
 */
function* walkNode(node: YamlNode, path: Path, depth: number): Generator<YamlVisitorEvent> {
	if (node instanceof YamlScalar) {
		if (node.comment !== undefined) {
			yield new CommentEvent({ path, depth, text: node.comment });
		}
		yield new ScalarEvent({
			path,
			depth,
			value: node.value,
			style: node.style,
			...(node.tag !== undefined ? { tag: node.tag } : {}),
			...(node.anchor !== undefined ? { anchor: node.anchor } : {}),
		});
	} else if (node instanceof YamlAlias) {
		yield new AliasEvent({ path, depth, name: node.name });
	} else if (node instanceof YamlMap) {
		if (node.comment !== undefined) {
			yield new CommentEvent({ path, depth, text: node.comment });
		}
		yield new MapStartEvent({
			path,
			depth,
			style: node.style,
			...(node.tag !== undefined ? { tag: node.tag } : {}),
			...(node.anchor !== undefined ? { anchor: node.anchor } : {}),
		});
		for (const pair of node.items) {
			yield* walkPair(pair, path, depth + 1);
		}
		yield new MapEndEvent({ path, depth });
	} else if (node instanceof YamlSeq) {
		if (node.comment !== undefined) {
			yield new CommentEvent({ path, depth, text: node.comment });
		}
		yield new SeqStartEvent({
			path,
			depth,
			style: node.style,
			...(node.tag !== undefined ? { tag: node.tag } : {}),
			...(node.anchor !== undefined ? { anchor: node.anchor } : {}),
		});
		for (let i = 0; i < node.items.length; i++) {
			const item = node.items[i];
			const itemPath = [...path, i] as Path;
			yield* walkNode(item, itemPath, depth + 1);
		}
		yield new SeqEndEvent({ path, depth });
	}
}

// ---------------------------------------------------------------------------
// walkPair — generator that yields events for a key-value pair
// ---------------------------------------------------------------------------

/**
 * Generator that yields visitor events for a key-value pair in a mapping.
 *
 * @privateRemarks
 * Resolves the key and value to scalar values (or `null` for complex types)
 * and emits a PairEvent summarising the pair. Then walks into both the key
 * and value nodes to emit their full sub-events. The path is extended with
 * the string representation of the key so downstream consumers can track
 * the location of each event within the document.
 *
 * @internal
 */
function* walkPair(pair: YamlPair, parentPath: Path, depth: number): Generator<YamlVisitorEvent> {
	// Resolve the key scalar value (null for complex keys)
	const resolvedKey = pair.key instanceof YamlScalar ? pair.key.value : null;

	// Resolve the value scalar value.  Complex values (maps, sequences) resolve
	// to `null` here — consumers should walk the subsequent sub-events emitted
	// by `walkNode` to reconstruct the full structure.
	const resolvedValue = pair.value instanceof YamlScalar ? pair.value.value : null;

	// Build the path segment for this pair's key
	const keySegment: string | number =
		typeof resolvedKey === "string" ? resolvedKey : typeof resolvedKey === "number" ? resolvedKey : String(resolvedKey);

	const pairPath = [...parentPath, keySegment] as Path;

	if (pair.comment !== undefined) {
		yield new CommentEvent({ path: pairPath, depth, text: pair.comment });
	}

	yield new PairEvent({
		path: pairPath,
		depth,
		key: resolvedKey,
		value: resolvedValue,
	});

	// Walk into the key node — emits ScalarEvent for scalar keys, or
	// sub-events for complex keys (e.g., a YamlMap used as a key)
	yield* walkNode(pair.key, pairPath, depth + 1);

	// Walk into the value node — emits ScalarEvent for scalar values, or
	// sub-events for complex values (maps, sequences, aliases)
	if (pair.value !== null) {
		yield* walkNode(pair.value, pairPath, depth + 1);
	}
}

// ---------------------------------------------------------------------------
// walkDocument — generator that yields all events for a single document
// ---------------------------------------------------------------------------

/**
 * Generator that yields all visitor events for a single YAML document.
 *
 * @privateRemarks
 * Emits individual DirectiveEvent nodes for each directive, then wraps the
 * document contents in DocumentStartEvent / DocumentEndEvent. The root path
 * is an empty array and depth starts at 0. If the document has no contents
 * (empty document), only the start/end events are emitted.
 *
 * @internal
 */
function* walkDocument(doc: YamlDocument): Generator<YamlVisitorEvent> {
	const path: Path = [];
	const depth = 0;

	// Emit individual DirectiveEvent for each directive before the document
	for (const dir of doc.directives) {
		yield new DirectiveEvent({
			path,
			depth,
			name: dir.name,
			parameters: dir.parameters.join(" "),
		});
	}

	yield new DocumentStartEvent({
		path,
		depth,
		directives: [...doc.directives],
	});

	if (doc.comment !== undefined) {
		yield new CommentEvent({ path, depth, text: doc.comment });
	}

	if (doc.contents !== null) {
		yield* walkNode(doc.contents, path, depth);
	}

	yield new DocumentEndEvent({ path, depth });
}

// ---------------------------------------------------------------------------
// visit — public API
// ---------------------------------------------------------------------------

/**
 * Walk a YAML text string and emit a `Stream` of {@link YamlVisitorEvent}
 * values in document order.
 *
 * @remarks
 * The stream emits events for every node encountered during the traversal,
 * including `DocumentStartEvent`/`DocumentEndEvent` pairs, collection open/
 * close events, and leaf-node events for scalars and aliases.
 *
 * Multi-document YAML streams (separated by `---`) produce separate document
 * event pairs for each document.
 *
 * The returned stream is lazy — only events up to the point of consumption
 * are generated. This makes it safe to use with `Stream.take` or similar
 * operators for early termination.
 *
 * @example Streaming events and taking the first 5
 * ```typescript
 * import { Effect, Stream } from "effect"
 * import type { YamlVisitorEvent } from "yaml-effect"
 * import { visit } from "yaml-effect"
 *
 * const yaml = "name: John\nage: 30\ntags:\n  - admin\n  - user\n"
 *
 * const program = Effect.gen(function* () {
 *   const events: ReadonlyArray<YamlVisitorEvent> = yield* Stream.runCollect(
 *     visit(yaml).pipe(Stream.take(5)),
 *   ).pipe(Effect.map((chunk) => [...chunk]))
 *   return events
 * })
 * ```
 *
 * @param text - The YAML source text to visit.
 * @param options - Optional parse options forwarded to the composer.
 * @returns A `Stream` of `YamlVisitorEvent` values, failing with
 *   `YamlComposerError` on fatal parse errors.
 *
 * @public
 */
export function visit(
	text: string,
	options?: Partial<YamlParseOptions>,
): Stream.Stream<YamlVisitorEvent, YamlComposerError> {
	return Stream.fromEffect(parseAllDocuments(text, options)).pipe(
		Stream.flatMap((docs) =>
			Stream.fromIterable(
				(function* () {
					for (let i = 0; i < docs.length; i++) {
						yield* walkDocument(docs[i]);
					}
				})(),
			),
		),
	);
}

// ---------------------------------------------------------------------------
// visitCollect — convenience collector
// ---------------------------------------------------------------------------

/**
 * Walk a YAML text string and collect the results of applying `predicate` to
 * each {@link YamlVisitorEvent}.
 *
 * @remarks
 * Only events for which `predicate` returns `Option.some(value)` are included
 * in the result array.  Events that return `Option.none()` are silently
 * discarded.
 *
 * @example Collecting all scalar values from a document
 * ```typescript
 * import { Effect, Option } from "effect"
 * import { isScalarEvent, visitCollect } from "yaml-effect"
 *
 * const yaml = "name: John\nage: 30\n"
 *
 * const program = Effect.gen(function* () {
 *   const values: ReadonlyArray<unknown> = yield* visitCollect(
 *     yaml,
 *     (event) =>
 *       isScalarEvent(event) ? Option.some(event.value) : Option.none(),
 *   )
 *   // values contains: ["name", "John", "age", 30]
 *   return values
 * })
 * ```
 *
 * @typeParam A - The type of values extracted by the predicate.
 * @param text - The YAML source text to visit.
 * @param predicate - A function mapping each event to `Option.some(value)` to
 *   collect it or `Option.none()` to skip it.
 * @param options - Optional parse options forwarded to the composer.
 * @returns An `Effect` resolving to a `ReadonlyArray<A>` of collected values,
 *   failing with `YamlComposerError` on fatal parse errors.
 *
 * @public
 */
export function visitCollect<A>(
	text: string,
	predicate: (event: YamlVisitorEvent) => Option.Option<A>,
	options?: Partial<YamlParseOptions>,
): Effect.Effect<ReadonlyArray<A>, YamlComposerError> {
	return Stream.runCollect(visit(text, options).pipe(Stream.filterMap((event) => predicate(event)))).pipe(
		Effect.map((chunk) => [...chunk]),
	);
}
