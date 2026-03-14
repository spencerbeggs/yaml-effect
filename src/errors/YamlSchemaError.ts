/**
 * YAML schema validation error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlSchemaError}.
 *
 * @privateRemarks
 * The `*Base` pattern is required because `Data.TaggedError` produces complex
 * type signatures involving intersection types and branded generics that
 * api-extractor cannot roll up into a single `.d.ts` bundle. By exporting
 * the base separately as `@internal`, the public `YamlSchemaError` class
 * extends it with concrete fields, giving api-extractor a simple class
 * declaration to work with.
 *
 * @internal
 */
export const YamlSchemaErrorBase = Data.TaggedError("YamlSchemaError");

/**
 * Error raised when YAML schema validation fails.
 *
 * @remarks
 * Contains the `text` that failed validation and the underlying `cause`
 * of the validation failure.
 *
 * @see {@link makeYamlSchema} — produces schemas that may fail with this error
 *
 * @example Catching with `Effect.catchTag`
 * ```ts
 * import { Effect, Schema } from "effect";
 * import { makeYamlSchema } from "@spencerbeggs/yaml-effect";
 *
 * const schema = makeYamlSchema(Schema.Struct({ name: Schema.String }));
 * const program = Schema.decode(schema)("not_a_mapping: true").pipe(
 *   Effect.catchTag("YamlSchemaError", (e) => {
 *     console.error("Schema validation failed for:", e.text);
 *     return Effect.succeed({ name: "default" });
 *   }),
 * );
 * ```
 *
 * @public
 */
export class YamlSchemaError extends YamlSchemaErrorBase<{
	readonly text: string;
	readonly cause: unknown;
}> {
	get message(): string {
		return `YAML schema validation failed`;
	}
}
