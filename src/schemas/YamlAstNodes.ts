/**
 * Internal module defining all mutually-referential YAML AST node schemas in
 * one place to avoid circular import cycles between individual schema files.
 *
 * @packageDocumentation
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
 * @example
 * ```typescript
 * import { YamlScalar } from "yaml-effect";
 *
 * const scalar = new YamlScalar({
 *   value: "hello",
 *   style: "plain",
 *   offset: 0,
 *   length: 5,
 * });
 * console.log(scalar.value); // "hello"
 * ```
 *
 * @public
 */
export class YamlScalar extends Schema.TaggedClass<YamlScalar>()("YamlScalar", {
	value: Schema.Unknown,
	tag: Schema.optional(Schema.String),
	style: ScalarStyle,
	anchor: Schema.optional(Schema.String),
	comment: Schema.optional(Schema.String),
	chomp: Schema.optional(Schema.Literal("strip", "clip", "keep")),
	raw: Schema.optional(Schema.String),
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
 * @example
 * ```typescript
 * import { YamlAlias } from "yaml-effect";
 *
 * const alias = new YamlAlias({
 *   name: "defaults",
 *   offset: 20,
 *   length: 9,
 * });
 * console.log(alias.name); // "defaults"
 * ```
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
 * @example
 * ```typescript
 * import { YamlPair, YamlScalar } from "yaml-effect";
 *
 * const pair = new YamlPair({
 *   key: new YamlScalar({ value: "name", style: "plain", offset: 0, length: 4 }),
 *   value: new YamlScalar({ value: "Alice", style: "plain", offset: 6, length: 5 }),
 * });
 * ```
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
 * @example
 * ```typescript
 * import { YamlMap, YamlPair, YamlScalar } from "yaml-effect";
 *
 * const map = new YamlMap({
 *   items: [
 *     new YamlPair({
 *       key: new YamlScalar({ value: "host", style: "plain", offset: 0, length: 4 }),
 *       value: new YamlScalar({ value: "localhost", style: "plain", offset: 6, length: 9 }),
 *     }),
 *   ],
 *   style: "block",
 *   offset: 0,
 *   length: 15,
 * });
 * ```
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
 * @example
 * ```typescript
 * import { YamlSeq, YamlScalar } from "yaml-effect";
 *
 * const seq = new YamlSeq({
 *   items: [
 *     new YamlScalar({ value: "one", style: "plain", offset: 4, length: 3 }),
 *     new YamlScalar({ value: "two", style: "plain", offset: 10, length: 3 }),
 *   ],
 *   style: "block",
 *   offset: 0,
 *   length: 13,
 * });
 * ```
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
