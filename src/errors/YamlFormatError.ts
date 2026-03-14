/**
 * YAML format error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlFormatError}.
 *
 * @privateRemarks
 * The `*Base` pattern is required because `Data.TaggedError` produces complex
 * type signatures involving intersection types and branded generics that
 * api-extractor cannot roll up into a single `.d.ts` bundle. By exporting
 * the base separately as `@internal`, the public `YamlFormatError` class
 * extends it with concrete fields, giving api-extractor a simple class
 * declaration to work with.
 *
 * @internal
 */
export const YamlFormatErrorBase = Data.TaggedError("YamlFormatError");

/**
 * Error raised when YAML formatting fails.
 *
 * @remarks
 * Contains the `text` that could not be formatted and a `reason` string
 * explaining the failure.
 *
 * @example Catching with `Effect.catchTag`
 * ```ts
 * import { Effect } from "effect";
 * import { format } from "@spencerbeggs/yaml-effect";
 *
 * const program = format("malformed: [yaml").pipe(
 *   Effect.catchTag("YamlFormatError", (e) => {
 *     console.error(`Format failed: ${e.reason}`);
 *     return Effect.succeed(e.text);
 *   }),
 * );
 * ```
 *
 * @public
 */
export class YamlFormatError extends YamlFormatErrorBase<{
	readonly text: string;
	readonly reason: string;
}> {
	get message(): string {
		return `YAML format failed: ${this.reason}`;
	}
}
