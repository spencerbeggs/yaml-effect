/**
 * YAML stringify error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlStringifyError}.
 *
 * @internal
 */
export const YamlStringifyErrorBase = Data.TaggedError("YamlStringifyError");

/**
 * Error raised when YAML stringification fails.
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
