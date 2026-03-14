/**
 * SAX-style visitor event schemas for the YAML AST walker.
 *
 * @remarks
 * Each event is a {@link Schema.TaggedClass} carrying the visitor `path` (an
 * ordered list of string keys / numeric indices from the document root to the
 * current node) and `depth` (the zero-based nesting level).  All eleven event
 * types are collected into the {@link YamlVisitorEvent} discriminated union and
 * individual type-guard helpers are exported for each variant.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { YamlDirective } from "./YamlDocument.js";
import { CollectionStyle, ScalarStyle } from "./YamlShared.js";

// ---------------------------------------------------------------------------
// Shared field definitions
// ---------------------------------------------------------------------------

const PathField = Schema.Array(Schema.Union(Schema.String, Schema.Number));
const DepthField = Schema.Int.pipe(Schema.nonNegative());

// ---------------------------------------------------------------------------
// DocumentStartEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor enters a YAML document node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `directives` — {@link YamlDirective} entries declared before the document
 *   content (e.g., `%YAML 1.2`).
 *
 * @public
 */
export class DocumentStartEvent extends Schema.TaggedClass<DocumentStartEvent>()("DocumentStartEvent", {
	path: PathField,
	depth: DepthField,
	directives: Schema.Array(YamlDirective),
}) {}

// ---------------------------------------------------------------------------
// DocumentEndEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor exits a YAML document node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 *
 * @public
 */
export class DocumentEndEvent extends Schema.TaggedClass<DocumentEndEvent>()("DocumentEndEvent", {
	path: PathField,
	depth: DepthField,
}) {}

// ---------------------------------------------------------------------------
// MapStartEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor enters a YAML mapping node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `style` — the presentation style of the mapping (`"block"` or `"flow"`).
 * - `tag` — optional explicit YAML tag (e.g., `!!map`).
 * - `anchor` — optional anchor name for aliasing.
 *
 * @public
 */
export class MapStartEvent extends Schema.TaggedClass<MapStartEvent>()("MapStartEvent", {
	path: PathField,
	depth: DepthField,
	style: CollectionStyle,
	tag: Schema.optional(Schema.String),
	anchor: Schema.optional(Schema.String),
}) {}

// ---------------------------------------------------------------------------
// MapEndEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor exits a YAML mapping node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 *
 * @public
 */
export class MapEndEvent extends Schema.TaggedClass<MapEndEvent>()("MapEndEvent", {
	path: PathField,
	depth: DepthField,
}) {}

// ---------------------------------------------------------------------------
// SeqStartEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor enters a YAML sequence node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `style` — the presentation style of the sequence (`"block"` or `"flow"`).
 * - `tag` — optional explicit YAML tag (e.g., `!!seq`).
 * - `anchor` — optional anchor name for aliasing.
 *
 * @public
 */
export class SeqStartEvent extends Schema.TaggedClass<SeqStartEvent>()("SeqStartEvent", {
	path: PathField,
	depth: DepthField,
	style: CollectionStyle,
	tag: Schema.optional(Schema.String),
	anchor: Schema.optional(Schema.String),
}) {}

// ---------------------------------------------------------------------------
// SeqEndEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor exits a YAML sequence node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 *
 * @public
 */
export class SeqEndEvent extends Schema.TaggedClass<SeqEndEvent>()("SeqEndEvent", {
	path: PathField,
	depth: DepthField,
}) {}

// ---------------------------------------------------------------------------
// PairEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor encounters a key-value pair within a mapping.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `key` — the resolved key value of the pair.
 * - `value` — the resolved value of the pair.
 *
 * @public
 */
export class PairEvent extends Schema.TaggedClass<PairEvent>()("PairEvent", {
	path: PathField,
	depth: DepthField,
	key: Schema.Unknown,
	value: Schema.Unknown,
}) {}

// ---------------------------------------------------------------------------
// ScalarEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor encounters a YAML scalar node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `value` — the resolved JavaScript value (null, boolean, number, or string).
 * - `style` — the scalar presentation style in the source document.
 * - `tag` — optional explicit YAML tag (e.g., `!!str`, `!!int`).
 * - `anchor` — optional anchor name for aliasing.
 *
 * @public
 */
export class ScalarEvent extends Schema.TaggedClass<ScalarEvent>()("ScalarEvent", {
	path: PathField,
	depth: DepthField,
	value: Schema.Unknown,
	style: ScalarStyle,
	tag: Schema.optional(Schema.String),
	anchor: Schema.optional(Schema.String),
}) {}

// ---------------------------------------------------------------------------
// AliasEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor encounters a YAML alias node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `name` — the anchor name this alias refers to (without the leading `*`).
 *
 * @public
 */
export class AliasEvent extends Schema.TaggedClass<AliasEvent>()("AliasEvent", {
	path: PathField,
	depth: DepthField,
	name: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CommentEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor encounters a YAML comment.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `text` — the raw comment text (without the leading `#`).
 *
 * @public
 */
export class CommentEvent extends Schema.TaggedClass<CommentEvent>()("CommentEvent", {
	path: PathField,
	depth: DepthField,
	text: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// DirectiveEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the visitor encounters a YAML directive.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `name` — the directive name (e.g., `"YAML"` or `"TAG"`).
 * - `parameters` — the directive's raw parameter string.
 *
 * @public
 */
export class DirectiveEvent extends Schema.TaggedClass<DirectiveEvent>()("DirectiveEvent", {
	path: PathField,
	depth: DepthField,
	name: Schema.String,
	parameters: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// YamlVisitorEvent union
// ---------------------------------------------------------------------------

/**
 * A discriminated union of all eleven SAX-style YAML visitor events.
 *
 * @remarks
 * Use the individual type-guard helpers (`isScalarEvent`, `isMapStartEvent`,
 * etc.) to narrow an event to a specific variant.
 *
 * @public
 */
export const YamlVisitorEvent = Schema.Union(
	DocumentStartEvent,
	DocumentEndEvent,
	MapStartEvent,
	MapEndEvent,
	SeqStartEvent,
	SeqEndEvent,
	PairEvent,
	ScalarEvent,
	AliasEvent,
	CommentEvent,
	DirectiveEvent,
);

/**
 * The union of all YAML visitor event types.
 *
 * @see {@link YamlVisitorEvent}
 *
 * @public
 */
export type YamlVisitorEvent = Schema.Schema.Type<typeof YamlVisitorEvent>;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `event` is a {@link DocumentStartEvent}.
 *
 * @public
 */
export const isDocumentStartEvent = (event: YamlVisitorEvent): event is DocumentStartEvent =>
	event._tag === "DocumentStartEvent";

/**
 * Returns `true` when `event` is a {@link DocumentEndEvent}.
 *
 * @public
 */
export const isDocumentEndEvent = (event: YamlVisitorEvent): event is DocumentEndEvent =>
	event._tag === "DocumentEndEvent";

/**
 * Returns `true` when `event` is a {@link MapStartEvent}.
 *
 * @public
 */
export const isMapStartEvent = (event: YamlVisitorEvent): event is MapStartEvent => event._tag === "MapStartEvent";

/**
 * Returns `true` when `event` is a {@link MapEndEvent}.
 *
 * @public
 */
export const isMapEndEvent = (event: YamlVisitorEvent): event is MapEndEvent => event._tag === "MapEndEvent";

/**
 * Returns `true` when `event` is a {@link SeqStartEvent}.
 *
 * @public
 */
export const isSeqStartEvent = (event: YamlVisitorEvent): event is SeqStartEvent => event._tag === "SeqStartEvent";

/**
 * Returns `true` when `event` is a {@link SeqEndEvent}.
 *
 * @public
 */
export const isSeqEndEvent = (event: YamlVisitorEvent): event is SeqEndEvent => event._tag === "SeqEndEvent";

/**
 * Returns `true` when `event` is a {@link PairEvent}.
 *
 * @public
 */
export const isPairEvent = (event: YamlVisitorEvent): event is PairEvent => event._tag === "PairEvent";

/**
 * Returns `true` when `event` is a {@link ScalarEvent}.
 *
 * @public
 */
export const isScalarEvent = (event: YamlVisitorEvent): event is ScalarEvent => event._tag === "ScalarEvent";

/**
 * Returns `true` when `event` is a {@link AliasEvent}.
 *
 * @public
 */
export const isAliasEvent = (event: YamlVisitorEvent): event is AliasEvent => event._tag === "AliasEvent";

/**
 * Returns `true` when `event` is a {@link CommentEvent}.
 *
 * @public
 */
export const isCommentEvent = (event: YamlVisitorEvent): event is CommentEvent => event._tag === "CommentEvent";

/**
 * Returns `true` when `event` is a {@link DirectiveEvent}.
 *
 * @public
 */
export const isDirectiveEvent = (event: YamlVisitorEvent): event is DirectiveEvent => event._tag === "DirectiveEvent";
