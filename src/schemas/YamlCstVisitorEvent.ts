/**
 * SAX-style visitor event schemas for the YAML CST walker.
 *
 * @remarks
 * Each event is a {@link Schema.TaggedClass} carrying the visitor `path` (an
 * ordered list of string keys / numeric indices from the document root to the
 * current node) and `depth` (the zero-based nesting level).  All content
 * fields are raw source strings — no type resolution occurs at the CST level.
 * All thirteen event types are collected into the {@link YamlCstVisitorEvent}
 * discriminated union and individual type-guard helpers are exported for each
 * variant.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

// ---------------------------------------------------------------------------
// Shared field definitions
// ---------------------------------------------------------------------------

const PathField = Schema.Array(Schema.Union(Schema.String, Schema.Number));
const DepthField = Schema.Int.pipe(Schema.nonNegative());

// ---------------------------------------------------------------------------
// CstDocumentStartEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor enters a document node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 *
 * @public
 */
export class CstDocumentStartEvent extends Schema.TaggedClass<CstDocumentStartEvent>()("CstDocumentStartEvent", {
	path: PathField,
	depth: DepthField,
}) {}

// ---------------------------------------------------------------------------
// CstDocumentEndEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor exits a document node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 *
 * @public
 */
export class CstDocumentEndEvent extends Schema.TaggedClass<CstDocumentEndEvent>()("CstDocumentEndEvent", {
	path: PathField,
	depth: DepthField,
}) {}

// ---------------------------------------------------------------------------
// CstMapStartEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor enters a block-map or flow-map node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text span of the mapping node.
 *
 * @public
 */
export class CstMapStartEvent extends Schema.TaggedClass<CstMapStartEvent>()("CstMapStartEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstMapEndEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor exits a block-map or flow-map node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 *
 * @public
 */
export class CstMapEndEvent extends Schema.TaggedClass<CstMapEndEvent>()("CstMapEndEvent", {
	path: PathField,
	depth: DepthField,
}) {}

// ---------------------------------------------------------------------------
// CstSeqStartEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor enters a block-seq or flow-seq node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text span of the sequence node.
 *
 * @public
 */
export class CstSeqStartEvent extends Schema.TaggedClass<CstSeqStartEvent>()("CstSeqStartEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstSeqEndEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor exits a block-seq or flow-seq node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 *
 * @public
 */
export class CstSeqEndEvent extends Schema.TaggedClass<CstSeqEndEvent>()("CstSeqEndEvent", {
	path: PathField,
	depth: DepthField,
}) {}

// ---------------------------------------------------------------------------
// CstKeyEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor encounters a scalar that is a map key.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text of the key scalar.
 *
 * @public
 */
export class CstKeyEvent extends Schema.TaggedClass<CstKeyEvent>()("CstKeyEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstValueEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor encounters a scalar that is a map value.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text of the value scalar.
 *
 * @public
 */
export class CstValueEvent extends Schema.TaggedClass<CstValueEvent>()("CstValueEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstScalarEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor encounters a standalone scalar (not a map key
 * or value — e.g., a sequence item or bare document scalar).
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text of the scalar (no type resolution).
 *
 * @public
 */
export class CstScalarEvent extends Schema.TaggedClass<CstScalarEvent>()("CstScalarEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstAliasEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor encounters an alias reference node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text of the alias (including the leading `*`).
 *
 * @public
 */
export class CstAliasEvent extends Schema.TaggedClass<CstAliasEvent>()("CstAliasEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstCommentEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor encounters a comment node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text of the comment (including the leading `#`).
 *
 * @public
 */
export class CstCommentEvent extends Schema.TaggedClass<CstCommentEvent>()("CstCommentEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstDirectiveEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor encounters a directive node.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text of the directive (e.g., `%YAML 1.2`).
 *
 * @public
 */
export class CstDirectiveEvent extends Schema.TaggedClass<CstDirectiveEvent>()("CstDirectiveEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// CstErrorEvent
// ---------------------------------------------------------------------------

/**
 * Emitted when the CST visitor encounters an error node in the CST.
 *
 * @remarks
 * - `path` — path segments from the root to this node.
 * - `depth` — zero-based nesting depth.
 * - `source` — the raw source text of the erroneous token.
 *
 * @public
 */
export class CstErrorEvent extends Schema.TaggedClass<CstErrorEvent>()("CstErrorEvent", {
	path: PathField,
	depth: DepthField,
	source: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// YamlCstVisitorEvent union
// ---------------------------------------------------------------------------

/**
 * A discriminated union of all thirteen SAX-style YAML CST visitor events.
 *
 * @remarks
 * Use the individual type-guard helpers (`isCstScalarEvent`, `isCstKeyEvent`,
 * etc.) to narrow an event to a specific variant.
 *
 * @public
 */
export const YamlCstVisitorEvent = Schema.Union(
	CstDocumentStartEvent,
	CstDocumentEndEvent,
	CstMapStartEvent,
	CstMapEndEvent,
	CstSeqStartEvent,
	CstSeqEndEvent,
	CstKeyEvent,
	CstValueEvent,
	CstScalarEvent,
	CstAliasEvent,
	CstCommentEvent,
	CstDirectiveEvent,
	CstErrorEvent,
);

/**
 * The union of all YAML CST visitor event types.
 *
 * @see {@link YamlCstVisitorEvent}
 *
 * @public
 */
export type YamlCstVisitorEvent = Schema.Schema.Type<typeof YamlCstVisitorEvent>;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `event` is a {@link CstDocumentStartEvent}.
 *
 * @public
 */
export const isCstDocumentStartEvent = (event: YamlCstVisitorEvent): event is CstDocumentStartEvent =>
	event._tag === "CstDocumentStartEvent";

/**
 * Returns `true` when `event` is a {@link CstDocumentEndEvent}.
 *
 * @public
 */
export const isCstDocumentEndEvent = (event: YamlCstVisitorEvent): event is CstDocumentEndEvent =>
	event._tag === "CstDocumentEndEvent";

/**
 * Returns `true` when `event` is a {@link CstMapStartEvent}.
 *
 * @public
 */
export const isCstMapStartEvent = (event: YamlCstVisitorEvent): event is CstMapStartEvent =>
	event._tag === "CstMapStartEvent";

/**
 * Returns `true` when `event` is a {@link CstMapEndEvent}.
 *
 * @public
 */
export const isCstMapEndEvent = (event: YamlCstVisitorEvent): event is CstMapEndEvent =>
	event._tag === "CstMapEndEvent";

/**
 * Returns `true` when `event` is a {@link CstSeqStartEvent}.
 *
 * @public
 */
export const isCstSeqStartEvent = (event: YamlCstVisitorEvent): event is CstSeqStartEvent =>
	event._tag === "CstSeqStartEvent";

/**
 * Returns `true` when `event` is a {@link CstSeqEndEvent}.
 *
 * @public
 */
export const isCstSeqEndEvent = (event: YamlCstVisitorEvent): event is CstSeqEndEvent =>
	event._tag === "CstSeqEndEvent";

/**
 * Returns `true` when `event` is a {@link CstKeyEvent}.
 *
 * @public
 */
export const isCstKeyEvent = (event: YamlCstVisitorEvent): event is CstKeyEvent => event._tag === "CstKeyEvent";

/**
 * Returns `true` when `event` is a {@link CstValueEvent}.
 *
 * @public
 */
export const isCstValueEvent = (event: YamlCstVisitorEvent): event is CstValueEvent => event._tag === "CstValueEvent";

/**
 * Returns `true` when `event` is a {@link CstScalarEvent}.
 *
 * @public
 */
export const isCstScalarEvent = (event: YamlCstVisitorEvent): event is CstScalarEvent =>
	event._tag === "CstScalarEvent";

/**
 * Returns `true` when `event` is a {@link CstAliasEvent}.
 *
 * @public
 */
export const isCstAliasEvent = (event: YamlCstVisitorEvent): event is CstAliasEvent => event._tag === "CstAliasEvent";

/**
 * Returns `true` when `event` is a {@link CstCommentEvent}.
 *
 * @public
 */
export const isCstCommentEvent = (event: YamlCstVisitorEvent): event is CstCommentEvent =>
	event._tag === "CstCommentEvent";

/**
 * Returns `true` when `event` is a {@link CstDirectiveEvent}.
 *
 * @public
 */
export const isCstDirectiveEvent = (event: YamlCstVisitorEvent): event is CstDirectiveEvent =>
	event._tag === "CstDirectiveEvent";

/**
 * Returns `true` when `event` is a {@link CstErrorEvent}.
 *
 * @public
 */
export const isCstErrorEvent = (event: YamlCstVisitorEvent): event is CstErrorEvent => event._tag === "CstErrorEvent";
