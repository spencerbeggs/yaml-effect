/**
 * YAML node not found error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlNodeNotFoundError}.
 *
 * @internal
 */
export const YamlNodeNotFoundErrorBase = Data.TaggedError("YamlNodeNotFoundError");

/**
 * Error raised when AST navigation fails to find a node at the given path.
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
