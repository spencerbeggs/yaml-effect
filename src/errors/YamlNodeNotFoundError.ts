/**
 * YAML node not found error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlNodeNotFoundError}.
 *
 * @privateRemarks
 * The `*Base` pattern is required because `Data.TaggedError` produces complex
 * type signatures involving intersection types and branded generics that
 * api-extractor cannot roll up into a single `.d.ts` bundle. By exporting
 * the base separately as `@internal`, the public `YamlNodeNotFoundError`
 * class extends it with concrete fields, giving api-extractor a simple class
 * declaration to work with.
 *
 * @internal
 */
export const YamlNodeNotFoundErrorBase = Data.TaggedError("YamlNodeNotFoundError");

/**
 * Error raised when AST navigation fails to find a node at the given path.
 *
 * @remarks
 * Contains the `path` that was searched and the `rootNodeType` of the tree
 * that was traversed.
 *
 * @see {@link findNode} — may fail with this error
 *
 * @example Catching with `Effect.catchTag`
 * ```ts
 * import { Effect } from "effect";
 * import { parseDocument, findNode } from "@spencerbeggs/yaml-effect";
 *
 * const program = parseDocument("a: 1").pipe(
 *   Effect.flatMap((doc) => findNode(doc.contents!, ["missing"])),
 *   Effect.catchTag("YamlNodeNotFoundError", (e) => {
 *     console.error(`Not found: [${e.path.join(", ")}] in ${e.rootNodeType}`);
 *     return Effect.succeed(undefined);
 *   }),
 * );
 * ```
 *
 * @public
 */
export class YamlNodeNotFoundError extends YamlNodeNotFoundErrorBase<{
	readonly path: ReadonlyArray<string | number>;
	readonly rootNodeType: string;
}> {
	get message(): string {
		return `Node not found at path [${this.path.join(", ")}] in ${this.rootNodeType} node`;
	}
}
