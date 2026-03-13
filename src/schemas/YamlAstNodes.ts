/**
 * Internal module defining all mutually-referential YAML AST node schemas in
 * one place to avoid circular import cycles between individual schema files.
 *
 * @packageDocumentation
 * @internal
 */

import { Schema } from "effect";
import { CollectionStyle, ScalarStyle } from "./YamlShared.js";

// ---------------------------------------------------------------------------
// YamlScalar
// ---------------------------------------------------------------------------

/**
 * A YAML scalar AST node, representing a leaf value such as a string,
 * number, boolean, or null.
 *
 * @remarks
 * - `value` — the resolved JavaScript value (null, boolean, number, or string).
 * - `style` — the scalar presentation style in the source document.
 * - `tag` — optional explicit YAML tag (e.g., `!!str`, `!!int`).
 * - `anchor` — optional anchor name for aliasing.
 * - `comment` — optional trailing or leading comment text.
 * - `offset` — zero-based character offset where the scalar begins.
 * - `length` — character length of the scalar span.
 *
 * @public
 */
export class YamlScalar extends Schema.TaggedClass<YamlScalar>()("YamlScalar", {
	value: Schema.Unknown,
	tag: Schema.optional(Schema.String),
	style: ScalarStyle,
	anchor: Schema.optional(Schema.String),
	comment: Schema.optional(Schema.String),
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
}) {}

// ---------------------------------------------------------------------------
// YamlAlias
// ---------------------------------------------------------------------------

/**
 * A YAML alias AST node, referencing a previously defined anchor by name.
 *
 * @remarks
 * - `name` — the anchor name this alias refers to (without the leading `*`).
 * - `offset` — zero-based character offset where the alias begins.
 * - `length` — character length of the alias span.
 *
 * @public
 */
export class YamlAlias extends Schema.TaggedClass<YamlAlias>()("YamlAlias", {
	name: Schema.String,
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
}) {}

// ---------------------------------------------------------------------------
// YamlNode (forward declaration for circular reference)
// ---------------------------------------------------------------------------

/**
 * A discriminated union schema covering all four YAML AST node types:
 * {@link YamlScalar}, {@link YamlMap}, {@link YamlSeq}, and {@link YamlAlias}.
 *
 * @remarks
 * The union is defined lazily via `Schema.suspend` to break the circular
 * reference chain: `YamlNode → YamlMap → YamlPair → YamlNode`.
 *
 * @public
 */
export const YamlNode: Schema.Schema<YamlScalar | YamlMap | YamlSeq | YamlAlias> = Schema.suspend(() =>
	Schema.Union(YamlScalar, YamlMap, YamlSeq, YamlAlias),
);

/**
 * The union of all YAML AST node types.
 *
 * @public
 */
export type YamlNode = Schema.Schema.Type<typeof YamlNode>;

// ---------------------------------------------------------------------------
// YamlPair
// ---------------------------------------------------------------------------

/**
 * A YAML key-value pair AST node, representing one entry within a mapping.
 *
 * @remarks
 * - `key` — the {@link YamlNode} serving as the mapping key.
 * - `value` — the {@link YamlNode} serving as the mapping value, or `null`
 *   when the value is absent (e.g., `key:` with no value).
 * - `comment` — optional trailing or inline comment text.
 *
 * @public
 */
export class YamlPair extends Schema.TaggedClass<YamlPair>()("YamlPair", {
	key: Schema.suspend((): Schema.Schema<YamlNode> => YamlNode),
	value: Schema.NullOr(Schema.suspend((): Schema.Schema<YamlNode> => YamlNode)),
	comment: Schema.optional(Schema.String),
}) {}

// ---------------------------------------------------------------------------
// YamlMap
// ---------------------------------------------------------------------------

/**
 * A YAML mapping AST node, representing a collection of key-value pairs.
 *
 * @remarks
 * - `items` — the array of {@link YamlPair} entries in this mapping.
 * - `style` — the presentation style: `"block"` or `"flow"`.
 * - `tag` — optional explicit YAML tag (e.g., `!!map`).
 * - `anchor` — optional anchor name for aliasing.
 * - `comment` — optional leading or trailing comment text.
 * - `offset` — zero-based character offset where the mapping begins.
 * - `length` — character length of the mapping span.
 *
 * @public
 */
export class YamlMap extends Schema.TaggedClass<YamlMap>()("YamlMap", {
	items: Schema.Array(Schema.suspend((): Schema.Schema<YamlPair> => YamlPair)),
	tag: Schema.optional(Schema.String),
	anchor: Schema.optional(Schema.String),
	style: CollectionStyle,
	comment: Schema.optional(Schema.String),
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
}) {}

// ---------------------------------------------------------------------------
// YamlSeq
// ---------------------------------------------------------------------------

/**
 * A YAML sequence AST node, representing an ordered list of values.
 *
 * @remarks
 * - `items` — the array of {@link YamlNode} values in this sequence.
 * - `style` — the presentation style: `"block"` or `"flow"`.
 * - `tag` — optional explicit YAML tag (e.g., `!!seq`).
 * - `anchor` — optional anchor name for aliasing.
 * - `comment` — optional leading or trailing comment text.
 * - `offset` — zero-based character offset where the sequence begins.
 * - `length` — character length of the sequence span.
 *
 * @public
 */
export class YamlSeq extends Schema.TaggedClass<YamlSeq>()("YamlSeq", {
	items: Schema.Array(Schema.suspend((): Schema.Schema<YamlNode> => YamlNode)),
	tag: Schema.optional(Schema.String),
	anchor: Schema.optional(Schema.String),
	style: CollectionStyle,
	comment: Schema.optional(Schema.String),
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
}) {}
