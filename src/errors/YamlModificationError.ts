/**
 * YAML modification error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlModificationError}.
 *
 * @internal
 */
export const YamlModificationErrorBase = Data.TaggedError("YamlModificationError");

/**
 * Error raised when YAML modification fails.
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
