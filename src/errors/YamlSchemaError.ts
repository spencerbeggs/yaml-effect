/**
 * YAML schema validation error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";

/**
 * Base class for {@link YamlSchemaError}.
 *
 * @internal
 */
export const YamlSchemaErrorBase = Data.TaggedError("YamlSchemaError");

/**
 * Error raised when YAML schema validation fails.
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
