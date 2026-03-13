/**
 * YAML composer error type.
 *
 * @packageDocumentation
 */

import { Data } from "effect";
import type { YamlErrorDetail } from "./YamlErrorDetail.js";

/**
 * Base class for {@link YamlComposerError}.
 *
 * @internal
 */
export const YamlComposerErrorBase = Data.TaggedError("YamlComposerError");

/**
 * Error raised when YAML composition encounters one or more errors.
 *
 * @public
 */
export class YamlComposerError extends YamlComposerErrorBase<{
	readonly errors: ReadonlyArray<YamlErrorDetail>;
	readonly text: string;
}> {
	get message(): string {
		const count = this.errors.length;
		return `YAML compose failed with ${count} error${count !== 1 ? "s" : ""}: ${this.errors.map((e) => e.message).join("; ")}`;
	}
}
