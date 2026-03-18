/**
 * Bidirectional Effect Schema composition for typed YAML pipelines.
 *
 * Bridges YAML parse/stringify with Effect Schema decode/encode for
 * fully typed YAML-to-domain roundtrips.
 *
 * @packageDocumentation
 */

import { Effect, ParseResult, Schema } from "effect";
import type { YamlNode } from "../schemas/YamlAstNodes.js";
import type { YamlDocument } from "../schemas/YamlDocument.js";
import type { YamlParseOptions } from "../schemas/YamlParseOptions.js";
import type { YamlStringifyOptions } from "../schemas/YamlStringifyOptions.js";
import { getNodeValue, parse, parseAllDocuments, parseDocument } from "./composer.js";
import { stringify, stringifyDocument } from "./stringify.js";

/**
 * Enriches an error message with position info from the first error detail
 * when available (YamlComposerError, YamlParseError, YamlLexError carry an
 * `errors` array of YamlErrorDetail with line/column).
 */
function formatSchemaError(err: { message: string; errors?: ReadonlyArray<{ line: number; column: number }> }): string {
	if (err.errors && err.errors.length > 0) {
		const first = err.errors[0];
		return `${err.message} (line ${first.line + 1}, column ${first.column + 1})`;
	}
	return err.message;
}

/**
 * A Schema that decodes a YAML string into an unknown value and encodes
 * an unknown value back into a YAML string.
 *
 * @example
 * ```typescript
 * import { Effect, Schema } from "effect";
 * import { YamlFromString } from "yaml-effect";
 *
 * const decode = Schema.decode(YamlFromString);
 * const encode = Schema.encode(YamlFromString);
 *
 * const program = decode("name: Alice\nage: 30").pipe(
 *   Effect.tap((value) => Effect.log(value)),
 *   // => { name: "Alice", age: 30 }
 *   Effect.flatMap((value) => encode(value)),
 *   Effect.tap((yaml) => Effect.log(yaml)),
 *   // => "name: Alice\nage: 30\n"
 * );
 *
 * Effect.runPromise(program);
 * ```
 *
 * @public
 */
export const YamlFromString: Schema.Schema<unknown, string> = Schema.transformOrFail(Schema.String, Schema.Unknown, {
	strict: true,
	decode: (input, _options, ast) =>
		parse(input).pipe(Effect.mapError((err) => new ParseResult.Type(ast, input, formatSchemaError(err)))),
	encode: (value, _options, ast) =>
		stringify(value).pipe(Effect.mapError((err) => new ParseResult.Type(ast, value, formatSchemaError(err)))),
});

/**
 * Creates a {@link YamlFromString} schema with custom parse and stringify
 * options.
 *
 * @param parseOptions - Options to pass to the YAML parser.
 * @param stringifyOptions - Options to pass to the YAML stringifier.
 * @returns A Schema that decodes/encodes between YAML strings and unknown values.
 *
 * @example
 * ```typescript
 * import { makeYamlFromString } from "yaml-effect";
 *
 * const lenientYaml = makeYamlFromString(
 *   { strict: false },
 *   { indent: 4 },
 * );
 * ```
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
			parse(input, parseOptions).pipe(
				Effect.mapError((err) => new ParseResult.Type(ast, input, formatSchemaError(err))),
			),
		encode: (value, _options, ast) =>
			stringify(value, stringifyOptions).pipe(
				Effect.mapError((err) => new ParseResult.Type(ast, value, formatSchemaError(err))),
			),
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
 * @example
 * ```typescript
 * import { Effect, Schema } from "effect";
 * import { makeYamlSchema } from "yaml-effect";
 *
 * const ConfigSchema = makeYamlSchema(
 *   Schema.Struct({
 *     host: Schema.String,
 *     port: Schema.Number,
 *     debug: Schema.Boolean,
 *   }),
 * );
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* Schema.decode(ConfigSchema)(
 *     "host: localhost\nport: 3000\ndebug: true",
 *   );
 *   console.log(config.port); // 3000
 *
 *   const yaml = yield* Schema.encode(ConfigSchema)(config);
 *   console.log(yaml); // "host: localhost\nport: 3000\ndebug: true\n"
 * });
 *
 * Effect.runSync(program);
 * ```
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
 * @example
 * ```typescript
 * import { Effect, Schema } from "effect";
 * import { YamlAllFromString } from "yaml-effect";
 *
 * const program = Effect.gen(function* () {
 *   const docs = yield* Schema.decode(YamlAllFromString)(
 *     "name: Alice\n---\nname: Bob",
 *   );
 *   console.log(docs); // [{ name: "Alice" }, { name: "Bob" }]
 * });
 *
 * Effect.runSync(program);
 * ```
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
								const anchors = new Map<string, YamlNode>();
								return getNodeValue(doc.contents, anchors);
							}),
						{ concurrency: 1 },
					),
				),
				Effect.mapError((err) => new ParseResult.Type(ast, input, formatSchemaError(err))),
			),
		encode: (values, _options, ast) => {
			if (values.length === 0) return ParseResult.succeed("");
			return Effect.forEach(
				[...values],
				(value, index) => stringify(value).pipe(Effect.map((yaml) => (index > 0 ? `---\n${yaml}` : yaml))),
				{ concurrency: 1 },
			).pipe(
				Effect.map((parts) => parts.join("")),
				Effect.mapError((err) => new ParseResult.Type(ast, values, formatSchemaError(err))),
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
 * @example
 * ```typescript
 * import { Effect, Schema } from "effect";
 * import type { YamlDocument } from "yaml-effect";
 * import { makeYamlDocumentSchema } from "yaml-effect";
 *
 * const DocSchema = makeYamlDocumentSchema();
 *
 * const program = Effect.gen(function* () {
 *   const doc: YamlDocument = yield* Schema.decode(DocSchema)(
 *     "# comment\nkey: value",
 *   );
 *   console.log(doc.contents); // YamlMap node
 *   console.log(doc.comment); // "comment"
 * });
 *
 * Effect.runSync(program);
 * ```
 *
 * @public
 */
export function makeYamlDocumentSchema(parseOptions?: Partial<YamlParseOptions>): Schema.Schema<YamlDocument, string> {
	return Schema.transformOrFail(Schema.String, Schema.Unknown, {
		strict: true,
		decode: (input, _options, ast) =>
			parseDocument(input, parseOptions).pipe(
				Effect.mapError((err) => new ParseResult.Type(ast, input, formatSchemaError(err))),
			),
		encode: (doc, _options, ast) =>
			stringifyDocument(doc as YamlDocument).pipe(
				Effect.mapError((err) => new ParseResult.Type(ast, doc, formatSchemaError(err))),
			),
	}) as unknown as Schema.Schema<YamlDocument, string>;
}
