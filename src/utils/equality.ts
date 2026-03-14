/**
 * YAML equality comparisons — semantic equivalence for YAML documents.
 *
 * Compares parsed values ignoring comments, whitespace, formatting,
 * and mapping key ordering. Sequence order IS significant.
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn } from "effect";
import type { YamlComposerError } from "../errors/YamlComposerError.js";
import { parse } from "./composer.js";

// ---------------------------------------------------------------------------
// Internal: deep structural equality
// ---------------------------------------------------------------------------

/**
 * Deep-compare two plain JS values for structural equality.
 * Object key order is ignored (recursively at all nesting levels).
 * Array order is significant.
 *
 * @internal
 */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;

	// Handle NaN (NaN !== NaN but should be considered equal)
	if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) {
		return true;
	}

	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false;
		}
		return true;
	}
	if (Array.isArray(b)) return false;

	if (typeof a === "object" && typeof b === "object") {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);
		if (aKeys.length !== bKeys.length) return false;
		for (const key of aKeys) {
			if (!Object.hasOwn(bObj, key)) return false;
			if (!deepEqual(aObj[key], bObj[key])) return false;
		}
		return true;
	}

	return false;
}

// ---------------------------------------------------------------------------
// equals
// ---------------------------------------------------------------------------

/**
 * Compare two YAML strings for semantic equality.
 *
 * @remarks
 * Both strings are parsed via {@link parse} (which resolves anchors/aliases
 * to plain JS values) and then deep-compared. Comments, whitespace,
 * formatting, and object key ordering are ignored. Array order IS
 * significant. For multi-document input, only the first document is
 * compared.
 *
 * @public
 */
export const equals: {
	(that: string): (self: string) => Effect.Effect<boolean, YamlComposerError>;
	(self: string, that: string): Effect.Effect<boolean, YamlComposerError>;
} = Fn.dual(
	2,
	(self: string, that: string): Effect.Effect<boolean, YamlComposerError> =>
		Effect.map(Effect.all([parse(self), parse(that)]), ([a, b]) => deepEqual(a, b)),
);

// ---------------------------------------------------------------------------
// equalsValue
// ---------------------------------------------------------------------------

/**
 * Compare a YAML string against a JavaScript value for semantic equality.
 *
 * @remarks
 * Only the YAML string is parsed; the JS value is used as-is. Same
 * comparison semantics as {@link equals}.
 *
 * @public
 */
export const equalsValue: {
	(value: unknown): (self: string) => Effect.Effect<boolean, YamlComposerError>;
	(self: string, value: unknown): Effect.Effect<boolean, YamlComposerError>;
} = Fn.dual(
	2,
	(self: string, value: unknown): Effect.Effect<boolean, YamlComposerError> =>
		Effect.map(parse(self), (parsed) => deepEqual(parsed, value)),
);
