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

function resolveScalar(rawValue: string, style: ScalarStyle, tag?: string): unknown {
	if (tag) return resolveTaggedScalar(rawValue, tag);
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

function getScalarValue(node: CstNode): string {
	if (node.type === "block-scalar") return decodeBlockScalar(node.source);
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
		// Continuation line: trim both leading and trailing whitespace
		const content = line.trim();
		if (content === "") {
			// Empty line → newline
			result += "\n";
		} else {
			// Non-empty continuation line: fold (previous non-empty → space → this)
			// But if the last char of result is already \n (from empty lines), don't add space
			if (result.length > 0 && result[result.length - 1] !== "\n") {
				result += " ";
			}
			result += content;
		}
	}
	return result;
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
 */
function collectMultilinePlainScalar(
	children: readonly CstNode[],
	startIdx: number,
): { value: string; nextIdx: number } {
	const first = children[startIdx];
	if (!first || first.type !== "flow-scalar") {
		return { value: first?.source.trim() ?? "", nextIdx: startIdx + 1 };
	}

	// Only merge plain scalars (not quoted)
	const style = getScalarStyle(first);
	if (style !== "plain") {
		return { value: getScalarValue(first), nextIdx: startIdx + 1 };
	}

	const parts: string[] = [first.source.trim()];
	let emptyLines = 0;
	let idx = startIdx + 1;

	while (idx < children.length) {
		const child = children[idx];
		if (!child) break;

		if (child.type === "newline") {
			emptyLines++;
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
			idx++;
			continue;
		}
		// Any other node type — stop merging
		break;
	}

	if (parts.length === 1) {
		return { value: parts[0] ?? "", nextIdx: idx };
	}

	// Apply flow folding to the collected parts
	return { value: foldFlowLines(parts.join("\n")), nextIdx: idx };
}

/**
 * Check if a value separator (`:`) follows in a CST children list,
 * skipping whitespace and newlines.
 */
function hasValueSepAfterInList(children: readonly CstNode[], startIdx: number): boolean {
	for (let j = startIdx; j < children.length; j++) {
		const c = children[j];
		if (!c) continue;
		if (c.type === "newline" || c.type === "comment") continue;
		if (c.type === "whitespace") {
			if (c.source === ":") return true;
			continue;
		}
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

function decodeBlockScalar(raw: string): string {
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

	let contentIndent = explicitIndent;
	if (contentIndent === 0) {
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
			break;
		}
	}

	if (contentIndent === 0) return chomp === "keep" ? "\n" : "";

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
		for (const ln of lines) {
			if (ln === "") {
				result += "\n";
			} else if (result.length === 0) {
				result = ln;
			} else {
				const lastChar = result[result.length - 1];
				result += lastChar === "\n" ? ln : ` ${ln}`;
			}
		}
		if (chomp === "keep") {
			result += "\n";
			for (const _nl of trailingNewlines) result += "\n";
		} else if (chomp !== "strip") {
			result += "\n";
		}
		value = result;
	} else {
		value = lines.join("\n");
		if (chomp === "keep") {
			value += "\n";
			for (const _nl of trailingNewlines) value += "\n";
		} else if (chomp !== "strip") {
			value += "\n";
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
	};
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
	const rawValue = getScalarValue(cst);
	const value = resolveScalar(rawValue, style, meta?.tag);
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
	const items = flattenBlockMapChildren(children, state);

	// If there's an external first key, prepend it
	if (externalFirstKey) {
		items.unshift({ kind: "key", node: externalFirstKey });
	}

	// Phase 2: pair up keys and values
	buildPairs(items, pairs, state.text);

	if (state.options.uniqueKeys) checkDuplicateKeys(pairs, state);

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

function flattenBlockMapChildren(children: readonly CstNode[], state: ComposerState): SemanticItem[] {
	const items: SemanticItem[] = [];
	let pendingMeta: NodeMeta = {};

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
			if (child.source === ":") {
				// Flush pending tag/anchor as empty scalar before value-sep
				if (hasMeta(pendingMeta)) {
					const value = resolveScalar("", "plain", pendingMeta.tag);
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
			// Skip other whitespace (spaces, "-", "?", "---", "...")
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
			// Check if this scalar is followed by a block-map (scalar is the first
			// key of a nested mapping: the parser puts the first key as a sibling
			// before its block-map child).
			const nextContent = findNextContentInList(children, i + 1);
			if (nextContent?.node.type === "block-map") {
				// The scalar is the first key of the nested mapping — keys don't
				// carry the pending anchor/tag; those belong on the map itself.
				const key = makeScalar(child, state);
				const map = composeBlockMap(nextContent.node, state, key, hasMeta(pendingMeta) ? pendingMeta : undefined);
				pendingMeta = {};
				items.push({ kind: "node", node: map });
				i = nextContent.idx; // skip to past the block-map
				continue;
			}
			// For plain scalars not followed by ":", try multi-line merging
			if (
				child.type === "flow-scalar" &&
				getScalarStyle(child) === "plain" &&
				!hasValueSepAfterInList(children, i + 1)
			) {
				const { value, nextIdx } = collectMultilinePlainScalar(children, i);
				const resolved = resolveScalar(value, "plain", pendingMeta.tag);
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
				i = nextIdx - 1; // -1 because for-loop increments
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
		if (child.type === "block-map") {
			const map = composeBlockMap(child, state, undefined, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push({ kind: "node", node: map });
			continue;
		}
		if (child.type === "block-seq") {
			const seq = composeBlockSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push({ kind: "node", node: seq });
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
	// Flush trailing pending tag/anchor as empty scalar
	if (hasMeta(pendingMeta)) {
		const value = resolveScalar("", "plain", pendingMeta.tag);
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

// ---------------------------------------------------------------------------
// Compose block seq
// ---------------------------------------------------------------------------

function composeBlockSeq(cst: CstNode, state: ComposerState, meta?: NodeMeta): YamlSeq {
	const children = cst.children ?? [];
	const items: YamlNode[] = [];
	let pendingMeta: NodeMeta = {};

	for (const child of children) {
		if (child.type === "newline" || child.type === "comment") continue;
		if (child.type === "whitespace") {
			// "-" is the sequence entry indicator, skip it
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
			const scalar = makeScalar(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(scalar);
			continue;
		}
		if (child.type === "alias") {
			const alias = makeAlias(child, state);
			pendingMeta = {};
			items.push(alias);
			continue;
		}
		if (child.type === "block-map") {
			const map = composeBlockMap(child, state, undefined, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(map);
			continue;
		}
		if (child.type === "block-seq") {
			const seq = composeBlockSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(seq);
			continue;
		}
		if (child.type === "flow-map") {
			const map = composeFlowMap(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(map);
			continue;
		}
		if (child.type === "flow-seq") {
			const seq = composeFlowSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(seq);
		}
	}
	// Flush trailing pending tag/anchor as empty scalar (e.g., - !!str)
	if (hasMeta(pendingMeta)) {
		const value = resolveScalar("", "plain", pendingMeta.tag);
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

	// Filter out brackets and commas, keep content
	const content = children.filter(
		(c) =>
			!(
				c.type === "whitespace" &&
				(c.source === "{" || c.source === "}" || c.source === "," || c.source.trim() === "")
			) && c.type !== "newline",
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

	for (const child of children) {
		if (child.type === "whitespace") {
			if (child.source === ":") {
				// Flush pending tag/anchor as empty scalar before value-sep
				if (hasMeta(pendingMeta)) {
					const value = resolveScalar("", "plain", pendingMeta.tag);
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
				items.push({ kind: "value-sep" });
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
		const value = resolveScalar("", "plain", pendingMeta.tag);
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
	let pendingMeta: NodeMeta = {};

	for (const child of children) {
		if (child.type === "newline") continue;
		if (child.type === "whitespace") continue; // brackets, commas, spaces
		if (child.type === "comment") continue;
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
			const scalar = makeScalar(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(scalar);
			continue;
		}
		if (child.type === "alias") {
			const alias = makeAlias(child, state);
			pendingMeta = {};
			items.push(alias);
			continue;
		}
		if (child.type === "flow-map") {
			const map = composeFlowMap(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(map);
			continue;
		}
		if (child.type === "flow-seq") {
			const seq = composeFlowSeq(child, state, hasMeta(pendingMeta) ? pendingMeta : undefined);
			pendingMeta = {};
			items.push(seq);
		}
	}
	// Flush trailing pending tag/anchor as empty scalar (e.g., [!!str])
	if (hasMeta(pendingMeta)) {
		const value = resolveScalar("", "plain", pendingMeta.tag);
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
): YamlMap {
	// Collect the remaining children into semantic items
	const remainingChildren = children.slice(startIdx);
	const items = flattenBlockMapChildren(remainingChildren, state);
	items.unshift({ kind: "key", node: externalFirstKey });

	const pairs: YamlPair[] = [];
	buildPairs(items, pairs, state.text);

	if (state.options.uniqueKeys) checkDuplicateKeys(pairs, state);

	const offset = "offset" in externalFirstKey ? (externalFirstKey as YamlScalar).offset : parentCst.offset;
	const end = parentCst.offset + parentCst.length;

	return new YamlMap({
		items: pairs,
		style: "block" as CollectionStyle,
		offset,
		length: end - offset,
	});
}

// ---------------------------------------------------------------------------
// Compose document
// ---------------------------------------------------------------------------

function composeDocument(cst: CstNode, state: ComposerState): YamlDocument {
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
			if (directive) directives.push(directive);
			i++;
			continue;
		}

		// Trivia
		if (child.type === "whitespace" || child.type === "newline") {
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

		// Content
		if (contents !== null) {
			i++;
			continue;
		}

		if (child.type === "flow-scalar" || child.type === "block-scalar") {
			// Check if next meaningful child is a block-map (this scalar is a key)
			const nextContent = findNextContentChild(children, i + 1);
			if (nextContent && nextContent.type === "block-map") {
				// This scalar is the first key of a block mapping
				const key = makeScalar(child, state, hasMeta(meta) ? { ...meta } : undefined);
				clearMeta(meta);
				contents = composeBlockMap(nextContent, state, key);
				i = indexOfChild(children, nextContent) + 1;
				continue;
			}
			// Check if followed by ":" (value-sep) — flat mapping without block-map wrapper
			if (hasValueSepAfter(children, i + 1)) {
				// Compose remaining document children as a flat block map
				const key = makeScalar(child, state, hasMeta(meta) ? { ...meta } : undefined);
				clearMeta(meta);
				contents = composeFlatBlockMap(children, i + 1, cst, state, key);
				break; // consumed all remaining children
			}
			// Standalone scalar — try multi-line plain scalar merging
			if (child.type === "flow-scalar" && getScalarStyle(child) === "plain") {
				const { value, nextIdx } = collectMultilinePlainScalar(children, i);
				const resolved = resolveScalar(value, "plain", meta.tag);
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
			contents = composeBlockSeq(child, state, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			continue;
		}

		if (child.type === "flow-map") {
			contents = composeFlowMap(child, state, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			continue;
		}

		if (child.type === "flow-seq") {
			contents = composeFlowSeq(child, state, hasMeta(meta) ? { ...meta } : undefined);
			clearMeta(meta);
			i++;
			continue;
		}

		if (child.type === "alias") {
			contents = makeAlias(child, state);
			i++;
			continue;
		}

		i++;
	}

	return new YamlDocument({
		contents,
		errors: [...state.errors],
		warnings: [...state.warnings],
		directives,
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
	if (node instanceof YamlScalar) return node.value;
	if (node instanceof YamlMap) {
		const result: Record<string, unknown> = {};
		for (const pair of node.items) {
			const key = pair.key instanceof YamlScalar ? String(pair.key.value ?? "") : "";
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
			const doc = cstNodes[0];
			if (!doc) {
				return Effect.succeed(new YamlDocument({ contents: null, errors: [], warnings: [], directives: [] }));
			}

			const result = composeDocument(doc, state);

			const fatalErrors = state.errors.filter(
				(e) => e.code === "UndefinedAlias" || e.code === "AliasCountExceeded" || e.code === "UnexpectedToken",
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

			for (const cst of cstNodes) {
				const state = createState(text, options);
				const doc = composeDocument(cst, state);
				documents.push(doc);

				const fatal = state.errors.filter(
					(e) => e.code === "UndefinedAlias" || e.code === "AliasCountExceeded" || e.code === "UnexpectedToken",
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
			const anchors = buildAnchorMap(doc.contents);
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
		(e) => e.code === "UndefinedAlias" || e.code === "AliasCountExceeded" || e.code === "UnexpectedToken",
	);
	if (fatalErrors.length > 0) {
		return Effect.fail(new YamlComposerError({ errors: fatalErrors, text }));
	}

	return Effect.succeed(result);
}
