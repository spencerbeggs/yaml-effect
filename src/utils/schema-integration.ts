/**
 * Bidirectional Effect Schema composition for typed YAML pipelines.
 *
 * Bridges YAML parse/stringify with Effect Schema decode/encode for
 * fully typed YAML-to-domain roundtrips.
 *
 * @packageDocumentation
 */

import { Effect, ParseResult, Schema } from "effect";
import type { YamlDocument } from "../schemas/YamlDocument.js";
import type { YamlParseOptions } from "../schemas/YamlParseOptions.js";
import type { YamlStringifyOptions } from "../schemas/YamlStringifyOptions.js";
import { buildAnchorMap, getNodeValue, parse, parseAllDocuments, parseDocument } from "./composer.js";
import { stringify, stringifyDocument } from "./stringify.js";

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

/**
 * Creates a Schema that decodes a multi-document YAML string into an array of
 * plain JavaScript values, and encodes an array of values back into a
 * multi-document YAML string.
 *
 * @param parseOptions - Options to pass to the YAML parser.
 * @returns A Schema that decodes/encodes between YAML strings and arrays of unknown values.
 *
 * @public
 */
export function makeYamlAllFromString(
	parseOptions?: Partial<YamlParseOptions>,
): Schema.Schema<ReadonlyArray<unknown>, string> {
	return Schema.transformOrFail(Schema.String, Schema.Array(Schema.Unknown), {
		strict: true,
		decode: (input, _options, ast) =>
			parseAllDocuments(input, parseOptions).pipe(
				Effect.flatMap((docs) =>
					Effect.forEach(
						docs,
						(doc) =>
							Effect.sync(() => {
								const anchors = buildAnchorMap(doc.contents);
								return getNodeValue(doc.contents, anchors);
							}),
						{ concurrency: 1 },
					),
				),
				Effect.mapError((err) => new ParseResult.Type(ast, input, err.message)),
			),
		encode: (values, _options, ast) => {
			if (values.length === 0) return ParseResult.succeed("");
			return Effect.forEach(
				[...values],
				(value, index) => stringify(value).pipe(Effect.map((yaml) => (index > 0 ? `---\n${yaml}` : yaml))),
				{ concurrency: 1 },
			).pipe(
				Effect.map((parts) => parts.join("")),
				Effect.mapError((err) => new ParseResult.Type(ast, values, err.message)),
			);
		},
	}) as unknown as Schema.Schema<ReadonlyArray<unknown>, string>;
}

/**
 * A Schema that decodes a multi-document YAML string into an array of unknown
 * values and encodes an array of values back into a multi-document YAML string.
 *
 * @public
 */
export const YamlAllFromString: Schema.Schema<ReadonlyArray<unknown>, string> = makeYamlAllFromString();

/**
 * Creates a Schema that decodes a YAML string into a {@link YamlDocument},
 * preserving the full AST structure, directives, and metadata.
 *
 * @param parseOptions - Options to pass to the YAML parser.
 * @returns A Schema that decodes/encodes between YAML strings and YamlDocument instances.
 *
 * @public
 */
export function makeYamlDocumentSchema(parseOptions?: Partial<YamlParseOptions>): Schema.Schema<YamlDocument, string> {
	return Schema.transformOrFail(Schema.String, Schema.Unknown, {
		strict: true,
		decode: (input, _options, ast) =>
			parseDocument(input, parseOptions).pipe(Effect.mapError((err) => new ParseResult.Type(ast, input, err.message))),
		encode: (doc, _options, ast) =>
			stringifyDocument(doc as YamlDocument).pipe(
				Effect.mapError((err) => new ParseResult.Type(ast, doc, err.message)),
			),
	}) as unknown as Schema.Schema<YamlDocument, string>;
}
