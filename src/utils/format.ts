/**
 * YAML formatting, modification, and edit application.
 *
 * All mutation functions use an AST-based approach (parse → transform →
 * stringify) using the project's own YAML pipeline and return computed edits
 * rather than mutated strings.
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn } from "effect";
import { YamlEdit } from "../schemas/YamlShared.js";

// ---------------------------------------------------------------------------
// Internal: character-level diff
// ---------------------------------------------------------------------------

/**
 * Compute edits by diffing two strings character by character.
 *
 * Walks both strings from each end inward to find the common prefix and
 * suffix, then emits a single edit covering the changed region in the
 * middle. This is sufficient because both strings derive from the same AST
 * and share structural skeleton — typically only whitespace and values differ.
 *
 * For more granular edits (multiple disjoint changes), a line-level pass
 * splits the middle region into per-line edits when possible.
 *
 * @internal
 */
export function computeEdits(original: string, modified: string): ReadonlyArray<YamlEdit> {
	if (original === modified) return [];

	// Find common prefix
	let prefixLen = 0;
	const minLen = Math.min(original.length, modified.length);
	while (prefixLen < minLen && original[prefixLen] === modified[prefixLen]) {
		prefixLen++;
	}

	// Find common suffix (not overlapping with prefix)
	let suffixLen = 0;
	while (
		suffixLen < minLen - prefixLen &&
		original[original.length - 1 - suffixLen] === modified[modified.length - 1 - suffixLen]
	) {
		suffixLen++;
	}

	const origStart = prefixLen;
	const origEnd = original.length - suffixLen;
	const modStart = prefixLen;
	const modEnd = modified.length - suffixLen;

	if (origStart >= origEnd && modStart >= modEnd) {
		return [];
	}

	// Try to split into line-level edits for better granularity
	const origMiddle = original.substring(origStart, origEnd);
	const modMiddle = modified.substring(modStart, modEnd);
	const origLines = origMiddle.split("\n");
	const modLines = modMiddle.split("\n");

	if (origLines.length === modLines.length && origLines.length > 1) {
		// Same number of lines — emit per-line edits for changed lines only
		const edits: YamlEdit[] = [];
		let offset = origStart;
		for (let i = 0; i < origLines.length; i++) {
			if (origLines[i] !== modLines[i]) {
				edits.push(
					new YamlEdit({
						offset,
						length: origLines[i].length,
						content: modLines[i],
					}),
				);
			}
			offset += origLines[i].length + 1; // +1 for the \n (assumes LF-only)
		}
		return edits;
	}

	// Fallback: single edit covering the entire changed region
	return [
		new YamlEdit({
			offset: origStart,
			length: origEnd - origStart,
			content: modified.substring(modStart, modEnd),
		}),
	];
}

// ---------------------------------------------------------------------------
// applyEdits
// ---------------------------------------------------------------------------

/**
 * Apply an array of text edits to YAML source text.
 *
 * @remarks
 * Edits are sorted in reverse offset order before application so that
 * earlier edits do not shift the offsets of later ones. Offsets beyond the
 * string boundary are clamped. The original `edits` array is not mutated.
 *
 * @public
 */
export const applyEdits: {
	(edits: ReadonlyArray<YamlEdit>): (text: string) => Effect.Effect<string>;
	(text: string, edits: ReadonlyArray<YamlEdit>): Effect.Effect<string>;
} = Fn.dual(
	2,
	(text: string, edits: ReadonlyArray<YamlEdit>): Effect.Effect<string> =>
		Effect.sync(() => {
			const sorted = [...edits].sort((a, b) => b.offset - a.offset);
			let result = text;
			for (const edit of sorted) {
				const offset = Math.min(edit.offset, result.length);
				const length = Math.min(edit.length, result.length - offset);
				result = result.substring(0, offset) + edit.content + result.substring(offset + length);
			}
			return result;
		}),
);
