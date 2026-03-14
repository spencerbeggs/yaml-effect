/**
 * YAML stringify error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlStringifyError}.
 *
 * @privateRemarks
 * The `*Base` pattern is required because `Data.TaggedError` produces complex
 * type signatures involving intersection types and branded generics that
 * api-extractor cannot roll up into a single `.d.ts` bundle. By exporting
 * the base separately as `@internal`, the public `YamlStringifyError` class
 * extends it with concrete fields, giving api-extractor a simple class
 * declaration to work with.
 *
 * @internal
 */
export const YamlStringifyErrorBase = Data.TaggedError("YamlStringifyError");

/**
 * Error raised when YAML stringification fails.
 *
 * @remarks
 * Contains the `value` that could not be stringified and a `reason` string
 * explaining the failure.
 *
 * @see {@link stringify} — may fail with this error
 * @see {@link stringifyDocument} — may fail with this error
 *
 * @example Catching with `Effect.catchTag`
 * ```ts
 * import { Effect } from "effect";
 * import { stringify } from "@spencerbeggs/yaml-effect";
 *
 * const program = stringify(circularValue).pipe(
 *   Effect.catchTag("YamlStringifyError", (e) => {
 *     console.error(`Stringify failed: ${e.reason}`);
 *     return Effect.succeed("");
 *   }),
 * );
 * ```
 *
 * @public
 */
export class YamlStringifyError extends YamlStringifyErrorBase<{
	readonly value: unknown;
	readonly reason: string;
}> {
	get message(): string {
		return `YAML stringify failed: ${this.reason}`;
	}
}
