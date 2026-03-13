/**
 * Bidirectional Effect Schema composition for typed YAML pipelines.
 *
 * Bridges YAML parse/stringify with Effect Schema decode/encode for
 * fully typed YAML-to-domain roundtrips.
 *
 * @packageDocumentation
 */

import { Effect, ParseResult, Schema } from "effect";
import type { YamlParseOptions } from "../schemas/YamlParseOptions.js";
import type { YamlStringifyOptions } from "../schemas/YamlStringifyOptions.js";
import { parse } from "./composer.js";
import { stringify } from "./stringify.js";

/**
 * A Schema that decodes a YAML string into an unknown value and encodes
 * an unknown value back into a YAML string.
 *
 * @public
 */
export const YamlFromString: Schema.Schema<unknown, string> = Schema.transformOrFail(Schema.String, Schema.Unknown, {
	strict: true,
	decode: (input, _options, ast) =>
		parse(input).pipe(Effect.mapError((err) => new ParseResult.Type(ast, input, err.message))),
	encode: (value, _options, ast) =>
		stringify(value).pipe(Effect.mapError((err) => new ParseResult.Type(ast, value, err.message))),
});

/**
 * Creates a {@link YamlFromString} schema with custom parse and stringify
 * options.
 *
 * @param parseOptions - Options to pass to the YAML parser.
 * @param stringifyOptions - Options to pass to the YAML stringifier.
 * @returns A Schema that decodes/encodes between YAML strings and unknown values.
 *
 * @public
 */
export function makeYamlFromString(
	parseOptions?: Partial<YamlParseOptions>,
	stringifyOptions?: Partial<YamlStringifyOptions>,
): Schema.Schema<unknown, string> {
	return Schema.transformOrFail(Schema.String, Schema.Unknown, {
		strict: true,
		decode: (input, _options, ast) =>
			parse(input, parseOptions).pipe(Effect.mapError((err) => new ParseResult.Type(ast, input, err.message))),
		encode: (value, _options, ast) =>
			stringify(value, stringifyOptions).pipe(Effect.mapError((err) => new ParseResult.Type(ast, value, err.message))),
	});
}

/**
 * Creates a fully typed Schema that decodes YAML strings into a domain type
 * `A` and encodes `A` values back into YAML strings.
 *
 * @param targetSchema - The Effect Schema describing the target domain type.
 * @param options - Optional parse and stringify options.
 * @returns A composed Schema from YAML string to `A`.
 *
 * @public
 */
export function makeYamlSchema<A, I, R>(
	targetSchema: Schema.Schema<A, I, R>,
	options?: {
		parseOptions?: Partial<YamlParseOptions>;
		stringifyOptions?: Partial<YamlStringifyOptions>;
	},
): Schema.Schema<A, string, R> {
	const yamlSchema = options ? makeYamlFromString(options.parseOptions, options.stringifyOptions) : YamlFromString;
	return Schema.compose(yamlSchema, targetSchema, { strict: false });
}
