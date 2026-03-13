/**
 * Shared YAML structural types used across the parse/stringify/format pipeline.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * YAML scalar output styles.
 *
 * @public
 */
export const ScalarStyle = Schema.Literal("plain", "single-quoted", "double-quoted", "block-literal", "block-folded");
/**
 * The union of all scalar style string literals.
 *
 * @see {@link ScalarStyle}
 *
 * @public
 */
export type ScalarStyle = Schema.Schema.Type<typeof ScalarStyle>;

/**
 * YAML collection output styles.
 *
 * @public
 */
export const CollectionStyle = Schema.Literal("block", "flow");
/**
 * The union of all collection style string literals.
 *
 * @see {@link CollectionStyle}
 *
 * @public
 */
export type CollectionStyle = Schema.Schema.Type<typeof CollectionStyle>;

/**
 * A range within a YAML document, expressed as a zero-based character
 * offset and a length in characters.
 *
 * @remarks
 * Both `offset` and `length` are measured in UTF-16 code units (JavaScript
 * string indices). Pass a `YamlRange` to formatting options to restrict
 * operations to a specific region of the document.
 *
 * @public
 */
export class YamlRange extends Schema.Class<YamlRange>("YamlRange")({
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
}) {}

/**
 * A non-mutating text edit describing a replacement within a YAML document.
 *
 * @remarks
 * Edits use zero-based `offset` and `length` to identify the span of text
 * to replace, and `content` for the replacement string. To insert without
 * removing text, set `length` to `0`. To delete without inserting, set
 * `content` to `""`.
 *
 * @public
 */
export class YamlEdit extends Schema.Class<YamlEdit>("YamlEdit")({
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
	content: Schema.String,
}) {}

/**
 * An ordered sequence of path segments describing a location within a YAML
 * document tree. Each segment is either a `string` (object key) or a
 * `number` (array index).
 *
 * @public
 */
export type YamlPath = ReadonlyArray<string | number>;
