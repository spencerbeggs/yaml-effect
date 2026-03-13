/**
 * Options schema for YAML formatting (a superset of stringify options).
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { CollectionStyle, ScalarStyle, YamlRange } from "./YamlShared.js";

/**
 * Options controlling YAML formatting behavior.
 *
 * @remarks
 * Extends all {@link YamlStringifyOptions} fields with formatting-specific
 * options. Fields are repeated rather than using class inheritance so that
 * `Schema.Class` composition remains straightforward and avoids
 * `Schema.extend` complexities.
 *
 * - `indent` — number of spaces per indentation level. Defaults to `2`.
 * - `lineWidth` — preferred maximum line width. Defaults to `80`.
 * - `defaultScalarStyle` — scalar output style. Defaults to `"plain"`.
 * - `defaultCollectionStyle` — collection output style. Defaults to `"block"`.
 * - `sortKeys` — sort mapping keys alphabetically. Defaults to `false`.
 * - `finalNewline` — end output with a trailing newline. Defaults to `true`.
 * - `preserveComments` — when `true`, comments in the source document are
 *   preserved in the formatted output. Defaults to `true`.
 * - `range` — when provided, restrict formatting to this region of the
 *   document. Optional; defaults to formatting the entire document.
 *
 * @public
 */
export class YamlFormattingOptions extends Schema.Class<YamlFormattingOptions>("YamlFormattingOptions")({
	indent: Schema.optionalWith(Schema.Int.pipe(Schema.nonNegative()), { default: () => 2 }),
	lineWidth: Schema.optionalWith(Schema.Int.pipe(Schema.positive()), { default: () => 80 }),
	defaultScalarStyle: Schema.optionalWith(ScalarStyle, { default: () => "plain" as const }),
	defaultCollectionStyle: Schema.optionalWith(CollectionStyle, { default: () => "block" as const }),
	sortKeys: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	finalNewline: Schema.optionalWith(Schema.Boolean, { default: () => true }),
	preserveComments: Schema.optionalWith(Schema.Boolean, { default: () => true }),
	range: Schema.optional(YamlRange),
}) {}
