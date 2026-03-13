/**
 * YAML format error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlFormatError}.
 *
 * @internal
 */
export const YamlFormatErrorBase = Data.TaggedError("YamlFormatError");

/**
 * Error raised when YAML formatting fails.
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
