/**
 * YAML parser error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";
import type { YamlErrorDetail } from "./YamlErrorDetail.js";

/**
 * Base class for {@link YamlParseError}.
 *
 * @privateRemarks
 * The `*Base` pattern is required because `Data.TaggedError` produces complex
 * type signatures involving intersection types and branded generics that
 * api-extractor cannot roll up into a single `.d.ts` bundle. By exporting
 * the base separately as `@internal`, the public `YamlParseError` class
 * extends it with concrete fields, giving api-extractor a simple class
 * declaration to work with.
 *
 * @internal
 */
export const YamlParseErrorBase = Data.TaggedError("YamlParseError");

/**
 * Error raised when YAML parsing encounters one or more structural errors.
 *
 * @remarks
 * Contains the full source `text` and an `errors` array of
 * {@link YamlErrorDetail} instances with precise position information for
 * each problem found.
 *
 * @see {@link parseCST} — may fail with this error
 *
 * @example Catching with `Effect.catchTag`
 * ```ts
 * import { Effect } from "effect";
 * import { parse } from "yaml-effect";
 *
 * const program = parse("key:\n\tvalue: 1").pipe(
 *   Effect.catchTag("YamlParseError", (e) => {
 *     for (const detail of e.errors) {
 *       console.error(
 *         `[${detail.code}] ${detail.message} at ${detail.line}:${detail.column}`,
 *       );
 *     }
 *     return Effect.succeed(null);
 *   }),
 * );
 * ```
 *
 * @public
 */
export class YamlParseError extends YamlParseErrorBase<{
	readonly errors: ReadonlyArray<YamlErrorDetail>;
	readonly text: string;
}> {
	get message(): string {
		const count = this.errors.length;
		return `YAML parse failed with ${count} error${count !== 1 ? "s" : ""}: ${this.errors.map((e) => e.message).join("; ")}`;
	}
}
