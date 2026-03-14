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
 * @privateRemarks
 * This function relies on the assumption that both strings share an identical
 * structural skeleton (they were produced from the same AST). As a result, a
 * simple prefix/suffix match is sufficient and a full Myers-diff algorithm is
 * unnecessary. If the library ever needs to diff arbitrary strings, this
 * function should be replaced with a proper diff implementation.
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
			// +1 for the \n delimiter. For CRLF input, split("\n") leaves \r in each
			// element so origLines[i].length already includes it; the +1 accounts for
			// the \n only. This is correct because computeEdits operates on text
			// produced by stringifyDocument which always uses LF endings.
			offset += origLines[i].length + 1;
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
 * This function is a dual — it can be called either with both arguments
 * directly, or partially applied with just the edits array.
 *
 * @example Direct usage
 * ```typescript
 * import type { ReadonlyArray } from "effect"
 * import { Effect } from "effect"
 * import type { YamlEdit } from "yaml-effect"
 * import { applyEdits, format } from "yaml-effect"
 *
 * const yaml = "name:  John\n"
 *
 * const program = Effect.gen(function* () {
 *   const edits: ReadonlyArray<YamlEdit> = yield* format(yaml)
 *   const result: string = yield* applyEdits(yaml, edits)
 *   return result
 * })
 * ```
 *
 * @example Pipeline usage (partial application)
 * ```typescript
 * import { Effect, pipe } from "effect"
 * import { applyEdits, format } from "yaml-effect"
 *
 * const yaml = "name:  John\n"
 *
 * const program = pipe(
 *   format(yaml),
 *   Effect.flatMap(applyEdits(yaml)),
 * )
 * ```
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
 *
 * @privateRemarks
 * This creates shallow copies of each node with the `comment` field omitted.
 * YamlAlias nodes are returned as-is because they have no comment field.
 * The function is pure — no nodes in the original tree are mutated.
 *
 * @internal
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

/**
 * Plain-object formatting options accepted by {@link format},
 * {@link formatAndApply}, and {@link stripComments}.
 *
 * @remarks
 * This interface mirrors {@link YamlFormattingOptions} but uses plain optional
 * fields instead of Schema.Class validation, making it convenient for callers
 * who do not need full schema-level validation. The `range` field restricts
 * returned edits to a byte range within the source text.
 *
 * @public
 */
export interface RawFormatOptions {
	/** Number of spaces per indentation level (default: 2). */
	indent?: number;
	/** Maximum line width before the stringifier wraps long scalars. */
	lineWidth?: number;
	/** Default quoting style for scalar values. */
	defaultScalarStyle?: ScalarStyle;
	/** Default style (`block` or `flow`) for collections. */
	defaultCollectionStyle?: CollectionStyle;
	/** When `true`, map keys are sorted alphabetically. */
	sortKeys?: boolean;
	/** When `true`, a trailing newline is appended to the output. */
	finalNewline?: boolean;
	/** When `true`, comments are preserved in the output. */
	preserveComments?: boolean;
	/** Restrict returned edits to this byte range within the source text. */
	range?: { offset: number; length: number };
}

// ---------------------------------------------------------------------------
// Internal: format a YAML document via AST round-trip
// ---------------------------------------------------------------------------

/**
 * Internal implementation shared by {@link format} and {@link formatAndApply}.
 *
 * @privateRemarks
 * Separates the `range` field from the rest of the options because
 * `YamlFormattingOptions` (a Schema.Class) does not include `range` — range
 * filtering is applied after stringification by the public `format` function.
 * The `YamlFormattingOptions` instance is constructed from the remaining fields
 * so that default values and validation are applied consistently.
 *
 * @internal
 */
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
 * @example Formatting with indent change and sorted keys
 * ```typescript
 * import { Effect } from "effect"
 * import type { RawFormatOptions } from "yaml-effect"
 * import { format } from "yaml-effect"
 *
 * const yaml = "b: 2\na: 1\n"
 * const options: RawFormatOptions = { indent: 4, sortKeys: true }
 *
 * const program = Effect.gen(function* () {
 *   const edits = yield* format(yaml, options)
 *   // edits is an array of YamlEdit objects describing
 *   // the changes needed to reformat the document
 *   return edits
 * })
 * ```
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
 * Convenience combining parse, apply options, and stringify. Returns the
 * formatted string directly without computing a diff.
 *
 * @example One-step formatting
 * ```typescript
 * import { Effect } from "effect"
 * import { formatAndApply } from "yaml-effect"
 *
 * const yaml = "b: 2\na: 1\n"
 *
 * const program = Effect.gen(function* () {
 *   const formatted: string = yield* formatAndApply(yaml, {
 *     indent: 4,
 *     sortKeys: true,
 *   })
 *   // formatted is the fully reformatted YAML string
 *   return formatted
 * })
 * ```
 *
 * @public
 */
export function formatAndApply(text: string, options?: RawFormatOptions): Effect.Effect<string, YamlFormatError> {
	return formatImpl(text, options ?? {});
}

// ---------------------------------------------------------------------------
// Internal: create a YamlScalar from a JS value
// ---------------------------------------------------------------------------

/**
 * Convert a plain JavaScript value into a YamlScalar AST node.
 *
 * @privateRemarks
 * Only creates plain-style scalars with zero offset/length. This is
 * intentional — the node is immediately stringified, so source position
 * metadata is irrelevant. Complex values (objects, arrays) are not handled;
 * callers are expected to pass scalar-compatible values only.
 *
 * @internal
 */
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

/**
 * Apply a modification to a YamlDocument at a given path.
 *
 * @privateRemarks
 * When the path is empty, the entire document contents are replaced (or
 * cleared if `value` is `undefined`). Otherwise, delegates to
 * {@link modifyNode} to walk the AST and apply the change at the target
 * location. Throws synchronously on navigation failures — the caller
 * (`modifyImpl`) catches and converts these into `YamlModificationError`.
 *
 * @internal
 */
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

/**
 * Recursively navigate a YamlNode tree and apply a modification at the target depth.
 *
 * @privateRemarks
 * Handles YamlMap (string-keyed lookup), YamlSeq (numeric index lookup), and
 * throws on YamlScalar/YamlAlias when further navigation is requested.
 * At the terminal depth: `undefined` removes the key/element, any other value
 * replaces it (or inserts a new pair for maps). All nodes are shallow-copied
 * so the original tree is never mutated.
 *
 * @internal
 */
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

/**
 * Shared implementation for {@link modify} and {@link modifyAndApply}.
 *
 * @privateRemarks
 * Parses the source text into a YamlDocument, applies the AST modification
 * via `modifyDocument`, then stringifies the result. Synchronous errors
 * thrown by `modifyDocument` / `modifyNode` (e.g., path-not-found) are
 * caught and lifted into `YamlModificationError` failures.
 *
 * @internal
 */
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
 * This function is a dual — it can be called with all three arguments
 * directly, or partially applied with path and value first.
 *
 * @example Replacing a value
 * ```typescript
 * import { Effect } from "effect"
 * import { applyEdits, modify } from "yaml-effect"
 *
 * const yaml = "name: John\nage: 30\n"
 *
 * const program = Effect.gen(function* () {
 *   const edits = yield* modify(yaml, ["name"], "Jane")
 *   const result = yield* applyEdits(yaml, edits)
 *   return result
 * })
 * ```
 *
 * @example Inserting a new key
 * ```typescript
 * import { Effect } from "effect"
 * import { applyEdits, modify } from "yaml-effect"
 *
 * const yaml = "name: John\n"
 *
 * const program = Effect.gen(function* () {
 *   const edits = yield* modify(yaml, ["email"], "john@example.com")
 *   const result = yield* applyEdits(yaml, edits)
 *   return result
 * })
 * ```
 *
 * @example Removing a key
 * ```typescript
 * import { Effect } from "effect"
 * import { applyEdits, modify } from "yaml-effect"
 *
 * const yaml = "name: John\nage: 30\n"
 *
 * const program = Effect.gen(function* () {
 *   const edits = yield* modify(yaml, ["age"], undefined)
 *   const result = yield* applyEdits(yaml, edits)
 *   return result
 * })
 * ```
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
 * Same as {@link modify} but returns the modified string directly instead
 * of computing a diff. This function is a dual — it can be called with all
 * three arguments directly, or partially applied with path and value first.
 *
 * @example One-step modification
 * ```typescript
 * import { Effect } from "effect"
 * import { modifyAndApply } from "yaml-effect"
 *
 * const yaml = "name: John\nage: 30\n"
 *
 * const program = Effect.gen(function* () {
 *   const result: string = yield* modifyAndApply(yaml, ["name"], "Jane")
 *   return result
 * })
 * ```
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

// ---------------------------------------------------------------------------
// stripComments
// ---------------------------------------------------------------------------

/**
 * Remove all comments from a YAML document.
 *
 * @remarks
 * Without `replaceCh`: parses the document, removes all comment fields from
 * the AST, and stringifies back. Full-line comments are removed entirely.
 *
 * With `replaceCh` (a single character): replaces each character of comment
 * text (including the `#` marker) with the given character to preserve
 * character offsets. Newlines are always preserved.
 *
 * @example Removing comments from YAML
 * ```typescript
 * import { Effect } from "effect"
 * import { stripComments } from "yaml-effect"
 *
 * const yaml = "name: John # the user name\nage: 30 # years\n"
 *
 * const program = Effect.gen(function* () {
 *   const stripped: string = yield* stripComments(yaml)
 *   // stripped has all comments removed from the document
 *   return stripped
 * })
 * ```
 *
 * @public
 */
export function stripComments(text: string, replaceCh?: string): Effect.Effect<string, YamlFormatError> {
	if (replaceCh !== undefined) {
		// Offset-preserving mode: replace comment characters in the raw text
		return Effect.sync(() => {
			let result = "";
			let i = 0;
			let inComment = false;
			let inSingleQuote = false;
			let inDoubleQuote = false;

			while (i < text.length) {
				const ch = text[i];

				if (inComment) {
					if (ch === "\n") {
						inComment = false;
						result += ch;
					} else {
						result += replaceCh;
					}
				} else if (inDoubleQuote) {
					result += ch;
					if (ch === "\\" && i + 1 < text.length) {
						i++;
						result += text[i];
					} else if (ch === '"') {
						inDoubleQuote = false;
					}
				} else if (inSingleQuote) {
					result += ch;
					if (ch === "'" && i + 1 < text.length && text[i + 1] === "'") {
						i++;
						result += text[i];
					} else if (ch === "'") {
						inSingleQuote = false;
					}
				} else if (ch === '"') {
					inDoubleQuote = true;
					result += ch;
				} else if (ch === "'") {
					inSingleQuote = true;
					result += ch;
				} else if (ch === "#") {
					const prev = i > 0 ? text[i - 1] : "\n";
					if (prev === " " || prev === "\t" || prev === "\n" || i === 0) {
						inComment = true;
						result += replaceCh;
					} else {
						result += ch;
					}
				} else {
					result += ch;
				}

				i++;
			}

			return result;
		});
	}

	// Removal mode: parse, strip comments, stringify
	return parseDocument(text).pipe(
		Effect.mapError((e) => new YamlFormatError({ text, reason: e.message })),
		Effect.flatMap((doc) => {
			// Check for fatal parse errors
			if (doc.errors.length > 0) {
				return Effect.fail(new YamlFormatError({ text, reason: doc.errors[0].message }));
			}

			const contents = doc.contents ? stripNodeComments(doc.contents) : null;

			const strippedDoc = new YamlDocument({
				contents,
				errors: doc.errors,
				warnings: doc.warnings,
				directives: doc.directives,
			});

			return stringifyDocument(strippedDoc).pipe(
				Effect.mapError((e) => new YamlFormatError({ text, reason: e.message })),
			);
		}),
	);
}
