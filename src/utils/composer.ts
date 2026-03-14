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

function resolvePlainScalar(value: string): unknown {
	if (value === "" || NULL_RE.test(value)) return null;
	if (TRUE_RE.test(value)) return true;
	if (FALSE_RE.test(value)) return false;
	if (OCT_RE.test(value)) return Number.parseInt(value.slice(2), 8);
	if (HEX_RE.test(value)) return Number.parseInt(value.slice(2), 16);
	if (INT_RE.test(value)) return Number.parseInt(value, 10);
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
	if (style === "single-quoted") {
		const inner = node.source.slice(1, -1);
		return inner.replace(/''/g, "'");
	}
	if (style === "double-quoted") return decodeDoubleQuoted(node.source);
	return node.source.trim();
}

function decodeDoubleQuoted(raw: string): string {
	const inner = raw.slice(1, -1);
	let result = "";
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
					result += esc ?? "";
			}
			i++;
		} else if (ch === "\n") {
			result += " ";
			i++;
		} else if (ch === "\r" && inner[i + 1] === "\n") {
			result += " ";
			i += 2;
		} else {
			result += ch;
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
			trailingNewlines.push("");
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
			ch === ":" ||
			ch === "#" ||
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
	buildPairs(items, pairs);

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
				items.push({ kind: "value-sep" });
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
function buildPairs(items: SemanticItem[], pairs: YamlPair[]): void {
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
			i++;
			const valueNode = consumeValueNode(items, i);
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
	buildPairs(items, pairs);

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
	buildPairs(items, pairs);

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
			// Standalone scalar
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
 */
function buildAnchorMap(node: YamlNode | null): Map<string, YamlNode> {
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

function getNodeValue(node: YamlNode | null, anchors?: Map<string, YamlNode>): unknown {
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
 * Parse YAML text containing multiple documents into an array of {@link YamlDocument}.
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
 * Convenience: parse YAML text and return the plain JavaScript value.
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
