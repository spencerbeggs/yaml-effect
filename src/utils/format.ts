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
import { YamlFormatError } from "../errors/YamlFormatError.js";
import { YamlModificationError } from "../errors/YamlModificationError.js";
import type { YamlNode } from "../schemas/YamlAstNodes.js";
import { YamlMap, YamlPair, YamlScalar, YamlSeq } from "../schemas/YamlAstNodes.js";
import { YamlDocument } from "../schemas/YamlDocument.js";
import { YamlFormattingOptions } from "../schemas/YamlFormattingOptions.js";
import type { CollectionStyle, ScalarStyle, YamlPath } from "../schemas/YamlShared.js";
import { YamlEdit } from "../schemas/YamlShared.js";
import { parseDocument } from "./composer.js";
import { stringifyDocument } from "./stringify.js";

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
function computeEdits(original: string, modified: string): ReadonlyArray<YamlEdit> {
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

// ---------------------------------------------------------------------------
// Internal: strip comments from AST nodes
// ---------------------------------------------------------------------------

/**
 * Recursively create a copy of a YamlNode with all comment fields removed.
 */
function stripNodeComments(node: YamlNode): YamlNode {
	if (node instanceof YamlScalar) {
		return new YamlScalar({
			value: node.value,
			style: node.style,
			tag: node.tag,
			anchor: node.anchor,
			offset: node.offset,
			length: node.length,
		});
	}
	if (node instanceof YamlMap) {
		return new YamlMap({
			items: node.items.map(
				(pair) =>
					new YamlPair({
						key: stripNodeComments(pair.key),
						value: pair.value ? stripNodeComments(pair.value) : null,
					}),
			),
			style: node.style,
			tag: node.tag,
			anchor: node.anchor,
			offset: node.offset,
			length: node.length,
		});
	}
	if (node instanceof YamlSeq) {
		return new YamlSeq({
			items: node.items.map(stripNodeComments),
			style: node.style,
			tag: node.tag,
			anchor: node.anchor,
			offset: node.offset,
			length: node.length,
		});
	}
	// YamlAlias has no comment field
	return node;
}

// ---------------------------------------------------------------------------
// Internal: raw options shape (avoids Schema.Class validation for range)
// ---------------------------------------------------------------------------

interface RawFormatOptions {
	indent?: number;
	lineWidth?: number;
	defaultScalarStyle?: ScalarStyle;
	defaultCollectionStyle?: CollectionStyle;
	sortKeys?: boolean;
	finalNewline?: boolean;
	preserveComments?: boolean;
	range?: { offset: number; length: number };
}

// ---------------------------------------------------------------------------
// Internal: format a YAML document via AST round-trip
// ---------------------------------------------------------------------------

function formatImpl(text: string, raw: RawFormatOptions): Effect.Effect<string, YamlFormatError> {
	// Build YamlFormattingOptions without the range field (which requires a
	// YamlRange class instance — range is handled separately in format()).
	const { range: _range, ...rest } = raw;
	const opts = new YamlFormattingOptions(rest);

	return parseDocument(text).pipe(
		Effect.mapError((e) => new YamlFormatError({ text, reason: e.message })),
		Effect.flatMap((doc) => {
			// Treat non-empty doc.errors as a format failure
			if (doc.errors.length > 0) {
				return Effect.fail(new YamlFormatError({ text, reason: doc.errors[0].message }));
			}

			let contents = doc.contents;

			// Strip comments if requested
			if (!opts.preserveComments && contents) {
				contents = stripNodeComments(contents);
			}

			const outputDoc = new YamlDocument({
				contents,
				errors: doc.errors,
				warnings: doc.warnings,
				directives: doc.directives,
				comment: opts.preserveComments ? doc.comment : undefined,
			});

			return stringifyDocument(outputDoc, {
				indent: opts.indent,
				lineWidth: opts.lineWidth,
				defaultScalarStyle: opts.defaultScalarStyle,
				defaultCollectionStyle: opts.defaultCollectionStyle,
				sortKeys: opts.sortKeys,
				finalNewline: opts.finalNewline,
			}).pipe(Effect.mapError((e) => new YamlFormatError({ text, reason: e.message })));
		}),
	);
}

// ---------------------------------------------------------------------------
// format
// ---------------------------------------------------------------------------

/**
 * Compute formatting edits for a YAML document.
 *
 * @remarks
 * Parses the input into an AST Document, applies formatting options, and
 * stringifies back. Returns the diff as an array of {@link YamlEdit} objects.
 * When `options.range` is set, only edits within that range are returned.
 *
 * @public
 */
export function format(
	text: string,
	options?: RawFormatOptions,
): Effect.Effect<ReadonlyArray<YamlEdit>, YamlFormatError> {
	return formatImpl(text, options ?? {}).pipe(
		Effect.map((formatted) => {
			let edits = computeEdits(text, formatted);

			if (options?.range) {
				const rangeStart = options.range.offset;
				const rangeEnd = options.range.offset + options.range.length;
				edits = edits.filter((e) => {
					const editEnd = e.offset + e.length;
					return e.offset >= rangeStart && editEnd <= rangeEnd;
				});
			}

			return edits;
		}),
	);
}

// ---------------------------------------------------------------------------
// formatAndApply
// ---------------------------------------------------------------------------

/**
 * Format a YAML document in one step.
 *
 * @remarks
 * Convenience combining parse → apply options → stringify. Returns the
 * formatted string directly without computing a diff.
 *
 * @public
 */
export function formatAndApply(text: string, options?: RawFormatOptions): Effect.Effect<string, YamlFormatError> {
	return formatImpl(text, options ?? {});
}

// ---------------------------------------------------------------------------
// Internal: create a YamlScalar from a JS value
// ---------------------------------------------------------------------------

function jsValueToNode(value: unknown): YamlNode {
	return new YamlScalar({
		value,
		style: "plain" as const,
		offset: 0,
		length: 0,
	});
}

// ---------------------------------------------------------------------------
// Internal: modify a YAML document via AST manipulation
// ---------------------------------------------------------------------------

function modifyDocument(doc: YamlDocument, path: YamlPath, value: unknown): YamlDocument {
	if (path.length === 0) {
		return new YamlDocument({
			contents: value === undefined ? null : jsValueToNode(value),
			errors: doc.errors,
			warnings: doc.warnings,
			directives: doc.directives,
			comment: doc.comment,
		});
	}

	if (!doc.contents) {
		throw new Error("Cannot navigate path in empty document");
	}

	const newContents = modifyNode(doc.contents, path, 0, value);

	return new YamlDocument({
		contents: newContents,
		errors: doc.errors,
		warnings: doc.warnings,
		directives: doc.directives,
		comment: doc.comment,
	});
}

function modifyNode(node: YamlNode, path: YamlPath, depth: number, value: unknown): YamlNode {
	const segment = path[depth];
	const isLast = depth === path.length - 1;

	if (node instanceof YamlMap) {
		const pairIndex = node.items.findIndex((pair) => pair.key instanceof YamlScalar && pair.key.value === segment);

		if (isLast) {
			if (value === undefined) {
				// Remove the key
				if (pairIndex < 0) return node; // Nothing to remove
				const newItems = [...node.items];
				newItems.splice(pairIndex, 1);
				return new YamlMap({
					items: newItems,
					style: node.style,
					tag: node.tag,
					anchor: node.anchor,
					comment: node.comment,
					offset: node.offset,
					length: node.length,
				});
			}

			const newValueNode = jsValueToNode(value);
			if (pairIndex >= 0) {
				// Replace existing value
				const newItems = [...node.items];
				const oldPair = newItems[pairIndex];
				newItems[pairIndex] = new YamlPair({
					key: oldPair.key,
					value: newValueNode,
					comment: oldPair.comment,
				});
				return new YamlMap({
					items: newItems,
					style: node.style,
					tag: node.tag,
					anchor: node.anchor,
					comment: node.comment,
					offset: node.offset,
					length: node.length,
				});
			}

			// Insert new key
			const keyNode = new YamlScalar({
				value: String(segment),
				style: "plain" as const,
				offset: 0,
				length: 0,
			});
			const newPair = new YamlPair({
				key: keyNode,
				value: newValueNode,
			});
			return new YamlMap({
				items: [...node.items, newPair],
				style: node.style,
				tag: node.tag,
				anchor: node.anchor,
				comment: node.comment,
				offset: node.offset,
				length: node.length,
			});
		}

		// Navigate deeper
		if (pairIndex < 0) {
			throw new Error(`Key "${String(segment)}" not found in mapping`);
		}
		const pair = node.items[pairIndex];
		if (!pair.value) {
			throw new Error(`Value at key "${String(segment)}" is null`);
		}
		const newValue = modifyNode(pair.value, path, depth + 1, value);
		const newItems = [...node.items];
		newItems[pairIndex] = new YamlPair({
			key: pair.key,
			value: newValue,
			comment: pair.comment,
		});
		return new YamlMap({
			items: newItems,
			style: node.style,
			tag: node.tag,
			anchor: node.anchor,
			comment: node.comment,
			offset: node.offset,
			length: node.length,
		});
	}

	if (node instanceof YamlSeq) {
		const idx = typeof segment === "number" ? segment : Number(segment);
		if (Number.isNaN(idx) || idx < 0) {
			throw new Error(`Invalid sequence index: ${String(segment)}`);
		}

		if (isLast) {
			const newItems = [...node.items];
			if (value === undefined) {
				if (idx < newItems.length) {
					newItems.splice(idx, 1);
				}
			} else if (idx < newItems.length) {
				newItems[idx] = jsValueToNode(value);
			} else {
				newItems.push(jsValueToNode(value));
			}
			return new YamlSeq({
				items: newItems,
				style: node.style,
				tag: node.tag,
				anchor: node.anchor,
				comment: node.comment,
				offset: node.offset,
				length: node.length,
			});
		}

		// Navigate deeper
		if (idx >= node.items.length) {
			throw new Error(`Index ${idx} out of bounds`);
		}
		const child = node.items[idx];
		const newChild = modifyNode(child, path, depth + 1, value);
		const newItems = [...node.items];
		newItems[idx] = newChild;
		return new YamlSeq({
			items: newItems,
			style: node.style,
			tag: node.tag,
			anchor: node.anchor,
			comment: node.comment,
			offset: node.offset,
			length: node.length,
		});
	}

	throw new Error(`Cannot navigate through ${node._tag} at segment "${String(segment)}"`);
}

// ---------------------------------------------------------------------------
// Internal: modify implementation
// ---------------------------------------------------------------------------

function modifyImpl(text: string, path: YamlPath, value: unknown): Effect.Effect<string, YamlModificationError> {
	return parseDocument(text).pipe(
		Effect.mapError(
			(e) =>
				new YamlModificationError({
					path,
					reason: e.message,
				}),
		),
		Effect.flatMap((doc) => {
			try {
				const modified = modifyDocument(doc, path, value);
				return stringifyDocument(modified).pipe(
					Effect.mapError(
						(e) =>
							new YamlModificationError({
								path,
								reason: e.message,
							}),
					),
				);
			} catch (err) {
				return Effect.fail(
					new YamlModificationError({
						path,
						reason: err instanceof Error ? err.message : String(err),
					}),
				);
			}
		}),
	);
}

// ---------------------------------------------------------------------------
// modify
// ---------------------------------------------------------------------------

/**
 * Compute edits to insert, replace, or remove a value at a YAML path.
 *
 * @remarks
 * Parses the input, navigates to the target path in the Document AST,
 * applies the change, stringifies back, and diffs to produce edits.
 * Pass `undefined` as `value` to remove the property or element.
 *
 * @public
 */
export const modify: {
	(path: YamlPath, value: unknown): (text: string) => Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
	(text: string, path: YamlPath, value: unknown): Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
} = Fn.dual(
	3,
	(text: string, path: YamlPath, value: unknown): Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError> =>
		modifyImpl(text, path, value).pipe(Effect.map((modified) => computeEdits(text, modified))),
);

// ---------------------------------------------------------------------------
// modifyAndApply
// ---------------------------------------------------------------------------

/**
 * Modify a YAML document in one step.
 *
 * @remarks
 * Same as {@link modify} but returns the modified string directly.
 *
 * @public
 */
export const modifyAndApply: {
	(path: YamlPath, value: unknown): (text: string) => Effect.Effect<string, YamlModificationError>;
	(text: string, path: YamlPath, value: unknown): Effect.Effect<string, YamlModificationError>;
} = Fn.dual(
	3,
	(text: string, path: YamlPath, value: unknown): Effect.Effect<string, YamlModificationError> =>
		modifyImpl(text, path, value),
);
