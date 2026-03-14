/**
 * Options schema for YAML stringification.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { CollectionStyle, ScalarStyle } from "./YamlShared.js";

/**
 * Options controlling YAML stringify behavior.
 *
 * @remarks
 * - `indent` — number of spaces per indentation level. Must be a non-negative
 *   integer. Defaults to `2`.
 * - `lineWidth` — preferred maximum line width for wrapping scalars and
 *   collections. Defaults to `80`.
 * - `defaultScalarStyle` — the scalar output style to use when no explicit
 *   style is requested. Defaults to `"plain"`.
 * - `defaultCollectionStyle` — the collection output style to use when no
 *   explicit style is requested. Defaults to `"block"`.
 * - `sortKeys` — when `true`, mapping keys are sorted alphabetically.
 *   Defaults to `false`.
 * - `finalNewline` — when `true`, the output ends with a trailing newline.
 *   Defaults to `true`.
 *
 * @public
 */
export class YamlStringifyOptions extends Schema.Class<YamlStringifyOptions>("YamlStringifyOptions")({
	indent: Schema.optionalWith(Schema.Int.pipe(Schema.nonNegative()), { default: () => 2 }),
	lineWidth: Schema.optionalWith(Schema.Int.pipe(Schema.positive()), { default: () => 80 }),
	defaultScalarStyle: Schema.optionalWith(ScalarStyle, { default: () => "plain" as const }),
	defaultCollectionStyle: Schema.optionalWith(CollectionStyle, { default: () => "block" as const }),
	sortKeys: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	finalNewline: Schema.optionalWith(Schema.Boolean, { default: () => true }),
}) {}
