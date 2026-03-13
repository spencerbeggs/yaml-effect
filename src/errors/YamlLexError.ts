/**
 * YAML lexer error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";
import type { YamlErrorDetail } from "./YamlErrorDetail.js";

/**
 * Base class for {@link YamlLexError}.
 *
 * @internal
 */
export const YamlLexErrorBase = Data.TaggedError("YamlLexError");

/**
 * Error raised when YAML lexing encounters one or more errors.
 *
 * @public
 */
export class YamlLexError extends YamlLexErrorBase<{
	readonly errors: ReadonlyArray<YamlErrorDetail>;
	readonly text: string;
}> {
	get message(): string {
		const count = this.errors.length;
		return `YAML lex failed with ${count} error${count !== 1 ? "s" : ""}: ${this.errors.map((e) => e.message).join("; ")}`;
	}
}
