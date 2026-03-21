/**
 * YAML 1.2 Composer — transforms CST nodes into AST nodes with typed values.
 *
 * Implements YAML 1.2 Core Schema type resolution (spec chapter 10.3.2) and
 * produces {@link YamlDocument} instances from the concrete syntax tree.
 *
 * @packageDocumentation
 */

import { Effect } from "effect";
import { YamlComposerError } from "../errors/YamlComposerError.js";
import { YamlErrorDetail } from "../errors/YamlErrorDetail.js";
import type { CstNode } from "../schemas/CstNode.js";
import type { YamlNode } from "../schemas/YamlAstNodes.js";
import { YamlAlias, YamlMap, YamlPair, YamlScalar, YamlSeq } from "../schemas/YamlAstNodes.js";
import { YamlDirective, YamlDocument } from "../schemas/YamlDocument.js";
import type { YamlParseOptions } from "../schemas/YamlParseOptions.js";
import type { CollectionStyle, ScalarStyle } from "../schemas/YamlShared.js";
import { parseCSTAll } from "./parser.js";

// ---------------------------------------------------------------------------
// Line/column computation
// ---------------------------------------------------------------------------

function lineCol(text: string, offset: number): { line: number; column: number } {
	let line = 0;
	let column = 0;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text[i] === "\n") {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return { line, column };
}

// ---------------------------------------------------------------------------
// YAML 1.2 Core Schema type resolution
// ---------------------------------------------------------------------------

const NULL_RE = /^(?:null|Null|NULL|~)$/;
const TRUE_RE = /^(?:true|True|TRUE)$/;
const FALSE_RE = /^(?:false|False|FALSE)$/;
const INT_RE = /^[-+]?[0-9]+$/;
const OCT_RE = /^0o[0-7]+$/;
const HEX_RE = /^0x[\dA-Fa-f]+$/;
const FLOAT_RE = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;
const INF_RE = /^[-+]?\.(?:inf|Inf|INF)$/;
const NAN_RE = /^\.(?:nan|NaN|NAN)$/;

/**
 * Parses an integer string, returning `bigint` when the value exceeds
 * `Number.MAX_SAFE_INTEGER` to avoid silent precision loss.
 */
function safeParseInt(value: string, radix: number): number | bigint {
	const n = Number.parseInt(value, radix);
	if (Number.isSafeInteger(n)) return n;
	// Fall back to BigInt for values that exceed safe integer range
	const prefix = radix === 16 ? "0x" : radix === 8 ? "0o" : "";
	return BigInt(`${prefix}${value}`);
}

function resolvePlainScalar(value: string): unknown {
	if (value === "" || NULL_RE.test(value)) return null;
	if (TRUE_RE.test(value)) return true;
	if (FALSE_RE.test(value)) return false;
	if (OCT_RE.test(value)) return safeParseInt(value.slice(2), 8);
	if (HEX_RE.test(value)) return safeParseInt(value.slice(2), 16);
	if (INT_RE.test(value)) return safeParseInt(value, 10);
	if (INF_RE.test(value)) return value.startsWith("-") ? -Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
	if (NAN_RE.test(value)) return Number.NaN;
	if (FLOAT_RE.test(value)) {
		const n = Number.parseFloat(value);
		if (!Number.isNaN(n)) return n;
	}
	return value;
}

function resolveTaggedScalar(rawValue: string, tag: string): unknown {
	switch (tag) {
		case "!!str":
		case "tag:yaml.org,2002:str":
			return rawValue;
		case "!!int":
		case "tag:yaml.org,2002:int": {
			if (OCT_RE.test(rawValue)) return Number.parseInt(rawValue.slice(2), 8);
			if (HEX_RE.test(rawValue)) return Number.parseInt(rawValue.slice(2), 16);
			const n = Number.parseInt(rawValue, 10);
			return Number.isNaN(n) ? rawValue : n;
		}
		case "!!float":
		case "tag:yaml.org,2002:float": {
			if (INF_RE.test(rawValue)) return rawValue.startsWith("-") ? -Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
			if (NAN_RE.test(rawValue)) return Number.NaN;
			const n = Number.parseFloat(rawValue);
			return Number.isNaN(n) ? rawValue : n;
		}
		case "!!bool":
		case "tag:yaml.org,2002:bool": {
			if (TRUE_RE.test(rawValue)) return true;
			if (FALSE_RE.test(rawValue)) return false;
			return rawValue;
		}
		case "!!null":
		case "tag:yaml.org,2002:null":
			return null;
		default:
			return rawValue;
	}
}

function resolveScalar(rawValue: string, style: ScalarStyle, tag?: string, state?: ComposerState): unknown {
	if (tag) {
		const resolvedTag = state ? resolveTagHandle(tag, state) : tag;
		return resolveTaggedScalar(rawValue, resolvedTag);
	}
	if (style !== "plain") return rawValue;
	return resolvePlainScalar(rawValue);
}

// ---------------------------------------------------------------------------
// Scalar decoding
// ---------------------------------------------------------------------------

function getScalarStyle(node: CstNode): ScalarStyle {
	if (node.type === "block-scalar") {
		const ch = node.source.trimStart()[0];
		return ch === ">" ? "block-folded" : "block-literal";
	}
	const first = node.source[0];
	if (first === "'") return "single-quoted";
	if (first === '"') return "double-quoted";
	return "plain";
}

function getScalarValue(node: CstNode, fullText?: string): string {
	if (node.type === "block-scalar") return decodeBlockScalar(node.source, fullText, node.offset);
	const style = getScalarStyle(node);
	if (style === "single-quoted") return decodeSingleQuoted(node.source);
	if (style === "double-quoted") return decodeDoubleQuoted(node.source);
	return decodePlainScalar(node.source);
}

/**
 * YAML 1.2 §6.5 flow line folding for plain scalars.
 * - Bare newline between non-empty lines becomes a space (fold)
 * - Empty line(s) preserved as newline characters
 * - Leading whitespace on continuation lines trimmed
 * - Trailing whitespace before newlines trimmed
 */
function decodePlainScalar(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed.includes("\n")) return trimmed;
	return foldFlowLines(trimmed);
}

/**
 * Decode single-quoted scalar with flow folding.
 * Only escape: '' → '
 * Bare newlines follow flow folding rules.
 */
function decodeSingleQuoted(raw: string): string {
	const inner = raw.slice(1, -1);
	const unescaped = inner.replace(/''/g, "'");
	if (!unescaped.includes("\n")) return unescaped;
	return foldFlowLines(unescaped);
}

/**
 * Apply YAML 1.2 §6.5 flow line folding to a string.
 * - Split into lines, trim trailing whitespace from each
 * - Newline between non-empty lines becomes a space
 * - Empty line preserved as newline in output
 * - Leading whitespace (indentation) on continuation lines trimmed
 */
function foldFlowLines(text: string): string {
	const lines = text.split("\n");
	let result = "";
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (i === 0) {
			// First line: trim trailing whitespace only
			result += line.replace(/[ \t]+$/, "");
			continue;
		}
		// Continuation line: trim leading whitespace (indentation)
		// Trim trailing whitespace only on non-last lines (before a line break)
		const isLast = i === lines.length - 1;
		const trimmed = isLast ? line.trimStart() : line.trim();
		if (trimmed === "") {
			if (isLast) {
				// Last line empty after trimming indentation — just the closing
				// delimiter's line; fold the preceding newline to a space if no
				// empty lines came before it, otherwise drop silently.
				if (result.length === 0 || result[result.length - 1] !== "\n") {
					result += " ";
				}
			} else {
				// Empty line → newline
				result += "\n";
			}
		} else {
			// Non-empty continuation line: fold (previous non-empty → space → this)
			// But if the last char of result is already \n (from empty lines), don't add space
			if (result.length > 0 && result[result.length - 1] !== "\n") {
				result += " ";
			}
			result += trimmed;
		}
	}
	return result;
}

/**
 * Collect a multi-line plain scalar key from consecutive CST children.
 * Like `collectMultilinePlainScalar`, but for keys: collects plain scalars
 * up until the `:` value separator, merging them with flow line folding.
 * Returns the folded key text and the index after the last consumed child.
 */
function collectMultilineKey(children: readonly CstNode[], startIdx: number): { value: string; nextIdx: number } {
	const first = children[startIdx];
	if (!first || first.type !== "flow-scalar") {
		return { value: first?.source.trim() ?? "", nextIdx: startIdx + 1 };
	}

	const parts: string[] = [first.source.trim()];
	let idx = startIdx + 1;

	while (idx < children.length) {
		const child = children[idx];
		if (!child) break;

		if (child.type === "newline" || (child.type === "whitespace" && child.source.trim() === "")) {
			idx++;
			continue;
		}
		// Stop at the value separator or comma (segment boundary)
		if (child.type === "whitespace" && (child.source === ":" || child.source === ",")) break;
		if (child.type === "flow-scalar" && getScalarStyle(child) === "plain") {
			parts.push(child.source.trim());
			idx++;
			continue;
		}
		// Any other node type — stop merging
		break;
	}

	if (parts.length === 1) {
		return { value: parts[0] ?? "", nextIdx: idx };
	}

	return { value: foldFlowLines(parts.join("\n")), nextIdx: idx };
}

/**
 * Extract the trimmed content of the line at `offset` in `text`.
 * Returns the trimmed text and the offset of the next line (or EOF).
 */
function extractLineContent(text: string, offset: number): { lineText: string; lineEndOffset: number } {
	// Find start of line
	let lineStart = offset;
	while (lineStart > 0 && text[lineStart - 1] !== "\n") {
		lineStart--;
	}
	// Find end of line
	let lineEnd = offset;
	while (lineEnd < text.length && text[lineEnd] !== "\n" && text[lineEnd] !== "\r") {
		lineEnd++;
	}
	return { lineText: text.slice(lineStart, lineEnd).trim(), lineEndOffset: lineEnd };
}

/**
 * Skip all children whose offset falls on the same line as `lineOffset`.
 * Returns the index of the first child that is past the line end.
 */
function skipChildrenOnLine(children: readonly CstNode[], startIdx: number, lineEndOffset: number): number {
	let idx = startIdx;
	while (idx < children.length) {
		const c = children[idx];
		if (!c) break;
		// Children that start at or before the line end belong to this line.
		// But newlines at the line end separate lines — stop before the newline.
		if (c.type === "newline" && c.offset >= lineEndOffset) break;
		if (c.offset > lineEndOffset) break;
		idx++;
	}
	return idx;
}

/**
 * Collect a multi-line plain scalar from consecutive CST children.
 * Starting from a plain flow-scalar at `startIdx`, look ahead through
 * newlines and whitespace for more plain flow-scalars that continue the
 * same value. Returns the folded scalar text and the index after the last
 * consumed child.
 *
 * A continuation scalar must:
 * - Be a plain flow-scalar (not quoted)
 * - NOT be followed by a value-sep (`:`) — that makes it a mapping key
 * - Be separated from the previous scalar only by newlines/whitespace
 *
 * When the lexer mis-tokenizes continuation line content as anchors, tags,
 * aliases, directives, or block-seq entries, this function detects such
 * lines and extracts the raw source text as continuation parts (3MYT, FBC9,
 * XLQ9, AB8U).
 */
function collectMultilinePlainScalar(
	children: readonly CstNode[],
	startIdx: number,
	minContinuationColumn?: number,
	sourceText?: string,
): { value: string; nextIdx: number; partsCount: number } {
	const first = children[startIdx];
	if (!first || first.type !== "flow-scalar") {
		return { value: first?.source.trim() ?? "", nextIdx: startIdx + 1, partsCount: 1 };
	}

	// Only merge plain scalars (not quoted)
	const style = getScalarStyle(first);
	if (style !== "plain") {
		return { value: getScalarValue(first), nextIdx: startIdx + 1, partsCount: 1 };
	}

	const parts: string[] = [first.source.trim()];
	let emptyLines = 0;
	let idx = startIdx + 1;
	// Track whether we've seen a newline since the last content (for continuation detection)
	let sawNewline = false;

	while (idx < children.length) {
		const child = children[idx];
		if (!child) break;

		if (child.type === "newline") {
			emptyLines++;
			sawNewline = true;
			idx++;
			continue;
		}
		if (child.type === "whitespace") {
			// Block structure indicators terminate plain scalar continuation
			if (child.source === ":" || child.source === "?" || child.source === "-") break;
			idx++;
			continue;
		}
		if (child.type === "comment") {
			// Comments terminate plain scalar continuation
			break;
		}
		if (child.type === "flow-scalar" && getScalarStyle(child) === "plain") {
			// Check if this scalar is followed by `:` — if so, it's a key, stop
			if (hasValueSepAfterInList(children, idx + 1)) break;

			// Don't merge scalars below the minimum continuation indent (236B).
			// This prevents merging e.g. "bar" (col 2) with "invalid" (col 0)
			// when the block mapping key is at col 0.
			if (minContinuationColumn !== undefined && sourceText) {
				const childColumn = lineCol(sourceText, child.offset).column;
				if (childColumn < minContinuationColumn) break;
			}

			// Merge: empty lines between content become \n, otherwise fold to space
			if (emptyLines > 1) {
				// emptyLines counts all newlines including the one ending the previous line
				// Subtract 1 for the line-ending newline; remaining are empty lines
				for (let e = 0; e < emptyLines - 1; e++) {
					parts.push("");
				}
			}
			parts.push(child.source.trim());
			emptyLines = 0;
			sawNewline = false;
			idx++;
			continue;
		}

		// Non-scalar node (anchor, tag, alias, directive, block-seq, etc.)
		// On a continuation line, these may be mis-tokenized plain scalar text.
		// Check if the raw source line is indented (indicating continuation).
		// Directive nodes (e.g., %YAML 1.2) inside document content are always
		// continuations since real directives only appear before `---` (XLQ9).
		// Exclude flow-scalar and block-scalar nodes — the lexer correctly
		// identifies these (e.g., quoted scalars like '' should not be merged
		// as plain scalar continuation text).
		if (sawNewline && sourceText && child.type !== "flow-scalar" && child.type !== "block-scalar") {
			const childCol = lineCol(sourceText, child.offset).column;
			const isDirectiveContinuation = child.type === "directive";
			// Continuation lines must be indented (column > 0), or be directives
			if (childCol > 0 || isDirectiveContinuation) {
				const { lineText, lineEndOffset } = extractLineContent(sourceText, child.offset);
				if (lineText.length > 0) {
					// Merge empty lines
					if (emptyLines > 1) {
						for (let e = 0; e < emptyLines - 1; e++) {
							parts.push("");
						}
					}
					parts.push(lineText);
					emptyLines = 0;
					sawNewline = false;
					// Skip all children on this line
					idx = skipChildrenOnLine(children, idx, lineEndOffset);
					continue;
				}
			}
		}

		// Any other node type — stop merging
		break;
	}

	if (parts.length === 1) {
		return { value: parts[0] ?? "", nextIdx: idx, partsCount: 1 };
	}

	// Apply flow folding to the collected parts
	return { value: foldFlowLines(parts.join("\n")), nextIdx: idx, partsCount: parts.length };
}

/**
 * Check if a value separator (`:`) follows in a CST children list,
 * skipping whitespace and newlines.
 */
/**
 * Find the index of the next non-trivia child (skips newline, whitespace, comment).
 * If `stopAtDash` is true, returns null when a `-` indicator is encountered before
 * any significant child (used to avoid merging across sequence entry boundaries).
 */
function findNextSignificantChild(children: readonly CstNode[], startIdx: number, stopAtDash = false): number | null {
	for (let j = startIdx; j < children.length; j++) {
		const c = children[j];
		if (!c) continue;
		if (c.type === "newline" || c.type === "comment") continue;
		if (c.type === "whitespace") {
			if (stopAtDash && c.source.trim() === "-") return null;
			continue;
		}
		return j;
	}
	return null;
}

function hasValueSepAfterInList(children: readonly CstNode[], startIdx: number): boolean {
	return findValueSepOffset(children, startIdx) >= 0;
}

/** Find the offset of the next ":" value separator in a CST children list, or -1 if none. */
function findValueSepOffset(children: readonly CstNode[], startIdx: number): number {
	for (let j = startIdx; j < children.length; j++) {
		const c = children[j];
		if (!c) continue;
		if (c.type === "newline" || c.type === "comment") continue;
		if (c.type === "whitespace") {
			if (c.source === ":") return c.offset;
			continue;
		}
		return -1;
	}
	return -1;
}

/** Check if a ":" value-sep exists between startIdx (inclusive) and endIdx (exclusive). */
function hasValueSepBetween(children: readonly CstNode[], startIdx: number, endIdx: number): boolean {
	for (let j = startIdx; j < endIdx; j++) {
		const c = children[j];
		if (!c) continue;
		if (c.type === "whitespace" && c.source === ":") return true;
	}
	return false;
}

/**
 * Like `hasValueSepAfterInList`, but also skips over plain flow-scalars
 * that appear after a newline. Used to detect multi-line keys:
 * `multi\n  line: value` where `:` comes after continuation plain scalars.
 * Only allows skipping plain scalars that were preceded by a newline,
 * preventing false matches across comma-delimited entries on the same line.
 */
function hasValueSepThroughPlainScalars(children: readonly CstNode[], startIdx: number): boolean {
	let sawNewline = false;
	for (let j = startIdx; j < children.length; j++) {
		const c = children[j];
		if (!c) continue;
		if (c.type === "newline") {
			sawNewline = true;
			continue;
		}
		if (c.type === "comment") continue;
		if (c.type === "whitespace") {
			if (c.source === ":") return true;
			// Commas delimit segments — stop looking across them
			if (c.source === ",") return false;
			continue;
		}
		// Only skip plain scalars on continuation lines (after a newline)
		if (sawNewline && c.type === "flow-scalar" && getScalarStyle(c) === "plain") continue;
		return false;
	}
	return false;
}

function decodeDoubleQuoted(raw: string): string {
	const inner = raw.slice(1, -1);
	let result = "";
	// Track position in result beyond which only raw whitespace was added.
	// Escape-produced content always advances this, so it's never trimmed.
	let significantEnd = 0;
	let i = 0;
	while (i < inner.length) {
		const ch = inner[i];
		if (ch === "\\") {
			i++;
			const esc = inner[i];
			switch (esc) {
				case "\\":
					result += "\\";
					break;
				case '"':
					result += '"';
					break;
				case "/":
					result += "/";
					break;
				case "b":
					result += "\b";
					break;
				case "f":
					result += "\f";
					break;
				case "n":
					result += "\n";
					break;
				case "r":
					result += "\r";
					break;
				case "t":
					result += "\t";
					break;
				case "0":
					result += "\0";
					break;
				case "a":
					result += "\x07";
					break;
				case "e":
					result += "\x1B";
					break;
				case "v":
					result += "\x0B";
					break;
				case " ":
					result += " ";
					break;
				case "N":
					result += "\u0085";
					break;
				case "_":
					result += "\u00A0";
					break;
				case "L":
					result += "\u2028";
					break;
				case "P":
					result += "\u2029";
					break;
				case "x": {
					const hex = inner.slice(i + 1, i + 3);
					result += String.fromCharCode(Number.parseInt(hex, 16));
					i += 2;
					break;
				}
				case "u": {
					const hex = inner.slice(i + 1, i + 5);
					result += String.fromCodePoint(Number.parseInt(hex, 16));
					i += 4;
					break;
				}
				case "U": {
					const hex = inner.slice(i + 1, i + 9);
					result += String.fromCodePoint(Number.parseInt(hex, 16));
					i += 8;
					break;
				}
				case "\n": {
					i++;
					while (i < inner.length && (inner[i] === " " || inner[i] === "\t")) i++;
					continue;
				}
				case "\r": {
					i++;
					if (i < inner.length && inner[i] === "\n") i++;
					while (i < inner.length && (inner[i] === " " || inner[i] === "\t")) i++;
					continue;
				}
				default:
					result += esc === undefined ? "\\" : esc;
			}
			// Escape-produced content is always significant (never trimmed)
			significantEnd = result.length;
			i++;
		} else if (ch === "\n" || (ch === "\r" && inner[i + 1] === "\n")) {
			// Bare newline: apply flow folding (YAML 1.2 §6.5)
			// Trim only raw trailing whitespace (not escape-produced content)
			result = result.slice(0, significantEnd);
			i += ch === "\r" ? 2 : 1;
			// Skip leading whitespace on next line (indentation)
			while (i < inner.length && (inner[i] === " " || inner[i] === "\t")) i++;
			// Check for empty lines (consecutive newlines → preserved as \n)
			if (i < inner.length && (inner[i] === "\n" || inner[i] === "\r")) {
				// Consume all consecutive empty lines
				while (i < inner.length && (inner[i] === "\n" || inner[i] === "\r")) {
					result += "\n";
					i += inner[i] === "\r" && inner[i + 1] === "\n" ? 2 : 1;
					// Skip leading whitespace on next line
					while (i < inner.length && (inner[i] === " " || inner[i] === "\t")) i++;
				}
			} else {
				// Non-empty continuation: fold to space
				result += " ";
			}
			significantEnd = result.length;
		} else {
			result += ch;
			if (ch !== " " && ch !== "\t") significantEnd = result.length;
			i++;
		}
	}
	return result;
}

/**
 * Scan backward in the full document text from a block scalar indicator's
 * position to find the parent context indentation level n. This handles:
 * - Same-line ":" (mapping value): n = key's column indent
 * - Same-line "-" (seq entry): n = column of "-"
 * - Own-line (preceded by newline, tag, anchor): scan further back across
 *   lines to find the ":" or "-" that introduced this value
 */
function findParentIndent(fullText: string, indicatorOffset: number): number {
	let scanBack = indicatorOffset - 1;
	// Skip whitespace on the same line
	while (scanBack >= 0 && (fullText[scanBack] === " " || fullText[scanBack] === "\t")) {
		scanBack--;
	}
	// If we hit ":" or "-" on the same line, handle directly
	if (scanBack >= 0 && fullText[scanBack] === ":") {
		return findKeyIndent(fullText, scanBack);
	}
	if (scanBack >= 0 && fullText[scanBack] === "-") {
		return findColOnLine(fullText, scanBack);
	}
	// Block scalar is on its own line (after tag, anchor, or newline).
	// Scan backward across lines to find the ":" or "-" that introduces
	// this block scalar as a value.
	while (scanBack >= 0) {
		const ch = fullText[scanBack];
		if (ch === ":") {
			return findKeyIndent(fullText, scanBack);
		}
		if (ch === "-") {
			// Check if this is a seq entry indicator (followed by space/newline)
			const afterDash = scanBack + 1;
			if (
				afterDash >= fullText.length ||
				fullText[afterDash] === " " ||
				fullText[afterDash] === "\t" ||
				fullText[afterDash] === "\n" ||
				fullText[afterDash] === "\r"
			) {
				return findColOnLine(fullText, scanBack);
			}
		}
		scanBack--;
	}
	return 0;
}

/** Find the column of a character on its line. */
function findColOnLine(text: string, pos: number): number {
	let lineStart = pos;
	while (lineStart > 0 && text[lineStart - 1] !== "\n" && text[lineStart - 1] !== "\r") {
		lineStart--;
	}
	return pos - lineStart;
}

/** Find the key indentation for a mapping ":" at the given position. */
function findKeyIndent(text: string, colonPos: number): number {
	let lineStart = colonPos;
	while (lineStart > 0 && text[lineStart - 1] !== "\n" && text[lineStart - 1] !== "\r") {
		lineStart--;
	}
	let spaces = 0;
	while (lineStart + spaces < text.length && text[lineStart + spaces] === " ") {
		spaces++;
	}
	// If the first non-space char is "-" followed by space (compact sequence),
	// the key starts after "- "
	if (lineStart + spaces < text.length && text[lineStart + spaces] === "-") {
		const afterDash = lineStart + spaces + 1;
		if (afterDash < text.length && (text[afterDash] === " " || text[afterDash] === "\t")) {
			return spaces + 2;
		}
	}
	return spaces;
}

function decodeBlockScalar(raw: string, fullText?: string, nodeOffset?: number): string {
	const firstChar = raw.trimStart()[0];
	const isFolded = firstChar === ">";
	let i = raw.indexOf(firstChar === ">" ? ">" : "|");
	if (i < 0) return "";
	i++;

	let chomp: "clip" | "strip" | "keep" = "clip";
	let explicitIndent = 0;

	for (let hc = 0; hc < 2 && i < raw.length && raw[i] !== "\n" && raw[i] !== "\r"; hc++) {
		const ch = raw[i];
		if (ch === "-") {
			chomp = "strip";
			i++;
		} else if (ch === "+") {
			chomp = "keep";
			i++;
		} else if (ch !== undefined && ch >= "1" && ch <= "9") {
			explicitIndent = Number.parseInt(ch, 10);
			i++;
		} else {
			break;
		}
	}

	while (i < raw.length && raw[i] !== "\n" && raw[i] !== "\r") i++;
	if (i < raw.length) {
		if (raw[i] === "\r" && raw[i + 1] === "\n") i += 2;
		else i++;
	}

	// When an explicit indentation indicator is present (e.g., |2), the digit
	// specifies additional spaces relative to the parent block indent n
	// (YAML 1.2 §8.1.1.1). The raw CST source includes the full absolute
	// indentation, so we need contentIndent = n + m. We compute n by scanning
	// backward in the full text to find the parent context, using the same
	// logic as the lexer's scanBlockScalar. When fullText/nodeOffset are not
	// available, fall back to the explicit digit alone (works for top-level).
	let contentIndent = explicitIndent;
	let foundContent = explicitIndent > 0;
	if (explicitIndent > 0 && fullText !== undefined && nodeOffset !== undefined) {
		// Determine parent indent by scanning backward from the block scalar
		// indicator in the full text, mirroring the lexer's approach.
		// Scan backward past whitespace, newlines, tags, anchors, and comments
		// to find the ":" or "-" that introduces this block scalar value.
		const parentIndent = findParentIndent(fullText, nodeOffset);
		contentIndent = parentIndent + explicitIndent;
		foundContent = true;
	} else if (contentIndent === 0) {
		// Auto-detect from first non-empty line
		let scanAhead = i;
		while (scanAhead < raw.length) {
			let spaces = 0;
			while (scanAhead < raw.length && raw[scanAhead] === " ") {
				spaces++;
				scanAhead++;
			}
			if (scanAhead >= raw.length || raw[scanAhead] === "\n" || raw[scanAhead] === "\r") {
				if (scanAhead < raw.length) {
					scanAhead++;
					if (raw[scanAhead - 1] === "\r" && scanAhead < raw.length && raw[scanAhead] === "\n") scanAhead++;
				}
				continue;
			}
			contentIndent = spaces;
			foundContent = true;
			break;
		}
	}

	if (!foundContent) {
		if (chomp === "keep") {
			// Count all trailing empty/whitespace-only lines after the header
			let count = 0;
			let j = i;
			while (j < raw.length) {
				// Skip whitespace on this line
				while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
				if (j >= raw.length) {
					// Whitespace-only content at EOF counts as one empty line
					if (count === 0) count = 1;
					break;
				}
				if (raw[j] === "\n") {
					count++;
					j++;
				} else if (raw[j] === "\r") {
					count++;
					j++;
					if (j < raw.length && raw[j] === "\n") j++;
				} else {
					break;
				}
			}
			return "\n".repeat(count);
		}
		return "";
	}

	const lines: string[] = [];
	const trailingNewlines: string[] = [];

	while (i < raw.length) {
		let spaces = 0;
		while (i < raw.length && raw[i] === " ") {
			spaces++;
			i++;
		}

		if (i >= raw.length || raw[i] === "\n" || raw[i] === "\r") {
			if (spaces > contentIndent) {
				// Whitespace-only line with spaces beyond content indent — this is content
				// (not an empty line), so flush any pending trailing newlines and add it
				for (const nl of trailingNewlines) lines.push(nl);
				trailingNewlines.length = 0;
				lines.push(" ".repeat(spaces - contentIndent));
			} else {
				// Empty line (at or below content indent) — defer as trailing
				trailingNewlines.push("");
			}
			if (i < raw.length) {
				if (raw[i] === "\r" && i + 1 < raw.length && raw[i + 1] === "\n") i += 2;
				else i++;
			}
			continue;
		}

		if (spaces < contentIndent) break;

		for (const _nl of trailingNewlines) lines.push("");
		trailingNewlines.length = 0;

		const extra = " ".repeat(spaces - contentIndent);
		const contentStart = i;
		while (i < raw.length && raw[i] !== "\n" && raw[i] !== "\r") i++;
		lines.push(extra + raw.slice(contentStart, i));

		if (i < raw.length) {
			if (raw[i] === "\r" && i + 1 < raw.length && raw[i + 1] === "\n") i += 2;
			else i++;
		}
	}

	let value: string;
	if (isFolded) {
		let result = "";
		let prevMoreIndented = false;
		let hadContent = false;
		for (let li = 0; li < lines.length; li++) {
			const ln = lines[li] ?? "";
			const isMoreIndented = ln.length > 0 && (ln[0] === " " || ln[0] === "\t");
			if (ln === "") {
				// Empty line — preserved as newline
				result += "\n";
				// Don't reset prevMoreIndented — we need to track last content line type
			} else if (!hadContent) {
				// First content line
				result += ln;
				prevMoreIndented = isMoreIndented;
				hadContent = true;
			} else {
				const lastChar = result[result.length - 1];
				if (lastChar === "\n") {
					// After empty line(s): if transition involves more-indented,
					// add extra newline for the preserved line break
					if (isMoreIndented || prevMoreIndented) {
						result += `\n${ln}`;
					} else {
						result += ln;
					}
				} else if (isMoreIndented || prevMoreIndented) {
					// Transition to/from more-indented: preserve newline
					result += `\n${ln}`;
				} else {
					// Normal folding: adjacent base-indent lines fold to space
					result += ` ${ln}`;
				}
				prevMoreIndented = isMoreIndented;
			}
		}
		if (hadContent || trailingNewlines.length > 0) {
			if (chomp === "keep") {
				result += "\n";
				for (const _nl of trailingNewlines) result += "\n";
			} else if (chomp !== "strip") {
				result += "\n";
			}
		}
		value = result;
	} else {
		value = lines.join("\n");
		if (lines.length > 0 || trailingNewlines.length > 0) {
			if (chomp === "keep") {
				value += "\n";
				for (const _nl of trailingNewlines) value += "\n";
			} else if (chomp !== "strip") {
				value += "\n";
			}
		}
	}

	return value;
}

// ---------------------------------------------------------------------------
// Composer state
// ---------------------------------------------------------------------------

interface ComposerState {
	readonly text: string;
	readonly anchors: Map<string, YamlNode>;
	aliasCount: number;
	readonly errors: YamlErrorDetail[];
	readonly warnings: YamlErrorDetail[];
	readonly options: {
		readonly strict: boolean;
		readonly maxAliasCount: number;
		readonly uniqueKeys: boolean;
	};
	/** Tag handle to prefix map from %TAG directives (e.g. "!!" maps to "tag:yaml.org,2002:") */
	tagMap: Map<string, string>;
}

function createState(text: string, options?: Partial<YamlParseOptions>): ComposerState {
	return {
		text,
		anchors: new Map(),
		aliasCount: 0,
		errors: [],
		warnings: [],
		options: {
			strict: options?.strict ?? true,
			maxAliasCount: options?.maxAliasCount ?? 100,
			uniqueKeys: options?.uniqueKeys ?? true,
		},
		tagMap: new Map(),
	};
}

/**
 * Resolve a tag shorthand using the document's %TAG directives.
 * For example, with `%TAG !! tag:example.com,2000:app/`, the tag `!!int`
 * resolves to `tag:example.com,2000:app/int`.
 *
 * Returns the resolved tag URI, or the original tag if no directive matches.
 */
function resolveTagHandle(tag: string, state: ComposerState): string {
	// Verbatim tags: !<...> — return the content as-is
	if (tag.startsWith("!<") && tag.endsWith(">")) {
		return tag.slice(2, -1);
	}
	// Secondary tag handle: !!suffix
	if (tag.startsWith("!!")) {
		const prefix = state.tagMap.get("!!");
		if (prefix) {
			return prefix + tag.slice(2);
		}
		// Default secondary tag handle: tag:yaml.org,2002:
		return `tag:yaml.org,2002:${tag.slice(2)}`;
	}
	// Named tag handle: !name!suffix
	const namedMatch = tag.match(/^(![\w-]*!)(.*)$/);
	if (namedMatch) {
		const handle = namedMatch[1];
		const suffix = namedMatch[2];
		if (handle) {
			const prefix = state.tagMap.get(handle);
			if (prefix) {
				return prefix + (suffix ?? "");
			}
		}
	}
	// Primary tag handle: !suffix (non-empty suffix)
	if (tag.startsWith("!") && tag.length > 1 && !tag.startsWith("!!")) {
		const prefix = state.tagMap.get("!");
		if (prefix) {
			return prefix + tag.slice(1);
		}
		// Default primary: local tag
		return tag;
	}
	// Non-specific tag: ! alone
	return tag;
}

// ---------------------------------------------------------------------------
// Metadata for anchors/tags/comments attached to nodes
// ---------------------------------------------------------------------------

interface NodeMeta {
	anchor?: string;
	tag?: string;
	comment?: string;
}

// ---------------------------------------------------------------------------
// Core compose logic
// ---------------------------------------------------------------------------

// The CST structure from the parser is:
//
// For `a: 1\nb: true`:
//   document
//     flow-scalar "a"          -- first key
//     block-map ": 1\nb: true"
//       whitespace ":"
//       whitespace " "
//       flow-scalar "1"        -- first value
//       newline
//       flow-scalar "b"        -- second key
//       whitespace ":"
//       whitespace " "
//       flow-scalar "true"     -- second value
//
// For `- 1\n- two`:
//   document
//     block-seq "- 1\n- two"
//       whitespace "-"
//       whitespace " "
//       flow-scalar "1"
//       newline
//       whitespace "-"
//       whitespace " "
//       flow-scalar "two"
//
// The document node can have:
//   - directive children
//   - comment children
//   - anchor/tag children (preceding the content)
//   - One content node which might be:
//     a) flow-scalar/block-scalar directly
//     b) block-map/block-seq/flow-map/flow-seq
//     c) A flow-scalar key followed by a block-map (the key is a sibling)
//   - alias child
//
// For block maps, the FIRST key sits as a sibling before the block-map node
// in the document children. Additional keys are inside the block-map children.

function makeScalar(cst: CstNode, state: ComposerState, meta?: NodeMeta): YamlScalar {
	const style = getScalarStyle(cst);
	const rawValue = getScalarValue(cst, state.text);
	const value = resolveScalar(rawValue, style, meta?.tag, state);
	const scalar = new YamlScalar({
		value,
		style,
		offset: cst.offset,
		length: cst.length,
		...(meta?.tag !== undefined ? { tag: meta.tag } : {}),
		...(meta?.anchor !== undefined ? { anchor: meta.anchor } : {}),
		...(meta?.comment !== undefined ? { comment: meta.comment } : {}),
	});
	if (meta?.anchor) registerAnchor(scalar, meta.anchor, state, cst.offset);
	return scalar;
}

function makeAlias(cst: CstNode, state: ComposerState): YamlAlias {
	const name = getAliasName(cst, state.text);

	// Check existence first — an undefined alias is a more specific error
	// than a count exceeded error.
	if (!state.anchors.has(name)) {
		const lc = lineCol(state.text, cst.offset);
		state.errors.push(
			new YamlErrorDetail({
				code: "UndefinedAlias",
				message: `Undefined alias: *${name}`,
				offset: cst.offset,
				length: cst.length,
				line: lc.line,
				column: lc.column,
			}),
		);
	} else {
		// Only count valid (defined) aliases toward the limit.
		state.aliasCount++;
		if (state.aliasCount > state.options.maxAliasCount) {
			const lc = lineCol(state.text, cst.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "AliasCountExceeded",
					message: `Alias count exceeded maximum of ${state.options.maxAliasCount}`,
					offset: cst.offset,
					length: cst.length,
					line: lc.line,
					column: lc.column,
				}),
			);
		}
	}

	return new YamlAlias({ name, offset: cst.offset, length: cst.length });
}

function registerAnchor(node: YamlNode, anchor: string, state: ComposerState, offset: number): void {
	if (state.anchors.has(anchor)) {
		const lc = lineCol(state.text, offset);
		state.warnings.push(
			new YamlErrorDetail({
				code: "DuplicateAnchor",
				message: `Duplicate anchor: &${anchor}`,
				offset,
				length: anchor.length + 1,
				line: lc.line,
				column: lc.column,
			}),
		);
	}
	state.anchors.set(anchor, node);
}

function getAnchorName(cst: CstNode, text: string): string {
	// The CST anchor node has offset and length from the lexer token.
	// The lexer's anchor token has value = name (without &), and the CST's
	// makeLeafNode uses token.offset and token.length. But token.length
	// equals the value length (without &), so CST source = text.slice(offset, offset+length)
	// which starts with "&" but is one char short. We read from original text
	// starting after the "&" for the correct name.
	// The raw text at offset starts with "&", so the name is text[offset+1 .. offset+length+1]
	const rawStart = text[cst.offset];
	if (rawStart === "&") {
		// Length in the token is the name length, but the offset includes the "&"
		// So the name goes from offset+1 to offset+1+length, but we can also
		// scan forward from offset+1 until we hit whitespace/flowIndicator/etc
		return scanName(text, cst.offset + 1);
	}
	return cst.source;
}

function getAliasName(cst: CstNode, text: string): string {
	const rawStart = text[cst.offset];
	if (rawStart === "*") {
		return scanName(text, cst.offset + 1);
	}
	return cst.source;
}

function scanName(text: string, start: number): string {
	let end = start;
	// YAML 1.2 ns-anchor-char: any non-whitespace char except c-flow-indicator
	while (end < text.length) {
		const ch = text[end];
		if (
			ch === " " ||
			ch === "\t" ||
			ch === "\n" ||
			ch === "\r" ||
			ch === "{" ||
			ch === "}" ||
			ch === "[" ||
			ch === "]" ||
			ch === "," ||
			ch === undefined
		) {
			break;
		}
		end++;
	}
	return text.slice(start, end);
}

// ---------------------------------------------------------------------------
// Compose block map
// ---------------------------------------------------------------------------

/**
 * Compose a block map from its CST children, with an optional external first key.
 *
 * CST pattern for `a: 1, b: true`:
 *   `[flow-scalar("a"), block-map(children: [":"," ","1","\\n","b",":"," ","true"])]`
 *
 * The first key is external (sibling before block-map in document/parent).
 * Subsequent keys are inside the block-map children.
 */
function composeBlockMap(
	blockMapCst: CstNode,
	state: ComposerState,
	externalFirstKey?: YamlNode,
	meta?: NodeMeta,
): YamlMap {
	const children = blockMapCst.children ?? [];
	const pairs: YamlPair[] = [];

	// Phase 1: parse children into a flat stream of semantic items
	const extKeyOffset =
		externalFirstKey && "offset" in externalFirstKey ? (externalFirstKey as YamlScalar).offset : undefined;
	const extKeyCol = extKeyOffset !== undefined ? lineCol(state.text, extKeyOffset).column : undefined;
	const items = flattenBlockMapChildren(children, state, extKeyCol, extKeyOffset);

	// If there's an external first key, prepend it
	if (externalFirstKey) {
		items.unshift({ kind: "key", node: externalFirstKey });
	}

	// Phase 2: pair up keys and values
	buildPairs(items, pairs, state.text);

	if (state.options.uniqueKeys) checkDuplicateKeys(pairs, state);
	checkMultilineImplicitKeys(pairs, state);

	const offset = externalFirstKey
		? "offset" in externalFirstKey
			? (externalFirstKey as YamlScalar).offset
			: blockMapCst.offset
		: blockMapCst.offset;
	const end = blockMapCst.offset + blockMapCst.length;
	const length = end - offset;

	const map = new YamlMap({
		items: pairs,
		style: "block" as CollectionStyle,
		offset,
		length,
		...(meta?.tag !== undefined ? { tag: meta.tag } : {}),
		...(meta?.anchor !== undefined ? { anchor: meta.anchor } : {}),
		...(meta?.comment !== undefined ? { comment: meta.comment } : {}),
	});

	if (meta?.anchor) registerAnchor(map, meta.anchor, state, offset);
	return map;
}

interface SemanticItem {
	kind: "key" | "value-sep" | "node" | "comment";
	node?: YamlNode;
	comment?: string;
	offset?: number;
}

/** Find the next non-trivia CST child in a list, returning the node and its index. */
function findNextContentInList(children: readonly CstNode[], startIdx: number): { node: CstNode; idx: number } | null {
	for (let j = startIdx; j < children.length; j++) {
		const c = children[j];
		if (!c) continue;
		if (c.type === "whitespace" || c.type === "newline" || c.type === "comment") continue;
		return { node: c, idx: j };
	}
	return null;
}

function flattenBlockMapChildren(
	children: readonly CstNode[],
	state: ComposerState,
	externalKeyColumn?: number,
	externalKeyOffset?: number,
): SemanticItem[] {
	const items: SemanticItem[] = [];
	let pendingMeta: NodeMeta = {};
	let afterValueSep = false;
	let lastValueSepOffset = -1;
	let lastKeyColumn = externalKeyColumn ?? -1;
	let lastKeyOffset = externalKeyOffset ?? -1;

	function pushNode(node: YamlNode, nodeOffset?: number) {
		// Track key column/offset when pushing in key position (before value-sep)
		if (!afterValueSep && nodeOffset !== undefined && nodeOffset >= 0) {
			lastKeyColumn = lineCol(state.text, nodeOffset).column;
			lastKeyOffset = nodeOffset;
		}
		items.push({ kind: "node", node });
		afterValueSep = false;
	}

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;

		if (child.type === "error") {
			const lc = lineCol(state.text, child.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: `Unexpected content: ${child.source.trim() || "(empty)"}`,
					offset: child.offset,
					length: child.length,
					line: lc.line,
					column: lc.column,
				}),
			);
			continue;
		}

		if (child.type === "newline") continue;
		if (child.type === "whitespace") {
			if (child.source === "?") {
				// Explicit key indicator (YAML §8.2.1). The "?" simply marks
				// that the next content node is the key of this mapping entry.
				// We don't need to push a semantic item because the node that
				// follows will naturally be in key position (before value-sep).
				// Reset afterValueSep so the next node is treated as a key.
				afterValueSep = false;
				continue;
			}
			if (child.source === ":") {
				// Flush pending tag/anchor as empty scalar before value-sep
				if (hasMeta(pendingMeta)) {
					const value = resolveScalar("", "plain", pendingMeta.tag, state);
					const scalar = new YamlScalar({
						value,
						style: "plain" as ScalarStyle,
						offset: child.offset,
						length: 0,
						...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
						...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
					});
					if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
					pendingMeta = {};
					pushNode(scalar);
				}
				items.push({ kind: "value-sep", offset: child.offset });
				afterValueSep = true;
				lastValueSepOffset = child.offset;
			}
			// Check for sequence entry on same line as value-sep (5U3A: `key: - a`).
			// Only flag for implicit key mappings (has a key scalar on the same line
			// before ":"), not explicit mappings (? key\n: - value) where this is valid.
			if (
				child.source === "-" &&
				lastValueSepOffset >= 0 &&
				sameLine(state.text, lastValueSepOffset, child.offset) &&
				hasNonWhitespaceBeforeOnLine(state.text, lastValueSepOffset)
			) {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "UnexpectedToken",
						message: "Sequence entry on same line as mapping value indicator",
						offset: child.offset,
						length: child.length,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
			continue;
		}
		if (child.type === "comment") {
			const text = child.source.startsWith("#") ? child.source.slice(1).trim() : child.source;
			items.push({ kind: "comment", comment: text });
			continue;
		}
		if (child.type === "anchor") {
			pendingMeta.anchor = getAnchorName(child, state.text);
			continue;
		}
		if (child.type === "tag") {
			pendingMeta.tag = child.source;
			continue;
		}
		if (child.type === "flow-scalar" || child.type === "block-scalar") {
			// If this scalar is a key (followed by ":") and there's pending
			// meta from a previous VALUE position, flush it as a null value.
			// e.g., `a: &anchor\nb:` — the anchor belongs to null, not to `b`.
			// But NOT when meta is in key position: `!!str a: b` — tag is for key.
			if (afterValueSep && hasMeta(pendingMeta) && hasValueSepAfterInList(children, i + 1)) {
				const value = resolveScalar("", "plain", pendingMeta.tag, state);
				const scalar = new YamlScalar({
					value,
					style: "plain" as ScalarStyle,
					offset: child.offset,
					length: 0,
					...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
					...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
				});
				if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
				pendingMeta = {};
				pushNode(scalar);
			}
			// Detect same-line nested mapping (ZCZ6: `a: b: c: d`, ZL4Z: `a: 'b': c`).
			// If we're in value position and this scalar is followed by ":"
			// on the same line as both the preceding ":" AND the scalar itself,
			// AND the preceding ":" was from an implicit key (has non-whitespace
			// before it on the same line), it's an invalid nested mapping.
			// Skip for explicit mappings (? key\n: value) where `:` starts a value.
			const nextValueSepOffset = findValueSepOffset(children, i + 1);
			if (
				afterValueSep &&
				lastValueSepOffset >= 0 &&
				hasNonWhitespaceBeforeOnLine(state.text, lastValueSepOffset) &&
				child.type === "flow-scalar" &&
				nextValueSepOffset >= 0 &&
				sameLine(state.text, lastValueSepOffset, child.offset) &&
				sameLine(state.text, child.offset, nextValueSepOffset)
			) {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "UnexpectedToken",
						message: "Implicit mapping key on same line as previous value indicator",
						offset: child.offset,
						length: child.length,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
			// Check if this scalar is followed by a block-map (scalar is the first
			// key of a nested mapping: the parser puts the first key as a sibling
			// before its block-map child).
			// But NOT if there's a ":" value-sep between the scalar and the
			// block-map — in that case, the scalar is a key at the current level
			// and the block-map is its value (e.g., `mapping:\n  ? sky\n  : blue`).
			const nextContent = findNextContentInList(children, i + 1);
			if (nextContent?.node.type === "block-map" && !hasValueSepBetween(children, i + 1, nextContent.idx)) {
				// The scalar is the first key of the nested mapping — keys don't
				// carry the pending anchor/tag; those belong on the map itself.
				const key = makeScalar(child, state);
				const map = composeBlockMap(nextContent.node, state, key, hasMeta(pendingMeta) ? pendingMeta : undefined);
				pendingMeta = {};
				pushNode(map);
				i = nextContent.idx; // skip to past the block-map
				continue;
			}
			// For explicit keys (? key\n  continuation\n:), use collectMultilineKey
			// which merges plain scalars up to the ":" value-sep (JTV5).
			if (
				!afterValueSep &&
				child.type === "flow-scalar" &&
				getScalarStyle(child) === "plain" &&
				!hasValueSepAfterInList(children, i + 1) &&
				hasValueSepThroughPlainScalars(children, i + 1)
			) {
				// Check that we're preceded by "?" (explicit key context)
				// and that the next continuation scalar is indented beyond the "?" column.
				// `? a\n  true\n:` → merge (true at col 2 > ? at col 0) (JTV5)
				// `? b\nc:\n` → don't merge (c at col 0 = ? at col 0) (7W2P)
				let isExplicitKey = false;
				let explicitKeyCol = -1;
				for (let p = i - 1; p >= 0; p--) {
					const prev = children[p];
					if (!prev) continue;
					if (prev.type === "whitespace" && prev.source === "?") {
						explicitKeyCol = lineCol(state.text, prev.offset).column;
						isExplicitKey = true;
						break;
					}
					if (prev.type === "whitespace" && prev.source.trim() === "") continue;
					if (prev.type === "newline") continue;
					break;
				}
				// Only merge if the next scalar after a newline is indented beyond ?
				if (isExplicitKey) {
					let nextScalarIndented = false;
					let sawNl = false;
					for (let j = i + 1; j < children.length; j++) {
						const c = children[j];
						if (!c) continue;
						if (c.type === "newline") {
							sawNl = true;
							continue;
						}
						if (c.type === "whitespace" && c.source.trim() === "") continue;
						if (sawNl && c.type === "flow-scalar") {
							const cCol = lineCol(state.text, c.offset).column;
							nextScalarIndented = cCol > explicitKeyCol;
						}
						break;
					}
					isExplicitKey = nextScalarIndented;
				}
				if (isExplicitKey) {
					const { value: keyValue, nextIdx: keyNextIdx } = collectMultilineKey(children, i);
					const resolved = resolveScalar(keyValue, "plain", pendingMeta.tag, state);
					const scalar = new YamlScalar({
						value: resolved,
						style: "plain" as ScalarStyle,
						offset: child.offset,
						length: child.length,
						...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
						...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
					});
					if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
					pendingMeta = {};
					pushNode(scalar, child.offset);
					i = keyNextIdx - 1;
					continue;
				}
			}
			// For plain scalars not followed by ":", try multi-line merging
			if (
				child.type === "flow-scalar" &&
				getScalarStyle(child) === "plain" &&
				!hasValueSepAfterInList(children, i + 1)
			) {
				const isValuePosition = afterValueSep;
				// In key position, a plain scalar without ":" after it is
				// trailing content (236B, 7MNF, 6S55, 9CWY) — unless preceded
				// by a block indicator ("-", "?") which means it's part of an
				// explicit mapping (KK5P, 2XXW).
				if (!isValuePosition) {
					// Check if this scalar is the first non-whitespace on its line
					// by scanning the source text backwards. Mid-line scalars (e.g.,
					// after a tag/comma in FBC9) are not trailing.
					let isLineStart = true;
					for (let k = child.offset - 1; k >= 0; k--) {
						const ch = state.text[k];
						if (ch === "\n") break;
						if (ch === " " || ch === "\t") continue;
						isLineStart = false;
						break;
					}
					if (isLineStart) {
						let precededByIndicator = false;
						for (let p = i - 1; p >= 0; p--) {
							const prev = children[p];
							if (!prev) continue;
							if (prev.type === "whitespace" && (prev.source === "-" || prev.source === "?")) {
								precededByIndicator = true;
								break;
							}
							if (prev.type === "whitespace" && prev.source.trim() === "") continue;
							if (prev.type === "newline") continue;
							break;
						}
						if (!precededByIndicator) {
							const lc = lineCol(state.text, child.offset);
							state.errors.push(
								new YamlErrorDetail({
									code: "UnexpectedToken",
									message: "Trailing content in block mapping",
									offset: child.offset,
									length: child.length,
									line: lc.line,
									column: lc.column,
								}),
							);
						}
					}
				}
				// In value position for implicit mappings (key and ":" on the same line),
				// continuation lines must be indented more than the key column.
				// For explicit mappings (? key\n: value), don't constrain.
				const isImplicitMapping =
					isValuePosition &&
					lastKeyColumn >= 0 &&
					lastKeyOffset >= 0 &&
					lastValueSepOffset >= 0 &&
					sameLine(state.text, lastKeyOffset, lastValueSepOffset);
				const minContCol = isImplicitMapping ? lastKeyColumn + 1 : undefined;
				const { value, nextIdx, partsCount } = collectMultilinePlainScalar(
					children,
					i,
					minContCol,
					minContCol !== undefined ? state.text : undefined,
				);
				const resolved = resolveScalar(value, "plain", pendingMeta.tag, state);
				const scalar = new YamlScalar({
					value: resolved,
					style: "plain" as ScalarStyle,
					offset: child.offset,
					length: child.length,
					...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
					...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
				});
				if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
				pendingMeta = {};
				pushNode(scalar, child.offset);
				// After a truly MULTILINE plain scalar in value position (partsCount > 1
				// means multiple source lines were merged), if collectMultilinePlainScalar
				// stopped at a key at the SAME or deeper indent as the value, that's an
				// invalid nested mapping (HU3P). Keys at a lesser indent are sibling pairs
				// at the parent mapping level (valid, e.g. 4CQQ).
				if (isValuePosition && partsCount > 1) {
					const stoppedAtContent = findNextContentInList(children, nextIdx);
					if (stoppedAtContent) {
						const sn = stoppedAtContent.node;
						const valueCol = lineCol(state.text, child.offset).column;
						const nextCol = lineCol(state.text, sn.offset).column;
						// Only flag if the next key is at same or deeper indent
						if (nextCol >= valueCol) {
							const isTrailingMapping =
								// scalar followed by ":"
								(sn.type === "flow-scalar" &&
									getScalarStyle(sn) === "plain" &&
									hasValueSepAfterInList(children, stoppedAtContent.idx + 1)) ||
								// scalar followed by block-map (key before nested mapping)
								(sn.type === "flow-scalar" &&
									getScalarStyle(sn) === "plain" &&
									(() => {
										const after = findNextContentInList(children, stoppedAtContent.idx + 1);
										return after !== null && after.node.type === "block-map";
									})()) ||
								// direct block-map (nested mapping without external key)
								sn.type === "block-map";
							if (isTrailingMapping) {
								const lc = lineCol(state.text, sn.offset);
								state.errors.push(
									new YamlErrorDetail({
										code: "UnexpectedToken",
										message: "Mapping key after multiline plain scalar value",
										offset: sn.offset,
										length: sn.length,
										line: lc.line,
										column: lc.column,
									}),
								);
							}
						}
					}
				}
				i = nextIdx - 1; // -1 because for-loop increments
				continue;
			}
			// Check for trailing content after quoted scalar in value position
			const style = getScalarStyle(child);
			const isValuePosition = afterValueSep;
			const scalar = makeScalar(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			pushNode(scalar, child.offset);

			if (isValuePosition && (style === "single-quoted" || style === "double-quoted")) {
				checkTrailingContentOnSameLine(children, i + 1, child, state);
			}
			continue;
		}
		if (child.type === "alias") {
			// Check if alias is followed by block-map (alias as first key of implicit mapping)
			const nextAlias = findNextContentInList(children, i + 1);
			if (nextAlias?.node.type === "block-map") {
				const alias = makeAlias(child, state);
				const map = composeBlockMap(nextAlias.node, state, alias, hasMeta(pendingMeta) ? pendingMeta : undefined);
				pendingMeta = {};
				pushNode(map);
				i = nextAlias.idx;
				continue;
			}
			const alias = makeAlias(child, state);
			pendingMeta = {};
			pushNode(alias);
			continue;
		}
		if (child.type === "block-map") {
			const map = composeBlockMap(child, state, undefined, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			pushNode(map);
			continue;
		}
		if (child.type === "block-seq") {
			const seq = composeBlockSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			pushNode(seq);
			continue;
		}
		if (child.type === "flow-map") {
			const isValue = afterValueSep;
			const map = composeFlowMap(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			pushNode(map);
			if (isValue) checkTrailingContentOnSameLine(children, i + 1, child, state);
			continue;
		}
		if (child.type === "flow-seq") {
			const isValue = afterValueSep;
			const seq = composeFlowSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			pushNode(seq);
			if (isValue) checkTrailingContentOnSameLine(children, i + 1, child, state);
		}
	}
	// Flush trailing pending tag/anchor as empty scalar
	if (hasMeta(pendingMeta)) {
		const value = resolveScalar("", "plain", pendingMeta.tag, state);
		const scalar = new YamlScalar({
			value,
			style: "plain" as ScalarStyle,
			offset: 0,
			length: 0,
			...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
			...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
		});
		if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, 0);
		items.push({ kind: "node", node: scalar });
	}
	return items;
}

function hasMeta(m: NodeMeta): boolean {
	return m.anchor !== undefined || m.tag !== undefined || m.comment !== undefined;
}

/**
 * Build pairs from a semantic item stream.
 * Pattern: node, value-sep, node produces a key:value pair.
 * Pattern: node, value-sep (no node) produces a key:null pair.
 * Pattern: value-sep, node produces a null:value pair.
 */
function buildPairs(items: SemanticItem[], pairs: YamlPair[], text: string): void {
	let i = 0;
	while (i < items.length) {
		const item = items[i];
		if (!item) {
			i++;
			continue;
		}
		if (item.kind === "comment") {
			// Attach to previous pair if any
			if (pairs.length > 0) {
				const last = pairs[pairs.length - 1];
				if (last) {
					pairs[pairs.length - 1] = new YamlPair({
						key: last.key,
						value: last.value,
						comment: item.comment,
					});
				}
			}
			i++;
			continue;
		}
		if (item.kind === "value-sep") {
			// value-sep without preceding key: implicit null key
			const valueSepOffset = item.offset ?? 0;
			i++;
			// Peek ahead: if the next non-comment node is followed by a
			// value-sep AND is on a different line, it's a KEY for the next
			// pair, not our value. This prevents greedily consuming
			// `"quoted key":` as the value of a preceding null-key entry
			// (S3PD) while preserving rejection of `a: b: c: d` (ZCZ6).
			const valueNode = consumeValueNodeForNullKey(items, i, text, valueSepOffset);
			if (valueNode) {
				const nullKey = new YamlScalar({ value: null, style: "plain" as ScalarStyle, offset: 0, length: 0 });
				pairs.push(new YamlPair({ key: nullKey, value: valueNode.node ?? null }));
				i = valueNode.nextIdx;
			} else {
				const nullKey = new YamlScalar({ value: null, style: "plain" as ScalarStyle, offset: 0, length: 0 });
				pairs.push(new YamlPair({ key: nullKey, value: null }));
			}
			continue;
		}
		if (item.kind === "node" || item.kind === "key") {
			const keyNode = item.node;
			i++;
			// Skip comments between key and value-sep (e.g., ? key # comment\n: value)
			while (i < items.length && items[i]?.kind === "comment") {
				i++;
			}
			// Look for value-sep
			if (i < items.length && items[i]?.kind === "value-sep") {
				i++; // skip value-sep
				const valueResult = consumeValueNode(items, i);
				if (valueResult) {
					pairs.push(
						new YamlPair({
							key: keyNode ?? new YamlScalar({ value: null, style: "plain" as ScalarStyle, offset: 0, length: 0 }),
							value: valueResult.node ?? null,
						}),
					);
					i = valueResult.nextIdx;
				} else {
					pairs.push(
						new YamlPair({
							key: keyNode ?? new YamlScalar({ value: null, style: "plain" as ScalarStyle, offset: 0, length: 0 }),
							value: null,
						}),
					);
				}
			} else {
				// Key with no value
				pairs.push(
					new YamlPair({
						key: keyNode ?? new YamlScalar({ value: null, style: "plain" as ScalarStyle, offset: 0, length: 0 }),
						value: null,
					}),
				);
			}
			continue;
		}
		i++;
	}
}

function consumeValueNode(items: SemanticItem[], startIdx: number): { node: YamlNode | null; nextIdx: number } | null {
	let i = startIdx;
	while (i < items.length) {
		const item = items[i];
		if (!item) break;
		if (item.kind === "comment") {
			i++;
			continue;
		}
		if (item.kind === "node") {
			return { node: item.node ?? null, nextIdx: i + 1 };
		}
		break;
	}
	return i > startIdx ? { node: null, nextIdx: i } : null;
}

/**
 * Like consumeValueNode but for implicit null-key entries (`: value`).
 * If the next non-comment node is immediately followed by a value-sep
 * AND is on a different line from the null key's `:`, it's actually a
 * KEY for the next pair, not our value — return null so the null key
 * gets a null value. When on the same line (e.g. `a: b: c: d`), consume
 * normally to preserve the original pairing (which may produce duplicate
 * keys that get rejected).
 */
function consumeValueNodeForNullKey(
	items: SemanticItem[],
	startIdx: number,
	text: string,
	valueSepOffset: number,
): { node: YamlNode | null; nextIdx: number } | null {
	let i = startIdx;
	while (i < items.length) {
		const item = items[i];
		if (!item) break;
		if (item.kind === "comment") {
			i++;
			continue;
		}
		if (item.kind === "node") {
			if (i + 1 < items.length && items[i + 1]?.kind === "value-sep") {
				// Check if the candidate node is on a different line from the
				// null key's value-sep. Only refuse to consume cross-line nodes.
				const nodeOffset = item.node && "offset" in item.node ? (item.node as YamlScalar).offset : 0;
				const hasNewline = text.slice(valueSepOffset, nodeOffset).includes("\n");
				if (hasNewline) {
					// Cross-line: this node is a key for the next pair, not our value.
					break;
				}
			}
			return { node: item.node ?? null, nextIdx: i + 1 };
		}
		break;
	}
	return i > startIdx ? { node: null, nextIdx: i } : null;
}

/**
 * Validate that flow collection entries are separated by commas.
 *
 * Detects the specific pattern: content, `:`, content, content (no comma).
 * This catches `{foo: 1 bar: 2}` while allowing multiline plain scalars
 * like `{multi\n  line: value}` (consecutive scalars without colon between).
 *
 * State machine: idle → saw-colon → saw-value → error-if-no-comma
 */
function validateFlowSeparators(
	children: readonly CstNode[],
	state: ComposerState,
	openBracket: string,
	closeBracket: string,
): void {
	// Track: after seeing "scalar : scalar", the next scalar without comma is an error
	let colonCount = 0; // number of colons seen since last comma
	let contentAfterColon = 0; // content tokens after the most recent colon

	for (const child of children) {
		if (child.type === "whitespace" && (child.source === openBracket || child.source === closeBracket)) continue;
		if (child.type === "newline") continue;
		if (child.type === "comment") {
			// A comment between content tokens in a flow collection breaks
			// plain scalar continuation — if content follows, it needs a comma.
			if (contentAfterColon > 0) {
				colonCount = 1;
				contentAfterColon = 1;
			}
			continue;
		}
		if (child.type === "whitespace" && child.source.trim() === "") continue;

		if (child.type === "whitespace" && child.source === ",") {
			colonCount = 0;
			contentAfterColon = 0;
			continue;
		}
		if (child.type === "whitespace" && child.source === ":") {
			colonCount++;
			contentAfterColon = 0;
			continue;
		}

		const isContent =
			child.type === "flow-scalar" ||
			child.type === "block-scalar" ||
			child.type === "flow-map" ||
			child.type === "flow-seq" ||
			child.type === "alias";

		if (isContent) {
			contentAfterColon++;
			// Error: we've seen at least one colon, a value after it, and now
			// another content token without a comma. This means something like
			// `key: value nextkey` (missing comma).
			if (colonCount > 0 && contentAfterColon > 1) {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "MalformedFlowCollection",
						message: "Missing comma between flow collection entries",
						offset: child.offset,
						length: child.length,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
		}
	}
}

function checkDuplicateKeys(pairs: YamlPair[], state: ComposerState): void {
	const seen = new Set<unknown>();
	for (const pair of pairs) {
		if (pair.key instanceof YamlScalar) {
			const keyValue = pair.key.value;
			if (seen.has(keyValue)) {
				const lc = lineCol(state.text, pair.key.offset);
				state.warnings.push(
					new YamlErrorDetail({
						code: "DuplicateKey",
						message: `Duplicate key: ${String(keyValue)}`,
						offset: pair.key.offset,
						length: pair.key.length,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
			seen.add(keyValue);
		}
	}
}

/**
 * Validate that implicit mapping keys do not span multiple lines.
 * YAML 1.2 §7.4.2 requires implicit keys to fit on a single line.
 */
function checkMultilineImplicitKeys(
	pairs: readonly YamlPair[],
	state: ComposerState,
	items?: readonly SemanticItem[],
): void {
	// Check quoted scalar keys for newlines — quoted scalars (single/double)
	// have CST spans that include the newline when they span multiple lines.
	// Only check quoted styles; plain scalars in block context have single-line
	// CST spans and explicit keys (?) are allowed to be multiline.
	for (const pair of pairs) {
		const key = pair.key;
		if (key._tag !== "YamlScalar") continue;
		if (key.length === 0) continue; // synthetic null key
		const s = key.style;
		if (s !== "single-quoted" && s !== "double-quoted") continue;
		const keySource = state.text.slice(key.offset, key.offset + key.length);
		if (keySource.includes("\n") || keySource.includes("\r")) {
			const lc = lineCol(state.text, key.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: "Implicit mapping key must not span multiple lines",
					offset: key.offset,
					length: key.length,
					line: lc.line,
					column: lc.column,
				}),
			);
		}
	}

	// In flow context, also check if key and value-sep (:) are on different lines
	if (!items) return;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item) continue;
		if (item.kind !== "node" && item.kind !== "key") continue;
		const node = item.node;
		if (!node || node._tag !== "YamlScalar" || node.length === 0) continue;
		// Look ahead for value-sep
		let j = i + 1;
		while (j < items.length && items[j]?.kind === "comment") j++;
		const next = items[j];
		if (!next || next.kind !== "value-sep" || next.offset === undefined) continue;
		const keyEndLine = lineCol(state.text, node.offset + node.length - 1).line;
		const sepLine = lineCol(state.text, next.offset).line;
		if (keyEndLine !== sepLine) {
			const lc = lineCol(state.text, node.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: "Implicit mapping key and value indicator must be on the same line",
					offset: node.offset,
					length: node.length,
					line: lc.line,
					column: lc.column,
				}),
			);
		}
	}
}

/** Returns true if there is non-whitespace content before `offset` on the same line. */
function hasNonWhitespaceBeforeOnLine(text: string, offset: number): boolean {
	for (let i = offset - 1; i >= 0; i--) {
		const ch = text[i];
		if (ch === "\n" || ch === "\r") return false;
		if (ch !== " " && ch !== "\t") return true;
	}
	return false; // start of string
}

/**
 * Check for non-trivial CST content on the same line after a completed value node.
 * Used to detect trailing content after quoted scalars and flow collections.
 * Skips if the next non-trivia content is a ":" (value-sep), since that means
 * this node is actually a key, not a value.
 */
function checkTrailingContentOnSameLine(
	children: readonly CstNode[],
	startIdx: number,
	valueNode: CstNode,
	state: ComposerState,
): void {
	const valueEnd = valueNode.offset + valueNode.length;
	for (let j = startIdx; j < children.length; j++) {
		const next = children[j];
		if (!next) continue;
		if (next.type === "newline") break;
		if (next.type === "comment") break; // comments are allowed
		if (next.type === "whitespace") {
			if (next.source === ":") break; // this scalar is a key, not a value
			if (next.source.trim() === "") continue;
		}
		// Non-trivial content — check if on same line
		if (sameLine(state.text, valueEnd - 1, next.offset)) {
			const lc = lineCol(state.text, next.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: "Trailing content after value on same line",
					offset: next.offset,
					length: next.length,
					line: lc.line,
					column: lc.column,
				}),
			);
		}
		break;
	}
}

/**
 * Check for trailing content after a complete value at document level.
 * After a flow collection or scalar at the top level, only trivia and
 * document markers should follow. Skips if next meaningful content is ":"
 * (the flow collection is being used as a mapping key).
 */
function checkTrailingContentAfterDocValue(
	children: readonly CstNode[],
	startIdx: number,
	state: ComposerState,
	allowMappingKey = true,
): void {
	for (let j = startIdx; j < children.length; j++) {
		const next = children[j];
		if (!next) continue;
		if (next.type === "newline" || next.type === "comment") continue;
		if (next.type === "whitespace") {
			// Document markers (---, ...) are OK
			if (next.source === "---" || next.source === "...") break;
			// ":" means this value is a mapping key — not trailing content
			if (next.source === ":") break;
			if (next.source.trim() === "") continue;
		}
		// Non-trivial content after a complete document value.
		// If allowed, check if this content looks like a mapping key (followed by
		// ":" or a block-map) — it's a sibling mapping pair, not trailing content.
		if (
			allowMappingKey &&
			(next.type === "flow-scalar" ||
				next.type === "block-scalar" ||
				next.type === "flow-map" ||
				next.type === "flow-seq")
		) {
			const afterNode = findNextContentChild(children, j + 1);
			if (hasValueSepAfter(children, j + 1) || (afterNode !== null && afterNode.type === "block-map")) {
				break;
			}
		}
		if (
			next.type === "flow-scalar" ||
			next.type === "block-scalar" ||
			next.type === "block-map" ||
			next.type === "block-seq" ||
			next.type === "flow-map" ||
			next.type === "flow-seq" ||
			next.type === "anchor" ||
			next.type === "tag" ||
			next.type === "alias"
		) {
			const lc = lineCol(state.text, next.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: "Trailing content after document value",
					offset: next.offset,
					length: next.length,
					line: lc.line,
					column: lc.column,
				}),
			);
		}
		break;
	}
}

/**
 * Returns true if offsetA and offsetB are on the same source line (no newline between them).
 */
function sameLine(text: string, offsetA: number, offsetB: number): boolean {
	const lo = Math.min(offsetA, offsetB);
	const hi = Math.max(offsetA, offsetB);
	for (let i = lo; i < hi && i < text.length; i++) {
		if (text[i] === "\n") return false;
	}
	return true;
}

/**
 * Validate that document markers (--- and ...) are not followed by content
 * on the same line. YAML 1.2 §9.1.4/§9.2 require these markers to be on
 * their own line (followed only by whitespace/comments).
 *
 * Checks within a single document's children AND across document boundaries
 * (e.g. `... invalid` where `...` ends doc 1 and `invalid` starts doc 2).
 */
function checkDocumentMarkerSameLine(
	children: readonly CstNode[],
	state: ComposerState,
	nextDocChildren?: readonly CstNode[],
): void {
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;
		// Document markers appear as "whitespace"-typed CST nodes with source "---" or "..."
		if (child.type !== "whitespace") continue;
		const src = child.source;
		// Only check "..." — "---" CAN be followed by content on the same line
		if (src !== "...") continue;

		// Find next non-whitespace, non-newline sibling in same document
		let found = false;
		for (let j = i + 1; j < children.length; j++) {
			const next = children[j];
			if (!next) continue;
			if (next.type === "newline") break;
			if (next.type === "whitespace" && next.source.trim() === "") continue;
			if (next.type === "comment") break; // comments are allowed after ...
			// Non-trivial content found — check if it's on the same line
			if (sameLine(state.text, child.offset, next.offset)) {
				const lc = lineCol(state.text, next.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "UnexpectedToken",
						message: "Content on same line as document-end marker",
						offset: next.offset,
						length: next.length,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
			found = true;
			break;
		}

		// For "..." at end of document, check first content of next document
		if (!found && nextDocChildren) {
			for (const next of nextDocChildren) {
				if (!next) continue;
				if (next.type === "newline") break;
				if (next.type === "whitespace" && next.source.trim() === "") continue;
				if (sameLine(state.text, child.offset, next.offset)) {
					const lc = lineCol(state.text, next.offset);
					state.errors.push(
						new YamlErrorDetail({
							code: "UnexpectedToken",
							message: "Content on same line as document-end marker",
							offset: next.offset,
							length: next.length,
							line: lc.line,
							column: lc.column,
						}),
					);
				}
				break;
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Compose block seq
// ---------------------------------------------------------------------------

function composeBlockSeq(cst: CstNode, state: ComposerState, meta?: NodeMeta): YamlSeq {
	const children = cst.children ?? [];
	const items: YamlNode[] = [];
	let pendingMeta: NodeMeta = {};
	let sawEntry = false;

	for (let ci = 0; ci < children.length; ci++) {
		const child = children[ci];
		if (!child) continue;
		if (child.type === "newline" || child.type === "comment") continue;
		if (child.type === "whitespace") {
			// "-" is the sequence entry indicator
			if (child.source.trim() === "-") {
				// If we saw a previous entry with no content, push null
				if (sawEntry) {
					items.push(
						new YamlScalar({
							value: null,
							style: "plain" as ScalarStyle,
							offset: child.offset,
							length: 0,
						}),
					);
				}
				sawEntry = true;
			}
			continue;
		}
		if (child.type === "error") {
			const lc = lineCol(state.text, child.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: `Unexpected content: ${child.source.trim() || "(empty)"}`,
					offset: child.offset,
					length: child.length,
					line: lc.line,
					column: lc.column,
				}),
			);
			continue;
		}
		if (child.type === "anchor") {
			pendingMeta.anchor = getAnchorName(child, state.text);
			continue;
		}
		if (child.type === "tag") {
			pendingMeta.tag = child.source;
			continue;
		}
		if (child.type === "flow-scalar" || child.type === "block-scalar") {
			// Look ahead: if followed by a block-map sibling, this scalar is
			// the first key of an implicit mapping (e.g., "- name: value")
			const nextSig = findNextSignificantChild(children, ci + 1, true);
			const nextSigChild = nextSig !== null ? children[nextSig] : undefined;
			if (nextSig !== null && nextSigChild && nextSigChild.type === "block-map") {
				const keyScalar = makeScalar(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
				const map = composeBlockMap(nextSigChild, state, keyScalar, undefined);
				pendingMeta = {};
				sawEntry = false;
				items.push(map);
				ci = nextSig;
				continue;
			}
			// Merge consecutive plain scalars in same entry (multi-line plain scalar)
			// Uses collectMultilinePlainScalar to also handle continuation lines
			// where the lexer mis-tokenized content as anchors, tags, block-seq, etc. (AB8U)
			if (child.type === "flow-scalar" && getScalarStyle(child) === "plain") {
				const {
					value: merged,
					nextIdx: mergeEnd,
					partsCount,
				} = collectMultilinePlainScalar(children, ci, undefined, state.text);
				if (partsCount > 1) {
					const resolved = resolveScalar(merged, "plain", pendingMeta.tag, state);
					const scalar = new YamlScalar({
						value: resolved,
						style: "plain" as ScalarStyle,
						offset: child.offset,
						length: child.length,
						...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
						...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
					});
					if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
					pendingMeta = {};
					sawEntry = false;
					items.push(scalar);
					ci = mergeEnd - 1;
					continue;
				}
			}
			const scalar = makeScalar(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			sawEntry = false;
			items.push(scalar);
			continue;
		}
		if (child.type === "alias") {
			const alias = makeAlias(child, state);
			pendingMeta = {};
			sawEntry = false;
			items.push(alias);
			continue;
		}
		if (child.type === "block-map") {
			const map = composeBlockMap(child, state, undefined, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			sawEntry = false;
			items.push(map);
			continue;
		}
		if (child.type === "block-seq") {
			const seq = composeBlockSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			sawEntry = false;
			items.push(seq);
			continue;
		}
		if (child.type === "flow-map") {
			const map = composeFlowMap(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			sawEntry = false;
			items.push(map);
			// In block-seq, flow collections are always entry values, check for trailing
			checkTrailingContentOnSameLine(children, ci + 1, child, state);
			continue;
		}
		if (child.type === "flow-seq") {
			const seq = composeFlowSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			sawEntry = false;
			items.push(seq);
			// In block-seq, flow collections are always entry values, check for trailing
			checkTrailingContentOnSameLine(children, ci + 1, child, state);
		}
	}
	// Flush trailing entry with no content as null
	if (sawEntry && !hasMeta(pendingMeta)) {
		items.push(
			new YamlScalar({
				value: null,
				style: "plain" as ScalarStyle,
				offset: cst.offset + cst.length,
				length: 0,
			}),
		);
	}
	// Flush trailing pending tag/anchor as empty scalar (e.g., - !!str)
	if (hasMeta(pendingMeta)) {
		const value = resolveScalar("", "plain", pendingMeta.tag, state);
		const scalar = new YamlScalar({
			value,
			style: "plain" as ScalarStyle,
			offset: 0,
			length: 0,
			...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
			...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
		});
		if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, 0);
		items.push(scalar);
	}

	const seq = new YamlSeq({
		items,
		style: "block" as CollectionStyle,
		offset: cst.offset,
		length: cst.length,
		...(meta?.tag !== undefined ? { tag: meta.tag } : {}),
		...(meta?.anchor !== undefined ? { anchor: meta.anchor } : {}),
		...(meta?.comment !== undefined ? { comment: meta.comment } : {}),
	});

	if (meta?.anchor) registerAnchor(seq, meta.anchor, state, cst.offset);
	return seq;
}

// ---------------------------------------------------------------------------
// Compose flow map
// ---------------------------------------------------------------------------

function composeFlowMap(cst: CstNode, state: ComposerState, meta?: NodeMeta): YamlMap {
	const children = cst.children ?? [];
	const pairs: YamlPair[] = [];

	// Validate bracket balance
	const hasOpen = children.some((c) => c.type === "whitespace" && c.source === "{");
	const hasClose = children.some((c) => c.type === "whitespace" && c.source === "}");
	if (hasOpen && !hasClose) {
		const lc = lineCol(state.text, cst.offset);
		state.errors.push(
			new YamlErrorDetail({
				code: "MalformedFlowCollection",
				message: "Unclosed flow mapping (missing `}`)",
				offset: cst.offset,
				length: cst.length,
				line: lc.line,
				column: lc.column,
			}),
		);
	}

	// Validate that flow mapping entries are separated by commas.
	// Between consecutive content tokens (scalars, nested collections),
	// there must be a comma separator unless one is a value indicator (:).
	validateFlowSeparators(children, state, "{", "}");

	// Filter out brackets and blank whitespace, but KEEP commas and newlines
	// so that flattenFlowChildren can respect segment boundaries for multi-line keys.
	const content = children.filter(
		(c) => !(c.type === "whitespace" && (c.source === "{" || c.source === "}" || c.source.trim() === "")),
	);

	const items = flattenFlowChildren(content, state);
	buildPairs(items, pairs, state.text);

	if (state.options.uniqueKeys) checkDuplicateKeys(pairs, state);

	const map = new YamlMap({
		items: pairs,
		style: "flow" as CollectionStyle,
		offset: cst.offset,
		length: cst.length,
		...(meta?.tag !== undefined ? { tag: meta.tag } : {}),
		...(meta?.anchor !== undefined ? { anchor: meta.anchor } : {}),
		...(meta?.comment !== undefined ? { comment: meta.comment } : {}),
	});

	if (meta?.anchor) registerAnchor(map, meta.anchor, state, cst.offset);
	return map;
}

function flattenFlowChildren(children: readonly CstNode[], state: ComposerState): SemanticItem[] {
	const items: SemanticItem[] = [];
	let pendingMeta: NodeMeta = {};

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!child) continue;
		if (child.type === "newline") continue;
		if (child.type === "whitespace") {
			// Skip commas (kept in content for multi-line key boundary detection)
			if (child.source === ",") continue;
			if (child.source === ":") {
				// Flush pending tag/anchor as empty scalar before value-sep
				if (hasMeta(pendingMeta)) {
					const value = resolveScalar("", "plain", pendingMeta.tag, state);
					const scalar = new YamlScalar({
						value,
						style: "plain" as ScalarStyle,
						offset: child.offset,
						length: 0,
						...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
						...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
					});
					if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
					pendingMeta = {};
					items.push({ kind: "node", node: scalar });
				}
				items.push({ kind: "value-sep", offset: child.offset });
			}
			continue;
		}
		if (child.type === "comment") {
			items.push({
				kind: "comment",
				comment: child.source.startsWith("#") ? child.source.slice(1).trim() : child.source,
			});
			continue;
		}
		if (child.type === "error") {
			const lc = lineCol(state.text, child.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: `Unexpected content: ${child.source.trim() || "(empty)"}`,
					offset: child.offset,
					length: child.length,
					line: lc.line,
					column: lc.column,
				}),
			);
			continue;
		}
		if (child.type === "anchor") {
			pendingMeta.anchor = getAnchorName(child, state.text);
			continue;
		}
		if (child.type === "tag") {
			pendingMeta.tag = child.source;
			continue;
		}
		if (child.type === "flow-scalar" || child.type === "block-scalar") {
			// Check for # without preceding space — YAML 1.2 §6.6 requires
			// whitespace before # for it to be a comment indicator. When # appears
			// as a plain scalar immediately after , or ] or }, it means # wasn't
			// preceded by whitespace.
			if (
				child.type === "flow-scalar" &&
				getScalarStyle(child) === "plain" &&
				child.source.startsWith("#") &&
				child.offset > 0
			) {
				const prev = state.text[child.offset - 1];
				if (prev !== " " && prev !== "\t" && prev !== "\n" && prev !== "\r") {
					const lc = lineCol(state.text, child.offset);
					state.errors.push(
						new YamlErrorDetail({
							code: "UnexpectedToken",
							message: "Comment must be preceded by whitespace",
							offset: child.offset,
							length: child.length,
							line: lc.line,
							column: lc.column,
						}),
					);
				}
			}
			if (child.type === "flow-scalar" && getScalarStyle(child) === "plain") {
				if (hasValueSepThroughPlainScalars(children, i + 1)) {
					// Plain scalar eventually followed by ":" (possibly through
					// continuation plain scalars) — merge as multi-line key
					const { value, nextIdx } = collectMultilineKey(children, i);
					const resolved = resolveScalar(value, "plain", pendingMeta.tag, state);
					const scalar = new YamlScalar({
						value: resolved,
						style: "plain" as ScalarStyle,
						offset: child.offset,
						length: child.length,
						...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
						...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
					});
					if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
					pendingMeta = {};
					items.push({ kind: "node", node: scalar });
					i = nextIdx - 1;
					continue;
				}
				// Not followed by ":" — try multi-line value merging
				const { value, nextIdx } = collectMultilinePlainScalar(children, i, undefined, state.text);
				const resolved = resolveScalar(value, "plain", pendingMeta.tag, state);
				const scalar = new YamlScalar({
					value: resolved,
					style: "plain" as ScalarStyle,
					offset: child.offset,
					length: child.length,
					...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
					...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
				});
				if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, child.offset);
				pendingMeta = {};
				items.push({ kind: "node", node: scalar });
				i = nextIdx - 1;
				continue;
			}
			const scalar = makeScalar(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push({ kind: "node", node: scalar });
			continue;
		}
		if (child.type === "alias") {
			const alias = makeAlias(child, state);
			pendingMeta = {};
			items.push({ kind: "node", node: alias });
			continue;
		}
		if (child.type === "flow-map") {
			const map = composeFlowMap(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push({ kind: "node", node: map });
			continue;
		}
		if (child.type === "flow-seq") {
			const seq = composeFlowSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push({ kind: "node", node: seq });
		}
	}
	// Flush trailing pending tag/anchor as empty scalar (e.g., !!str at end of flow)
	if (hasMeta(pendingMeta)) {
		const value = resolveScalar("", "plain", pendingMeta.tag, state);
		const scalar = new YamlScalar({
			value,
			style: "plain" as ScalarStyle,
			offset: 0,
			length: 0,
			...(pendingMeta.tag !== undefined ? { tag: pendingMeta.tag } : {}),
			...(pendingMeta.anchor !== undefined ? { anchor: pendingMeta.anchor } : {}),
		});
		if (pendingMeta.anchor) registerAnchor(scalar, pendingMeta.anchor, state, 0);
		items.push({ kind: "node", node: scalar });
	}
	return items;
}

// ---------------------------------------------------------------------------
// Compose flow seq
// ---------------------------------------------------------------------------

function composeFlowSeq(cst: CstNode, state: ComposerState, meta?: NodeMeta): YamlSeq {
	const children = cst.children ?? [];
	const items: YamlNode[] = [];

	// Validate flow separators (commas between entries)
	validateFlowSeparators(children, state, "[", "]");

	// Validate bracket balance: check that the flow sequence has matching brackets.
	const hasOpen = children.some((c) => c.type === "whitespace" && c.source === "[");
	const hasClose = children.some((c) => c.type === "whitespace" && c.source === "]");
	if (hasOpen && !hasClose) {
		const lc = lineCol(state.text, cst.offset);
		state.errors.push(
			new YamlErrorDetail({
				code: "MalformedFlowCollection",
				message: "Unclosed flow sequence (missing `]`)",
				offset: cst.offset,
				length: cst.length,
				line: lc.line,
				column: lc.column,
			}),
		);
	}

	// Split children into comma-delimited segments, filtering out brackets.
	// Each segment is processed independently: if it contains a ":" value
	// separator, it's an implicit single-pair mapping (YAML 1.2 §7.4);
	// otherwise each node in the segment is a plain sequence entry.
	const segments: CstNode[][] = [];
	let current: CstNode[] = [];

	let seenContent = false;
	let lastWasComma = false;

	for (const child of children) {
		// Skip brackets
		if (child.type === "whitespace" && (child.source === "[" || child.source === "]")) continue;
		// Split on commas
		if (child.type === "whitespace" && child.source === ",") {
			// Detect leading comma or consecutive commas (empty flow entry)
			const hasContentInSegment = current.some(
				(c) => c.type !== "whitespace" && c.type !== "newline" && c.type !== "comment",
			);
			if (!hasContentInSegment && (lastWasComma || !seenContent)) {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "MalformedFlowCollection",
						message: "Empty entry in flow sequence",
						offset: child.offset,
						length: 1,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
			if (current.length > 0) segments.push(current);
			current = [];
			lastWasComma = true;
			continue;
		}
		if (child.type !== "whitespace" && child.type !== "newline" && child.type !== "comment") {
			seenContent = true;
			lastWasComma = false;
		}
		current.push(child);
	}
	if (current.length > 0) segments.push(current);

	for (const segment of segments) {
		// Check if this segment contains a value separator (implicit mapping)
		const hasValueSep = segment.some((c) => c.type === "whitespace" && c.source === ":");

		if (hasValueSep) {
			// Process as a single-pair implicit mapping
			// Keep newlines so flattenFlowChildren can merge multi-line plain scalars
			const content = segment.filter((c) => !(c.type === "whitespace" && c.source.trim() === ""));
			const semItems = flattenFlowChildren(content, state);
			const pairs: YamlPair[] = [];
			buildPairs(semItems, pairs, state.text);
			// Only check multiline keys for implicit mappings (no `?` marker).
			// Explicit keys (with `?`) are allowed to span multiple lines.
			const hasExplicitKey = segment.some((c) => c.type === "whitespace" && c.source === "?");
			if (!hasExplicitKey) {
				checkMultilineImplicitKeys(pairs, state, semItems);
			}
			const firstPair = pairs[0];
			if (firstPair) {
				const map = new YamlMap({
					items: pairs,
					style: "flow" as CollectionStyle,
					offset: firstPair.key.offset,
					length: 0,
				});
				items.push(map);
			}
		} else {
			// Process as plain sequence items
			// Keep newlines so flattenFlowChildren can merge multi-line plain scalars
			const content = segment.filter((c) => !(c.type === "whitespace" && c.source.trim() === ""));
			const semItems = flattenFlowChildren(content, state);
			for (const si of semItems) {
				if (si.kind === "node" && si.node) {
					items.push(si.node);
				}
			}
		}
	}

	const seq = new YamlSeq({
		items,
		style: "flow" as CollectionStyle,
		offset: cst.offset,
		length: cst.length,
		...(meta?.tag !== undefined ? { tag: meta.tag } : {}),
		...(meta?.anchor !== undefined ? { anchor: meta.anchor } : {}),
		...(meta?.comment !== undefined ? { comment: meta.comment } : {}),
	});

	if (meta?.anchor) registerAnchor(seq, meta.anchor, state, cst.offset);
	return seq;
}

// ---------------------------------------------------------------------------
// Flat block map helpers (for document children without block-map wrapper)
// ---------------------------------------------------------------------------

/** Check if there's a value separator ":" after startIdx (skipping only whitespace). */
function hasValueSepAfter(children: readonly CstNode[], startIdx: number): boolean {
	for (let j = startIdx; j < children.length; j++) {
		const c = children[j];
		if (!c) continue;
		if (c.type === "whitespace" && c.source === ":") return true;
		if (c.type === "whitespace" && c.source !== ":") continue;
		if (c.type === "newline") continue;
		break;
	}
	return false;
}

/**
 * Compose a block map from flat document children (no block-map wrapper node).
 * This happens in multi-document scenarios where the parser doesn't create a block-map node.
 */
function composeFlatBlockMap(
	children: readonly CstNode[],
	startIdx: number,
	parentCst: CstNode,
	state: ComposerState,
	externalFirstKey: YamlNode,
	meta?: NodeMeta,
): YamlMap {
	// Collect the remaining children into semantic items
	const remainingChildren = children.slice(startIdx);
	const items = flattenBlockMapChildren(remainingChildren, state);
	items.unshift({ kind: "key", node: externalFirstKey });

	const pairs: YamlPair[] = [];
	buildPairs(items, pairs, state.text);

	if (state.options.uniqueKeys) checkDuplicateKeys(pairs, state);
	checkMultilineImplicitKeys(pairs, state);

	const offset = "offset" in externalFirstKey ? (externalFirstKey as YamlScalar).offset : parentCst.offset;
	const end = parentCst.offset + parentCst.length;

	const map = new YamlMap({
		items: pairs,
		style: "block" as CollectionStyle,
		offset,
		length: end - offset,
		...(meta?.tag !== undefined ? { tag: meta.tag } : {}),
		...(meta?.anchor !== undefined ? { anchor: meta.anchor } : {}),
		...(meta?.comment !== undefined ? { comment: meta.comment } : {}),
	});

	if (meta?.anchor) registerAnchor(map, meta.anchor, state, offset);
	return map;
}

// ---------------------------------------------------------------------------
// Compose document
// ---------------------------------------------------------------------------

function composeDocument(
	cst: CstNode,
	state: ComposerState,
	hasSubsequentDocuments = false,
	nextDocCst?: CstNode,
): YamlDocument {
	const children = cst.children ?? [];
	const directives: YamlDirective[] = [];
	let contents: YamlNode | null = null;
	let documentComment: string | undefined;

	let i = 0;
	const meta: NodeMeta = {};

	while (i < children.length) {
		const child = children[i];
		if (!child) {
			i++;
			continue;
		}

		// Directives
		if (child.type === "directive") {
			const directive = parseDirective(child.source);
			if (directive) {
				directives.push(directive);
				// Populate tag map from %TAG directives
				if (directive.name === "TAG" && directive.parameters.length >= 2) {
					const handle = directive.parameters[0];
					const prefix = directive.parameters[1];
					if (handle && prefix) {
						state.tagMap.set(handle, prefix);
					}
				}
			}
			i++;
			continue;
		}

		// Trivia
		if (child.type === "whitespace" || child.type === "newline") {
			// Detect stray flow-closing brackets at document level
			if (child.type === "whitespace" && (child.source === "]" || child.source === "}")) {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "MalformedFlowCollection",
						message: `Unexpected flow indicator '${child.source}' at document level`,
						offset: child.offset,
						length: child.length,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
			i++;
			continue;
		}

		// Comments (before content)
		if (child.type === "comment" && contents === null) {
			documentComment = child.source.startsWith("#") ? child.source.slice(1).trim() : child.source;
			i++;
			continue;
		}

		// Error nodes from the lexer/parser (e.g. tab indentation)
		if (child.type === "error") {
			const lc = lineCol(state.text, child.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "UnexpectedToken",
					message: `Unexpected content: ${child.source.trim() || "(empty)"}`,
					offset: child.offset,
					length: child.length,
					line: lc.line,
					column: lc.column,
				}),
			);
			i++;
			continue;
		}

		// Anchor/tag metadata
		if (child.type === "anchor") {
			meta.anchor = getAnchorName(child, state.text);
			i++;
			continue;
		}
		if (child.type === "tag") {
			meta.tag = child.source;
			i++;
			continue;
		}

		if (child.type === "flow-scalar" || child.type === "block-scalar") {
			// Check if next meaningful child is a block-map (this scalar is a key)
			const nextContent = findNextContentChild(children, i + 1);
			if (nextContent && nextContent.type === "block-map") {
				// When metadata (tag/anchor) appears after a document-start marker (---),
				// it applies to the root mapping node. Otherwise, it applies to the key.
				const hasDocStart = children.some((c) => c.type === "whitespace" && c.source === "---");
				if (hasDocStart && hasMeta(meta)) {
					const mapMeta = { ...meta };
					const key = makeScalar(child, state);
					clearMeta(meta);
					contents = composeBlockMap(nextContent, state, key, mapMeta);
				} else {
					const key = makeScalar(child, state, hasMeta(meta) ? { ...meta } : undefined);
					clearMeta(meta);
					contents = composeBlockMap(nextContent, state, key);
				}
				i = indexOfChild(children, nextContent) + 1;
				continue;
			}
			// Check if followed by ":" (value-sep) — flat mapping without block-map wrapper
			if (hasValueSepAfter(children, i + 1)) {
				const hasDocStart = children.some((c) => c.type === "whitespace" && c.source === "---");
				if (hasDocStart && hasMeta(meta)) {
					const mapMeta = { ...meta };
					const key = makeScalar(child, state);
					clearMeta(meta);
					contents = composeFlatBlockMap(children, i + 1, cst, state, key, mapMeta);
				} else {
					const key = makeScalar(child, state, hasMeta(meta) ? { ...meta } : undefined);
					clearMeta(meta);
					contents = composeFlatBlockMap(children, i + 1, cst, state, key);
				}
				break; // consumed all remaining children
			}
			// Standalone scalar — try multi-line plain scalar merging
			if (child.type === "flow-scalar" && getScalarStyle(child) === "plain") {
				const { value, nextIdx, partsCount } = collectMultilinePlainScalar(children, i, undefined, state.text);
				const resolved = resolveScalar(value, "plain", meta.tag, state);
				contents = new YamlScalar({
					value: resolved,
					style: "plain" as ScalarStyle,
					offset: child.offset,
					length: child.length,
					...(meta.tag !== undefined ? { tag: meta.tag } : {}),
					...(meta.anchor !== undefined ? { anchor: meta.anchor } : {}),
				});
				if (meta.anchor) registerAnchor(contents, meta.anchor, state, child.offset);
				clearMeta(meta);
				// If the multiline scalar merged multiple parts and the remaining
				// content forms a mapping, that mapping is trailing garbage (2CMS).
				if (partsCount > 1) {
					const nextContent = findNextContentChild(children, nextIdx);
					if (nextContent) {
						const isTrailing =
							(nextContent.type === "flow-scalar" &&
								hasValueSepAfter(children, indexOfChild(children, nextContent) + 1)) ||
							nextContent.type === "block-map";
						if (isTrailing) {
							const lc = lineCol(state.text, nextContent.offset);
							state.errors.push(
								new YamlErrorDetail({
									code: "UnexpectedToken",
									message: "Trailing content after document value",
									offset: nextContent.offset,
									length: nextContent.length,
									line: lc.line,
									column: lc.column,
								}),
							);
						}
					}
				}
				i = nextIdx;
				continue;
			}
			contents = makeScalar(child, state, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			continue;
		}

		if (child.type === "block-map") {
			contents = composeBlockMap(child, state, undefined, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			continue;
		}

		if (child.type === "block-seq") {
			const isRootSeq = contents === null;
			contents = composeBlockSeq(child, state, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			// Only check for trailing content when the block-seq is the root document
			// value (BD7L, TD5N). When it's a value inside a mapping (57H4), the
			// remaining children are sibling mapping pairs.
			if (isRootSeq) {
				checkTrailingContentAfterDocValue(children, i, state, false);
			}
			continue;
		}

		if (child.type === "flow-map") {
			contents = composeFlowMap(child, state, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			// Check for trailing content, but not if flow collection is a mapping key
			const nextAfterFlowMap = findNextContentChild(children, i);
			if (!nextAfterFlowMap || nextAfterFlowMap.type !== "block-map") {
				checkTrailingContentAfterDocValue(children, i, state);
			}
			continue;
		}

		if (child.type === "flow-seq") {
			contents = composeFlowSeq(child, state, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			// Check for trailing content, but not if flow collection is a mapping key
			const nextAfterFlowSeq = findNextContentChild(children, i);
			if (!nextAfterFlowSeq || nextAfterFlowSeq.type !== "block-map") {
				checkTrailingContentAfterDocValue(children, i, state);
			}
			continue;
		}

		if (child.type === "alias") {
			contents = makeAlias(child, state);
			i++;
			continue;
		}

		i++;
	}

	// Validate directive rules
	validateDirectives(directives, cst, state, hasSubsequentDocuments);

	// Validate document marker same-line content
	checkDocumentMarkerSameLine(children, state, nextDocCst?.children);

	// Detect whether `---` document start marker was present in the CST
	const hasDocStart = children.some((c) => c.type === "whitespace" && c.source === "---");
	// Detect whether `...` document end marker was present in the CST
	const hasDocEnd = children.some((c) => c.type === "whitespace" && c.source === "...");

	return new YamlDocument({
		contents,
		errors: [...state.errors],
		warnings: [...state.warnings],
		directives,
		hasDocumentStart: hasDocStart,
		hasDocumentEnd: hasDocEnd,
		...(documentComment !== undefined ? { comment: documentComment } : {}),
	});
}

function findNextContentChild(children: readonly CstNode[], startIdx: number): CstNode | null {
	for (let i = startIdx; i < children.length; i++) {
		const c = children[i];
		if (!c) continue;
		if (
			c.type === "whitespace" ||
			c.type === "newline" ||
			c.type === "comment" ||
			c.type === "anchor" ||
			c.type === "tag"
		)
			continue;
		return c;
	}
	return null;
}

function indexOfChild(children: readonly CstNode[], target: CstNode): number {
	for (let i = 0; i < children.length; i++) {
		if (children[i] === target) return i;
	}
	return -1;
}

function clearMeta(m: NodeMeta): void {
	delete m.anchor;
	delete m.tag;
	delete m.comment;
}

function parseDirective(source: string): YamlDirective | null {
	const trimmed = source.trim();
	if (!trimmed.startsWith("%")) return null;
	const parts = trimmed.slice(1).split(/\s+/);
	const name = parts[0];
	const parameters = parts.slice(1);
	if (name === "YAML" || name === "TAG") {
		return new YamlDirective({ name, parameters });
	}
	return null;
}

/**
 * Validate YAML directive rules within a single document's CST.
 * Pushes errors into state.errors for any violations found.
 */
function validateDirectives(
	directives: YamlDirective[],
	cst: CstNode,
	state: ComposerState,
	hasSubsequentDocuments = false,
): void {
	const children = cst.children ?? [];

	// Check for duplicate %YAML directives
	const yamlDirectives = directives.filter((d) => d.name === "YAML");
	if (yamlDirectives.length > 1) {
		// Find the second directive's offset in the CST
		let directiveCount = 0;
		for (const child of children) {
			if (child.type === "directive" && child.source.trim().startsWith("%YAML")) {
				directiveCount++;
				if (directiveCount === 2) {
					const lc = lineCol(state.text, child.offset);
					state.errors.push(
						new YamlErrorDetail({
							code: "InvalidDirective",
							message: "Duplicate %YAML directive",
							offset: child.offset,
							length: child.length,
							line: lc.line,
							column: lc.column,
						}),
					);
					break;
				}
			}
		}
	}

	// Validate %YAML directive parameters
	for (const child of children) {
		if (child.type !== "directive") continue;
		const src = child.source.trim();
		if (!src.startsWith("%YAML")) continue;

		// Check for comment without preceding whitespace (e.g., %YAML 1.1#...)
		// The lexer consumes the entire line, so we check the raw source
		const hashIdx = src.indexOf("#");
		if (hashIdx > 0) {
			const before = src[hashIdx - 1];
			if (before !== " " && before !== "\t") {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "InvalidDirective",
						message: "Comment in directive requires preceding whitespace",
						offset: child.offset,
						length: child.length,
						line: lc.line,
						column: lc.column,
					}),
				);
				continue;
			}
		}

		// Strip inline comment before checking parameters
		const withoutComment = hashIdx > 0 ? src.slice(0, hashIdx).trimEnd() : src;
		const parts = withoutComment.slice(1).split(/\s+/);
		// parts[0] = "YAML", rest are parameters
		const params = parts.slice(1);
		if (params.length !== 1) {
			const lc = lineCol(state.text, child.offset);
			state.errors.push(
				new YamlErrorDetail({
					code: "InvalidDirective",
					message:
						params.length === 0
							? "%YAML directive requires a version parameter"
							: `%YAML directive has extra parameters: ${params.slice(1).join(" ")}`,
					offset: child.offset,
					length: child.length,
					line: lc.line,
					column: lc.column,
				}),
			);
		}
	}

	// Check that directives are followed by a document-start marker (---)
	let hasDirective = false;
	let hasDocumentStart = false;
	for (const child of children) {
		if (child.type === "directive") {
			hasDirective = true;
		}
		// document-start markers are consumed as "whitespace" type with source "---"
		if (child.type === "whitespace" && child.source === "---") {
			hasDocumentStart = true;
		}
	}
	if (hasDirective && !hasDocumentStart) {
		// Find the first directive for error position
		for (const child of children) {
			if (child.type === "directive") {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "InvalidDirective",
						message: "Directive must be followed by a document-start marker (---)",
						offset: child.offset,
						length: child.length,
						line: lc.line,
						column: lc.column,
					}),
				);
				break;
			}
		}
	}

	// Check that directives don't appear after content within the same document.
	// Only flag this when there are subsequent documents — otherwise the lexer
	// may have incorrectly tokenized plain scalar content (e.g. "%YAML 1.2" as
	// a continuation line) as a directive token.
	if (hasSubsequentDocuments) {
		let hasContent = false;
		for (const child of children) {
			if (
				child.type === "flow-scalar" ||
				child.type === "block-scalar" ||
				child.type === "block-map" ||
				child.type === "block-seq" ||
				child.type === "flow-map" ||
				child.type === "flow-seq" ||
				child.type === "alias" ||
				child.type === "anchor" ||
				child.type === "tag"
			) {
				hasContent = true;
			}
			if (child.type === "directive" && hasContent) {
				const lc = lineCol(state.text, child.offset);
				state.errors.push(
					new YamlErrorDetail({
						code: "InvalidDirective",
						message: "Directive after content requires a document-end marker (...) first",
						offset: child.offset,
						length: child.length,
						line: lc.line,
						column: lc.column,
					}),
				);
			}
			// Recursively check for directives inside content nodes (e.g. block-map)
			if (hasContent && child.children) {
				const nested = findNestedDirective(child);
				if (nested) {
					const lc = lineCol(state.text, nested.offset);
					state.errors.push(
						new YamlErrorDetail({
							code: "InvalidDirective",
							message: "Directive after content requires a document-end marker (...) first",
							offset: nested.offset,
							length: nested.length,
							line: lc.line,
							column: lc.column,
						}),
					);
				}
			}
		}
	}
}

/** Recursively find the first directive node within a CST subtree. */
function findNestedDirective(node: CstNode): CstNode | null {
	if (node.type === "directive") return node;
	if (node.children) {
		for (const child of node.children) {
			const found = findNestedDirective(child);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Validate directive placement across a multi-document CST stream.
 *
 * YAML 1.2 requires that directives appearing between documents must be
 * preceded by a document-end marker (`...`). This function checks each
 * CST document node after the first: if it contains directives, the
 * preceding document must have ended with `...`.
 */
function validateCrossDocumentDirectives(cstNodes: readonly CstNode[], state: ComposerState): void {
	for (let docIdx = 1; docIdx < cstNodes.length; docIdx++) {
		const cst = cstNodes[docIdx];
		if (!cst) continue;
		const children = cst.children ?? [];

		// Check if this document has directives
		const hasDirectives = children.some((c) => c.type === "directive");
		if (!hasDirectives) continue;

		// Check if the previous document ended with "..."
		const prevCst = cstNodes[docIdx - 1];
		if (!prevCst) continue;
		const prevChildren = prevCst.children ?? [];
		let prevEndedWithDocEnd = false;
		for (let i = prevChildren.length - 1; i >= 0; i--) {
			const c = prevChildren[i];
			if (!c) continue;
			// Document-end markers are stored as whitespace type with source "..."
			if (c.source === "...") {
				prevEndedWithDocEnd = true;
				break;
			}
			if (c.type === "newline" || c.type === "whitespace" || c.type === "comment") continue;
			break;
		}

		if (!prevEndedWithDocEnd) {
			// Find the first directive in this document for error positioning
			for (const child of children) {
				if (child.type === "directive") {
					const lc = lineCol(state.text, child.offset);
					state.errors.push(
						new YamlErrorDetail({
							code: "InvalidDirective",
							message: "Directive between documents requires a document-end marker (...) after the previous document",
							offset: child.offset,
							length: child.length,
							line: lc.line,
							column: lc.column,
						}),
					);
					break;
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// getNodeValue helper
// ---------------------------------------------------------------------------

/**
 * Build an anchor map by walking the AST, collecting nodes that have anchors.
 *
 * @internal
 *
 * @remarks
 * Used by the schema-integration layer to resolve aliases when extracting
 * plain JavaScript values from parsed YAML documents.
 *
 * @param node - The root AST node to walk.
 * @returns A map from anchor names to their defining AST nodes.
 */
export function buildAnchorMap(node: YamlNode | null): Map<string, YamlNode> {
	const anchors = new Map<string, YamlNode>();
	collectAnchors(node, anchors);
	return anchors;
}

function collectAnchors(node: YamlNode | null, anchors: Map<string, YamlNode>): void {
	if (node === null) return;
	if (node instanceof YamlScalar) {
		if (node.anchor !== undefined) anchors.set(node.anchor, node);
	} else if (node instanceof YamlMap) {
		if (node.anchor !== undefined) anchors.set(node.anchor, node);
		for (const pair of node.items) {
			collectAnchors(pair.key, anchors);
			collectAnchors(pair.value, anchors);
		}
	} else if (node instanceof YamlSeq) {
		if (node.anchor !== undefined) anchors.set(node.anchor, node);
		for (const item of node.items) {
			collectAnchors(item, anchors);
		}
	}
	// YamlAlias has no anchor field — it references one.
}

/**
 * Recursively extract a plain JavaScript value from a YAML AST node.
 *
 * @internal
 *
 * @privateRemarks
 * This function differs from the `getNodeValue` in `ast.ts` by accepting an
 * optional anchor map parameter. When provided, {@link YamlAlias} nodes are
 * resolved to their target values via the map, enabling full alias/anchor
 * round-trip support. The `ast.ts` version operates without anchor context
 * and returns `null` for all alias nodes.
 *
 * @param node - The AST node to extract a value from (or `null`).
 * @param anchors - Optional anchor map built by {@link buildAnchorMap}.
 * @returns The plain JavaScript value (object, array, scalar, or `null`).
 */
export function getNodeValue(node: YamlNode | null, anchors?: Map<string, YamlNode>): unknown {
	if (node === null) return null;
	// Register this node's anchor incrementally so aliases resolve
	// to the most recent anchor at the point of reference (not the last
	// definition in the entire document).
	if (anchors !== undefined) {
		const a = (node as YamlScalar | YamlMap | YamlSeq).anchor;
		if (a !== undefined) anchors.set(a, node);
	}
	if (node instanceof YamlScalar) return node.value;
	if (node instanceof YamlMap) {
		const result: Record<string, unknown> = {};
		for (const pair of node.items) {
			let key: string;
			if (pair.key instanceof YamlScalar) {
				// Register key anchor before resolving value
				if (anchors !== undefined && pair.key.anchor !== undefined) {
					anchors.set(pair.key.anchor, pair.key);
				}
				key = String(pair.key.value ?? "");
			} else if (pair.key instanceof YamlAlias) {
				const resolved = anchors?.get(pair.key.name);
				key = resolved !== undefined ? String(getNodeValue(resolved, anchors) ?? "") : "";
			} else {
				key = "";
			}
			result[key] = getNodeValue(pair.value, anchors);
		}
		return result;
	}
	if (node instanceof YamlSeq) return node.items.map((item) => getNodeValue(item, anchors));
	if (node instanceof YamlAlias) {
		const resolved = anchors?.get(node.name);
		return resolved !== undefined ? getNodeValue(resolved, anchors) : null;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse YAML text into a single {@link YamlDocument}.
 *
 * @remarks
 * Returns the first document found in the input. If the input is empty,
 * a document with `null` contents is returned. Fatal composer errors
 * (undefined aliases, alias count exceeded, unexpected tokens) cause
 * the Effect to fail with a {@link YamlComposerError}.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { parseDocument } from "yaml-effect";
 *
 * const program = parseDocument("name: Alice\nage: 30").pipe(
 *   Effect.tap((doc) => Effect.log(`Document has ${doc.errors.length} errors`)),
 * );
 *
 * Effect.runPromise(program);
 * ```
 *
 * @param text - The YAML source text to parse.
 * @param options - Optional parse options.
 * @returns An `Effect` that resolves to a {@link YamlDocument}.
 *
 * @public
 */
export function parseDocument(
	text: string,
	options?: Partial<YamlParseOptions>,
): Effect.Effect<YamlDocument, YamlComposerError> {
	return parseCSTAll(text).pipe(
		Effect.flatMap((cstNodes) => {
			const state = createState(text, options);

			// Validate cross-document directive placement
			validateCrossDocumentDirectives(cstNodes, state);

			const doc = cstNodes[0];
			if (!doc) {
				return Effect.succeed(new YamlDocument({ contents: null, errors: [], warnings: [], directives: [] }));
			}

			const result = composeDocument(doc, state, cstNodes.length > 1, cstNodes[1]);

			const fatalErrors = state.errors.filter(
				(e) =>
					e.code === "UndefinedAlias" ||
					e.code === "AliasCountExceeded" ||
					e.code === "UnexpectedToken" ||
					e.code === "InvalidDirective" ||
					e.code === "MalformedFlowCollection",
			);
			if (fatalErrors.length > 0) {
				return Effect.fail(new YamlComposerError({ errors: fatalErrors, text }));
			}

			return Effect.succeed(result);
		}),
	);
}

/**
 * Parse YAML text containing multiple documents into an array of
 * {@link YamlDocument}.
 *
 * @remarks
 * Splits the input on `---` document-start markers. Each document is
 * independently composed, and any fatal error in any document causes
 * the entire Effect to fail.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { parseAllDocuments } from "yaml-effect";
 *
 * const yaml = `
 * name: first
 * ---
 * name: second
 * `;
 *
 * const program = parseAllDocuments(yaml).pipe(
 *   Effect.tap((docs) => Effect.log(`Parsed ${docs.length} documents`)),
 * );
 *
 * Effect.runPromise(program);
 * ```
 *
 * @param text - The YAML source text containing one or more documents.
 * @param options - Optional parse options.
 * @returns An `Effect` that resolves to a read-only array of {@link YamlDocument}.
 *
 * @public
 */
export function parseAllDocuments(
	text: string,
	options?: Partial<YamlParseOptions>,
): Effect.Effect<ReadonlyArray<YamlDocument>, YamlComposerError> {
	return parseCSTAll(text).pipe(
		Effect.flatMap((cstNodes) => {
			const documents: YamlDocument[] = [];
			const fatalErrors: YamlErrorDetail[] = [];

			// Validate cross-document directive placement
			{
				const crossDocState = createState(text, options);
				validateCrossDocumentDirectives(cstNodes, crossDocState);
				const crossDocFatal = crossDocState.errors.filter((e) => e.code === "InvalidDirective");
				if (crossDocFatal.length > 0) fatalErrors.push(...crossDocFatal);
			}

			for (let i = 0; i < cstNodes.length; i++) {
				const cst = cstNodes[i];
				if (!cst) continue;
				const state = createState(text, options);
				const doc = composeDocument(cst, state, i < cstNodes.length - 1, cstNodes[i + 1]);
				documents.push(doc);

				const fatal = state.errors.filter(
					(e) =>
						e.code === "UndefinedAlias" ||
						e.code === "AliasCountExceeded" ||
						e.code === "UnexpectedToken" ||
						e.code === "InvalidDirective",
				);
				if (fatal.length > 0) fatalErrors.push(...fatal);
			}

			if (fatalErrors.length > 0) {
				return Effect.fail(new YamlComposerError({ errors: fatalErrors, text }));
			}

			return Effect.succeed(documents);
		}),
	);
}

/**
 * Parse YAML text and return the plain JavaScript value.
 *
 * @remarks
 * This is the highest-level parse function. It parses a single document,
 * resolves anchors/aliases, enforces unique keys (by default), and returns
 * the resulting JavaScript value (object, array, or scalar).
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { parse } from "yaml-effect";
 *
 * const program = parse("name: Alice\nage: 30").pipe(
 *   Effect.tap((value) => Effect.log(value)),
 *   Effect.catchTag("YamlComposerError", (err) =>
 *     Effect.logError(`Parse failed: ${err.message}`),
 *   ),
 * );
 *
 * Effect.runPromise(program);
 * // => { name: "Alice", age: 30 }
 * ```
 *
 * @param text - The YAML source text to parse.
 * @param options - Optional parse options (e.g. `{ uniqueKeys: false }`).
 * @returns An `Effect` that resolves to the parsed JavaScript value, or
 *   fails with a {@link YamlComposerError}.
 *
 * @public
 */
export function parse(text: string, options?: Partial<YamlParseOptions>): Effect.Effect<unknown, YamlComposerError> {
	const uniqueKeys = options?.uniqueKeys ?? true;
	return parseDocument(text, options).pipe(
		Effect.flatMap((doc) => {
			// When uniqueKeys is enabled (default), treat DuplicateKey warnings as errors.
			if (uniqueKeys) {
				const dupErrors = doc.warnings.filter((w) => w.code === "DuplicateKey");
				if (dupErrors.length > 0) {
					return Effect.fail(new YamlComposerError({ errors: dupErrors, text }));
				}
			}
			// Use an empty map so getNodeValue registers anchors incrementally,
			// ensuring aliases resolve to the most recent anchor at the point of use.
			const anchors = new Map<string, YamlNode>();
			return Effect.succeed(getNodeValue(doc.contents, anchors));
		}),
	);
}

/**
 * Compose a single CST document node into a {@link YamlDocument}.
 *
 * @remarks
 * This is the lower-level API for when you already have a CST node (e.g.
 * from {@link parseCST | parseCST}) and want to compose it into a typed
 * AST document without re-lexing/re-parsing.
 *
 * @example
 * ```typescript
 * import { Effect, Stream } from "effect";
 * import { parseCST } from "yaml-effect/parser";
 * import { composeDocumentFromCst } from "yaml-effect/composer";
 *
 * const yaml = "key: value";
 *
 * const program = Stream.runHead(parseCST(yaml)).pipe(
 *   Effect.flatten,
 *   Effect.flatMap((cst) => composeDocumentFromCst(cst, yaml)),
 *   Effect.tap((doc) => Effect.log(doc)),
 * );
 *
 * Effect.runPromise(program);
 * ```
 *
 * @param cst - A CST document node produced by the parser.
 * @param text - The original YAML source text (needed for error reporting).
 * @param options - Optional parse options.
 * @returns An `Effect` that resolves to a {@link YamlDocument}.
 *
 * @public
 */
export function composeDocumentFromCst(
	cst: CstNode,
	text: string,
	options?: Partial<YamlParseOptions>,
): Effect.Effect<YamlDocument, YamlComposerError> {
	const state = createState(text, options);
	const result = composeDocument(cst, state);

	const fatalErrors = state.errors.filter(
		(e) =>
			e.code === "UndefinedAlias" ||
			e.code === "AliasCountExceeded" ||
			e.code === "UnexpectedToken" ||
			e.code === "InvalidDirective" ||
			e.code === "MalformedFlowCollection",
	);
	if (fatalErrors.length > 0) {
		return Effect.fail(new YamlComposerError({ errors: fatalErrors, text }));
	}

	return Effect.succeed(result);
}
