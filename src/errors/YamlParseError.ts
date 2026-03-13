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
 * @internal
 */
export const YamlParseErrorBase = Data.TaggedError("YamlParseError");

/**
 * Error raised when YAML parsing encounters one or more errors.
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
