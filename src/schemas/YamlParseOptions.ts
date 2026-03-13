/**
 * Options schema for YAML parsing.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * Options controlling YAML parse behavior.
 *
 * @remarks
 * - `strict` — when `true`, parse errors are treated as failures rather than
 *   being recovered. Defaults to `true`.
 * - `maxAliasCount` — maximum number of alias nodes allowed in a single
 *   document to prevent alias-based denial-of-service attacks. Must be a
 *   non-negative integer. Defaults to `100`.
 * - `uniqueKeys` — when `true`, duplicate keys within a mapping are treated
 *   as errors. Defaults to `true`.
 *
 * @public
 */
export class YamlParseOptions extends Schema.Class<YamlParseOptions>("YamlParseOptions")({
	strict: Schema.optionalWith(Schema.Boolean, {
		default: () => true,
	}),
	maxAliasCount: Schema.optionalWith(Schema.Int.pipe(Schema.nonNegative()), {
		default: () => 100,
	}),
	uniqueKeys: Schema.optionalWith(Schema.Boolean, {
		default: () => true,
	}),
}) {}
