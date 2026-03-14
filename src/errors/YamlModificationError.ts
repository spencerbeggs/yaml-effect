/**
 * YAML modification error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlModificationError}.
 *
 * @privateRemarks
 * The `*Base` pattern is required because `Data.TaggedError` produces complex
 * type signatures involving intersection types and branded generics that
 * api-extractor cannot roll up into a single `.d.ts` bundle. By exporting
 * the base separately as `@internal`, the public `YamlModificationError`
 * class extends it with concrete fields, giving api-extractor a simple class
 * declaration to work with.
 *
 * @internal
 */
export const YamlModificationErrorBase = Data.TaggedError("YamlModificationError");

/**
 * Error raised when YAML modification produces invalid edits or encounters
 * an unsupported modification scenario.
 *
 * @remarks
 * Contains the `path` where modification was attempted and a `reason`
 * string explaining why it failed.
 *
 * @example Catching with `Effect.catchTag`
 * ```ts
 * import { Effect } from "effect";
 * import { modify } from "yaml-effect";
 *
 * const program = modify("{}", ["deep", "path"], 42).pipe(
 *   Effect.catchTag("YamlModificationError", (e) => {
 *     console.error(`Failed at [${e.path.join(", ")}]: ${e.reason}`);
 *     return Effect.succeed([]);
 *   }),
 * );
 * ```
 *
 * @public
 */
export class YamlModificationError extends YamlModificationErrorBase<{
	readonly path: ReadonlyArray<string | number>;
	readonly reason: string;
}> {
	get message(): string {
		return `Modification failed at path [${this.path.join(", ")}]: ${this.reason}`;
	}
}
