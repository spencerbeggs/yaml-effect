/**
 * YAML Stringifier — converts JavaScript values and AST nodes to YAML text.
 *
 * Implements configurable formatting with support for block/flow styles,
 * scalar quoting rules, and round-trip preservation of AST node styles.
 *
 * @packageDocumentation
 */

import { Effect } from "effect";
import { YamlStringifyError } from "../errors/YamlStringifyError.js";
import type { YamlNode } from "../schemas/YamlAstNodes.js";
import { YamlAlias, YamlMap, YamlPair, YamlScalar, YamlSeq } from "../schemas/YamlAstNodes.js";
import type { YamlDocument } from "../schemas/YamlDocument.js";
import type { CollectionStyle, ScalarStyle } from "../schemas/YamlShared.js";
import { YamlStringifyOptions } from "../schemas/YamlStringifyOptions.js";

// ---------------------------------------------------------------------------
// YAML 1.2 type-conflict detection
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
 * C0 control characters (except TAB) that must be escaped in double-quoted scalars.
 */
function isControlChar(code: number): boolean {
	return (code >= 0x00 && code <= 0x08) || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f);
}

/**
 * YAML indicator characters that require quoting when appearing in plain scalars.
 */
const INDICATOR_CHARS = new Set([
	":",
	"#",
	"{",
	"}",
	"[",
	"]",
	",",
	"&",
	"*",
	"?",
	"|",
	"-",
	"<",
	">",
	"=",
	"!",
	"%",
	"@",
	"`",
]);

/**
 * Returns true if a string value would be mis-resolved as a non-string YAML type.
 *
 * @privateRemarks
 * Tests against all YAML 1.2 Core Schema type patterns (null, bool, int, float,
 * inf, nan). Any string matching these patterns must be quoted to preserve its
 * string identity during a parse round-trip.
 */
function wouldBeResolved(s: string): boolean {
	if (s === "") return true;
	if (NULL_RE.test(s)) return true;
	if (TRUE_RE.test(s)) return true;
	if (FALSE_RE.test(s)) return true;
	if (OCT_RE.test(s)) return true;
	if (HEX_RE.test(s)) return true;
	if (INT_RE.test(s)) return true;
	if (INF_RE.test(s)) return true;
	if (NAN_RE.test(s)) return true;
	if (FLOAT_RE.test(s)) return true;
	return false;
}

/**
 * Returns true if a string requires quoting to be safely represented as a plain scalar.
 *
 * @privateRemarks
 * Checks multiple conditions beyond type-conflict detection: empty strings,
 * embedded newlines, leading indicator characters or whitespace, and inline
 * comment/mapping-value patterns (`: `, ` #`). This is the single gate that
 * decides whether a plain scalar is safe or must be wrapped in quotes.
 */
function requiresQuoting(s: string): boolean {
	// Empty string must be quoted
	if (s === "") return true;
	// Contains newlines — use block literal instead
	if (s.includes("\n")) return true;
	// Would be resolved as a non-string type
	if (wouldBeResolved(s)) return true;
	// Starts with whitespace (space/tab)
	const first = s[0];
	if (first === " " || first === "\t") return true;
	// Check leading indicator characters
	if (first !== undefined && INDICATOR_CHARS.has(first)) {
		// ':', '?', '-' only require quoting when followed by whitespace or at end of string
		if (first === ":" || first === "?" || first === "-") {
			const second = s[1];
			if (s.length === 1 || second === " " || second === "\t") return true;
			// Otherwise these are safe as plain scalars (e.g., :foo, ?bar, -baz)
		} else {
			// All other indicator chars (#, {, }, [, ], etc.) always require quoting at start
			return true;
		}
	}
	// Starts with document marker prefix (--- or ...) — ambiguous at line start
	if (s.startsWith("---") || s.startsWith("...")) return true;
	// Contains ': ' (mapping value indicator with space) or ' #' (comment indicator)
	if (s.includes(": ") || s.endsWith(":")) return true;
	if (s.includes(" #")) return true;
	// C0 control characters (except tab) require quoting
	for (let i = 0; i < s.length; i++) {
		if (isControlChar(s.charCodeAt(i))) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Scalar rendering
// ---------------------------------------------------------------------------

/**
 * Renders a string scalar using double-quote style.
 */
function renderDoubleQuoted(s: string): string {
	let escaped = s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
	let result = "";
	for (let i = 0; i < escaped.length; i++) {
		const code = escaped.charCodeAt(i);
		if (isControlChar(code)) {
			result += `\\x${code.toString(16).padStart(2, "0")}`;
		} else {
			result += escaped[i];
		}
	}
	escaped = result;
	return `"${escaped}"`;
}

/**
 * Renders a string scalar using single-quote style.
 */
function renderSingleQuoted(s: string): string {
	return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Renders a string scalar using block literal style (pipe `|`).
 */
function renderBlockLiteral(s: string, indent: string): string {
	// Determine chomp indicator
	let chomp = "";
	if (s.endsWith("\n\n")) {
		chomp = "+";
	} else if (!s.endsWith("\n")) {
		chomp = "-";
	}
	const lines = s.split("\n");
	// If the string ends with \n, the last element is empty — drop it for rendering
	if (s.endsWith("\n")) {
		lines.pop();
	}
	return `|${chomp}\n${lines.map((l) => (l === "" ? "" : `${indent}${l}`)).join("\n")}`;
}

/**
 * Renders a string scalar using block folded style (greater-than `>`).
 */
function renderBlockFolded(s: string, indent: string): string {
	let chomp = "";
	if (s.endsWith("\n\n")) {
		chomp = "+";
	} else if (!s.endsWith("\n")) {
		chomp = "-";
	}
	const lines = s.split("\n");
	if (s.endsWith("\n")) {
		lines.pop();
	}
	return `>${chomp}\n${lines.map((l) => (l === "" ? "" : `${indent}${l}`)).join("\n")}`;
}

/**
 * Renders a string value as a YAML scalar using the requested style.
 * Falls back to double-quoted if the requested style is unsafe for the value.
 *
 * @privateRemarks
 * Multi-line strings are routed to block styles regardless of the requested
 * style (except double-quoted). For single-line strings, plain style delegates
 * to {@link requiresQuoting} and falls back to double-quoted when the value
 * would be ambiguous. Block literal and block folded styles are always
 * accepted for single-line strings even though the output is unusual.
 */
function renderString(s: string, style: ScalarStyle, indent: string): string {
	if (s.includes("\n")) {
		// Multi-line: prefer block styles
		if (style === "block-literal") return renderBlockLiteral(s, indent);
		if (style === "block-folded") return renderBlockFolded(s, indent);
		// Fall back to block-literal for multiline with other styles
		if (style === "plain" || style === "single-quoted") return renderBlockLiteral(s, indent);
		return renderDoubleQuoted(s);
	}
	switch (style) {
		case "plain":
			if (requiresQuoting(s)) {
				// Prefer single-quoted when no escape sequences are needed.
				// Only use double-quoted for chars that need YAML escapes
				// (tab, CR, control chars). Backslashes are literal in
				// single-quoted YAML and do NOT need double-quoting.
				if (s.includes("\t") || s.includes("\r")) {
					return renderDoubleQuoted(s);
				}
				for (let i = 0; i < s.length; i++) {
					if (isControlChar(s.charCodeAt(i))) return renderDoubleQuoted(s);
				}
				return renderSingleQuoted(s);
			}
			return s;
		case "single-quoted":
			return renderSingleQuoted(s);
		case "double-quoted":
			return renderDoubleQuoted(s);
		case "block-literal":
			return renderBlockLiteral(s, indent);
		case "block-folded":
			return renderBlockFolded(s, indent);
	}
}

// ---------------------------------------------------------------------------
// Number rendering
// ---------------------------------------------------------------------------

/**
 * Renders a number value as a YAML scalar string.
 *
 * @privateRemarks
 * Maps JavaScript special number values to their YAML 1.2 Core Schema
 * equivalents: `NaN` becomes `.nan`, positive infinity becomes `.inf`,
 * and negative infinity becomes `-.inf`. All other numbers use
 * `String(n)` which produces valid YAML integer or float literals.
 */
function renderNumber(n: number): string {
	if (Number.isNaN(n)) return ".nan";
	if (n === Number.POSITIVE_INFINITY) return ".inf";
	if (n === Number.NEGATIVE_INFINITY) return "-.inf";
	return String(n);
}

// ---------------------------------------------------------------------------
// Circular reference detection
// ---------------------------------------------------------------------------

/**
 * Detects circular references by tracking the object ancestor chain.
 */
function detectCircular(value: unknown, seen: Set<object>): void {
	if (value !== null && typeof value === "object") {
		if (seen.has(value)) {
			throw new Error("Circular reference detected");
		}
	}
}

// ---------------------------------------------------------------------------
// Core stringification
// ---------------------------------------------------------------------------

interface StringifyContext {
	indent: number;
	lineWidth: number;
	defaultScalarStyle: ScalarStyle;
	defaultCollectionStyle: CollectionStyle;
	sortKeys: boolean;
	forceDefaultStyles: boolean;
	seen: Set<object>;
}

/**
 * Recursively stringifies a JavaScript value into YAML lines.
 *
 * Returns an array of lines with NO leading indentation — the caller is
 * responsible for prepending the appropriate indentation prefix to each line.
 * This avoids double-indentation when embedding nested collections.
 */
function stringifyLines(value: unknown, ctx: StringifyContext): string[] {
	// null / undefined
	if (value === null || value === undefined) return ["null"];

	// boolean
	if (typeof value === "boolean") return [value ? "true" : "false"];

	// number
	if (typeof value === "number") return [renderNumber(value)];

	// bigint — produced by safeParseInt for values exceeding MAX_SAFE_INTEGER
	if (typeof value === "bigint") return [value.toString()];

	// string
	if (typeof value === "string") {
		// For block scalars the header line and body lines are already split
		const rendered = renderString(value, ctx.defaultScalarStyle, " ".repeat(ctx.indent));
		return rendered.split("\n");
	}

	// array
	if (Array.isArray(value)) {
		detectCircular(value, ctx.seen);
		ctx.seen.add(value as object);
		try {
			return stringifyArrayLines(value, ctx);
		} finally {
			ctx.seen.delete(value as object);
		}
	}

	// object (plain object / record)
	if (typeof value === "object" && value !== null) {
		detectCircular(value, ctx.seen);
		ctx.seen.add(value as object);
		try {
			return stringifyObjectLines(value as Record<string, unknown>, ctx);
		} finally {
			ctx.seen.delete(value as object);
		}
	}

	// Fallback: coerce to string and quote
	return [renderDoubleQuoted(String(value))];
}

/**
 * Stringifies a JavaScript value into a single YAML string (for scalars and
 * flow collections) or a multi-line string (for block collections).
 * Used as the public-facing helper; callers at depth=0 use this.
 */
function stringifyValue(value: unknown, ctx: StringifyContext): string {
	return stringifyLines(value, ctx).join("\n");
}

/**
 * Stringifies a JavaScript array into YAML sequence lines (no leading indent).
 */
function stringifyArrayLines(arr: unknown[], ctx: StringifyContext): string[] {
	if (arr.length === 0) {
		return ["[]"];
	}

	if (ctx.defaultCollectionStyle === "flow") {
		const items = arr.map((item) => stringifyLines(item, ctx).join(" "));
		return [`[${items.join(", ")}]`];
	}

	// Block style — each item rendered relative to depth 0
	const pad = " ".repeat(ctx.indent);
	const lines: string[] = [];
	for (const item of arr) {
		const itemLines = stringifyLines(item, ctx);
		if (itemLines.length === 1) {
			lines.push(`- ${itemLines[0]}`);
		} else {
			// First line of a block scalar goes on the same line as `-`
			const first = itemLines[0];
			if (first.startsWith("|") || first.startsWith(">")) {
				lines.push(`- ${first}`);
				for (let i = 1; i < itemLines.length; i++) {
					lines.push(itemLines[i]);
				}
			} else {
				// Nested mapping or sequence — indent continuation lines by one level
				lines.push(`- ${itemLines[0]}`);
				for (let i = 1; i < itemLines.length; i++) {
					lines.push(`${pad}${itemLines[i]}`);
				}
			}
		}
	}
	return lines;
}

/**
 * Returns true when a value is a non-empty block collection (object or array
 * with block style). Such values must never be placed inline after a key colon
 * in a block mapping — they must always start on the next line.
 */
function isBlockCollection(value: unknown, ctx: StringifyContext): boolean {
	if (ctx.defaultCollectionStyle === "flow") return false;
	if (Array.isArray(value) && value.length > 0) return true;
	if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0)
		return true;
	return false;
}

/**
 * Stringifies a JavaScript object into YAML mapping lines (no leading indent).
 */
function stringifyObjectLines(obj: Record<string, unknown>, ctx: StringifyContext): string[] {
	const keys = Object.keys(obj);
	if (keys.length === 0) {
		return ["{}"];
	}

	if (ctx.sortKeys) {
		keys.sort();
	}

	if (ctx.defaultCollectionStyle === "flow") {
		const pairs = keys.map((k) => {
			const keyStr = renderString(k, "plain", "");
			const valStr = stringifyLines(obj[k], ctx).join(" ");
			return `${keyStr}: ${valStr}`;
		});
		return [`{${pairs.join(", ")}}`];
	}

	// Block style
	const pad = " ".repeat(ctx.indent);
	const lines: string[] = [];
	for (const k of keys) {
		const keyStr = renderString(k, "plain", "");
		const val = obj[k];
		const valLines = stringifyLines(val, ctx);

		if (valLines.length === 1 && !isBlockCollection(val, ctx)) {
			// Scalar or empty/flow collection — safe to place inline
			lines.push(`${keyStr}: ${valLines[0]}`);
		} else {
			const first = valLines[0];
			if (first.startsWith("|") || first.startsWith(">")) {
				// Block scalar header on same line as key
				lines.push(`${keyStr}: ${first}`);
				for (let i = 1; i < valLines.length; i++) {
					lines.push(valLines[i]);
				}
			} else if (Array.isArray(val) && val.length > 0) {
				// Block sequence as mapping value: compact notation (no extra indent)
				lines.push(`${keyStr}:`);
				for (const vl of valLines) {
					lines.push(vl);
				}
			} else {
				// Nested block mapping: key on its own line, value indented
				lines.push(`${keyStr}:`);
				for (const vl of valLines) {
					lines.push(`${pad}${vl}`);
				}
			}
		}
	}
	return lines;
}

// ---------------------------------------------------------------------------
// Comment stripping (for canonical output)
// ---------------------------------------------------------------------------

/**
 * Recursively strips all comment fields from AST nodes.
 * Used when forceDefaultStyles is true to produce canonical output.
 */
export function stripNodeComments(node: YamlNode): YamlNode {
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
	return node;
}

// ---------------------------------------------------------------------------
// AST node stringification
// ---------------------------------------------------------------------------

/**
 * Stringifies a YAML AST node into lines (no leading indent), respecting
 * style metadata from the node.
 */
function stringifyNodeLines(node: YamlNode, ctx: StringifyContext): string[] {
	if (node instanceof YamlScalar) {
		return stringifyScalarNodeLines(node, ctx);
	}
	if (node instanceof YamlMap) {
		return stringifyMapNodeLines(node, ctx);
	}
	if (node instanceof YamlSeq) {
		return stringifySeqNodeLines(node, ctx);
	}
	if (node instanceof YamlAlias) {
		return [`*${node.name}`];
	}
	return ["null"];
}

/**
 * Stringifies a YamlScalar node into lines, using the node's style metadata.
 */
function stringifyScalarNodeLines(node: InstanceType<typeof YamlScalar>, ctx: StringifyContext): string[] {
	// When forcing default styles, preserve the node's original style for multiline
	// strings (block-literal vs block-folded vs double-quoted) since the canonical
	// output retains scalar presentation style even in normalized form.
	const nodeStyle = node.style ?? ctx.defaultScalarStyle;
	// When forcing default styles, preserve block scalar sub-styles
	// (block-literal, block-folded) since the canonical output retains
	// scalar presentation style even in normalized form. Also preserve
	// double-quoted style when the value contains characters that would
	// render differently (newlines produce escape sequences in double-quoted).
	const isBlockStyle = nodeStyle === "block-literal" || nodeStyle === "block-folded";
	const isDoubleWithNewlines =
		nodeStyle === "double-quoted" && typeof node.value === "string" && node.value.includes("\n");
	const style: ScalarStyle =
		ctx.forceDefaultStyles && typeof node.value === "string" && (isBlockStyle || isDoubleWithNewlines)
			? nodeStyle
			: ctx.forceDefaultStyles
				? ctx.defaultScalarStyle
				: nodeStyle;
	const val = node.value;

	// Empty scalar (zero-length in source) with tag or anchor: render just tag/anchor
	const isEmpty = node.length === 0 && (val === null || val === undefined || val === "");
	if (isEmpty && (node.tag || node.anchor)) {
		const parts: string[] = [];
		if (node.tag) parts.push(node.tag);
		if (node.anchor) parts.push(`&${node.anchor}`);
		return [parts.join(" ")];
	}

	let lines: string[];
	if (val === null || val === undefined) {
		// Empty scalar (zero-length) without tag/anchor renders as empty string
		if (isEmpty) {
			lines = [""];
		} else {
			lines = ["null"];
		}
	} else if (typeof val === "boolean") {
		lines = [val ? "true" : "false"];
	} else if (typeof val === "number") {
		lines = [renderNumber(val)];
	} else if (typeof val === "string") {
		const rendered = renderString(val, style, " ".repeat(ctx.indent));
		lines = rendered.split("\n");
	} else {
		lines = [renderDoubleQuoted(String(val))];
	}
	// Prepend tag first, then anchor, so the final output reads &anchor !!tag value
	if (node.tag) {
		lines[0] = `${node.tag} ${lines[0]}`;
	}
	if (node.anchor) {
		lines[0] = `&${node.anchor} ${lines[0]}`;
	}
	return lines;
}

/**
 * Stringifies a YamlMap node into lines, using the node's collection style.
 */
function stringifyMapNodeLines(node: InstanceType<typeof YamlMap>, ctx: StringifyContext): string[] {
	const style: CollectionStyle = ctx.forceDefaultStyles
		? ctx.defaultCollectionStyle
		: (node.style ?? ctx.defaultCollectionStyle);
	let items = [...node.items];
	if (ctx.sortKeys) {
		items = items.sort((a, b) => {
			const ka = a.key instanceof YamlScalar ? String(a.key.value) : "";
			const kb = b.key instanceof YamlScalar ? String(b.key.value) : "";
			return ka < kb ? -1 : ka > kb ? 1 : 0;
		});
	}

	if (items.length === 0) {
		let line = "{}";
		const emptyPrefix = buildMetadataPrefix(node.tag, node.anchor);
		if (emptyPrefix) line = `${emptyPrefix} ${line}`;
		return [line];
	}

	if (style === "flow") {
		const pairs = items.map((pair) => {
			const keyStr = pair.key ? stringifyNodeLines(pair.key, ctx).join(" ") : "null";
			const valStr = pair.value ? stringifyNodeLines(pair.value, ctx).join(" ") : "null";
			return `${keyStr}: ${valStr}`;
		});
		let line = `{${pairs.join(", ")}}`;
		const flowPrefix = buildMetadataPrefix(node.tag, node.anchor);
		if (flowPrefix) line = `${flowPrefix} ${line}`;
		return [line];
	}

	// Block style
	const pad = " ".repeat(ctx.indent);
	const lines: string[] = [];
	for (const pair of items) {
		const keyStr = pair.key ? stringifyNodeLines(pair.key, ctx).join(" ") : "null";
		// Alias keys need space before colon to avoid ambiguity (e.g., `*a :` not `*a:`)
		const sep = pair.key instanceof YamlAlias ? " :" : ":";
		const valNode = pair.value;
		if (!valNode) {
			lines.push(`${keyStr}${sep}`);
			continue;
		}
		const valLines = stringifyNodeLines(valNode, ctx);
		const isBlockSeqValue =
			valNode instanceof YamlSeq &&
			valNode.items.length > 0 &&
			(ctx.forceDefaultStyles ? ctx.defaultCollectionStyle : (valNode.style ?? ctx.defaultCollectionStyle)) === "block";
		if (isBlockSeqValue) {
			// Block sequence as mapping value: compact notation (no extra indent)
			// If seq has metadata (anchor/tag), place it on the key line
			const seqMeta = buildMetadataPrefix(valNode.tag, valNode.anchor);
			const startIdx = seqMeta ? 1 : 0; // skip metadata line if present
			lines.push(seqMeta ? `${keyStr}${sep} ${seqMeta}` : `${keyStr}${sep}`);
			for (let i = startIdx; i < valLines.length; i++) {
				lines.push(valLines[i]);
			}
		} else if (
			valNode instanceof YamlMap &&
			valNode.items.length > 0 &&
			(ctx.forceDefaultStyles ? ctx.defaultCollectionStyle : (valNode.style ?? ctx.defaultCollectionStyle)) === "block"
		) {
			// Non-empty block mapping as value: put on next line with indent
			const mapMeta = buildMetadataPrefix(valNode.tag, valNode.anchor);
			const startIdx = mapMeta ? 1 : 0;
			lines.push(mapMeta ? `${keyStr}${sep} ${mapMeta}` : `${keyStr}${sep}`);
			for (let i = startIdx; i < valLines.length; i++) {
				lines.push(`${pad}${valLines[i]}`);
			}
		} else if (valLines.length === 1) {
			// Empty value: `key:` with no trailing space
			lines.push(valLines[0] === "" ? `${keyStr}${sep}` : `${keyStr}${sep} ${valLines[0]}`);
		} else {
			const first = valLines[0];
			if (first.startsWith("|") || first.startsWith(">")) {
				lines.push(`${keyStr}${sep} ${first}`);
				for (let i = 1; i < valLines.length; i++) {
					lines.push(valLines[i]);
				}
			} else {
				// Check if this is a block map value with metadata prefix
				const isBlockMapValue =
					valNode instanceof YamlMap &&
					(ctx.forceDefaultStyles ? ctx.defaultCollectionStyle : (valNode.style ?? ctx.defaultCollectionStyle)) ===
						"block";
				const mapMeta = isBlockMapValue ? buildMetadataPrefix(valNode.tag, valNode.anchor) : undefined;
				if (mapMeta) {
					// Place metadata on key line, skip metadata line in valLines
					lines.push(`${keyStr}${sep} ${mapMeta}`);
					for (let i = 1; i < valLines.length; i++) {
						lines.push(`${pad}${valLines[i]}`);
					}
				} else {
					lines.push(`${keyStr}${sep}`);
					for (const vl of valLines) {
						lines.push(`${pad}${vl}`);
					}
				}
			}
		}
	}
	// Anchor/tag on block collections: place on own line before content
	const prefix = buildMetadataPrefix(node.tag, node.anchor);
	if (prefix) {
		lines.unshift(prefix);
	}
	return lines;
}

/**
 * Builds a metadata prefix string from tag and anchor.
 * Returns the combined prefix or undefined if neither is present.
 */
function buildMetadataPrefix(tag: string | undefined, anchor: string | undefined): string | undefined {
	if (!tag && !anchor) return undefined;
	// Canonical ordering: &anchor !!tag (anchor before tag)
	const parts: string[] = [];
	if (anchor) parts.push(`&${anchor}`);
	if (tag) parts.push(tag);
	return parts.join(" ");
}

/**
 * Stringifies a YamlSeq node into lines, using the node's collection style.
 */
function stringifySeqNodeLines(node: InstanceType<typeof YamlSeq>, ctx: StringifyContext): string[] {
	const style: CollectionStyle = ctx.forceDefaultStyles
		? ctx.defaultCollectionStyle
		: (node.style ?? ctx.defaultCollectionStyle);
	const items = [...node.items];

	if (items.length === 0) {
		let line = "[]";
		const emptyPrefix = buildMetadataPrefix(node.tag, node.anchor);
		if (emptyPrefix) line = `${emptyPrefix} ${line}`;
		return [line];
	}

	if (style === "flow") {
		const parts = items.map((item) => stringifyNodeLines(item, ctx).join(" "));
		let line = `[${parts.join(", ")}]`;
		const flowPrefix = buildMetadataPrefix(node.tag, node.anchor);
		if (flowPrefix) line = `${flowPrefix} ${line}`;
		return [line];
	}

	// Block style
	const pad = " ".repeat(ctx.indent);
	const lines: string[] = [];
	for (const item of items) {
		const itemLines = stringifyNodeLines(item, ctx);
		if (itemLines.length === 1) {
			// Empty value: just `-` with no trailing space
			lines.push(itemLines[0] === "" ? "-" : `- ${itemLines[0]}`);
		} else {
			const first = itemLines[0];
			if (first.startsWith("|") || first.startsWith(">")) {
				lines.push(`- ${first}`);
				for (let i = 1; i < itemLines.length; i++) {
					lines.push(itemLines[i]);
				}
			} else {
				// Nested mapping or sequence — indent continuation lines by one level
				lines.push(first === "" ? "-" : `- ${first}`);
				for (let i = 1; i < itemLines.length; i++) {
					lines.push(`${pad}${itemLines[i]}`);
				}
			}
		}
	}
	// Anchor/tag on block sequences: place on own line before content
	const prefix = buildMetadataPrefix(node.tag, node.anchor);
	if (prefix) {
		lines.unshift(prefix);
	}
	return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a JavaScript value into a YAML text string.
 *
 * @remarks
 * Handles all primitive types, arrays, and plain objects. Special numbers
 * (`Infinity`, `-Infinity`, `NaN`) are rendered as `.inf`, `-.inf`, and
 * `.nan` respectively. Circular references cause a {@link YamlStringifyError}.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { stringify } from "yaml-effect";
 *
 * const data = { name: "Alice", tags: ["admin", "user"], active: true };
 *
 * const program = stringify(data).pipe(
 *   Effect.tap((yaml) => Effect.log(yaml)),
 * );
 *
 * Effect.runPromise(program);
 * // name: Alice
 * // tags:
 * //   - admin
 * //   - user
 * // active: true
 * ```
 *
 * @example Customizing output format
 * ```typescript
 * import { Effect } from "effect";
 * import { stringify } from "yaml-effect";
 *
 * const program = stringify({ key: "value" }, {
 *   indent: 4,
 *   defaultCollectionStyle: "flow",
 *   finalNewline: false,
 * }).pipe(Effect.tap((yaml) => Effect.log(yaml)));
 *
 * Effect.runPromise(program);
 * // {key: value}
 * ```
 *
 * @param value - The value to stringify.
 * @param options - Optional formatting options. Defaults are used for any
 *   omitted fields.
 * @returns An `Effect` that resolves to the YAML text string.
 *
 * @public
 */
export function stringify(
	value: unknown,
	options?: YamlStringifyOptions | Partial<ConstructorParameters<typeof YamlStringifyOptions>[0]>,
): Effect.Effect<string, YamlStringifyError> {
	return Effect.try({
		try: () => {
			const opts = options instanceof YamlStringifyOptions ? options : new YamlStringifyOptions(options ?? {});
			const ctx: StringifyContext = {
				indent: opts.indent,
				lineWidth: opts.lineWidth,
				defaultScalarStyle: opts.defaultScalarStyle,
				defaultCollectionStyle: opts.defaultCollectionStyle,
				sortKeys: opts.sortKeys,
				forceDefaultStyles: opts.forceDefaultStyles,
				seen: new Set(),
			};
			const result = stringifyValue(value, ctx);
			return opts.finalNewline ? `${result}\n` : result;
		},
		catch: (err) => {
			const reason = err instanceof Error ? err.message : String(err);
			return new YamlStringifyError({ value, reason });
		},
	});
}

/**
 * Converts a {@link YamlDocument} AST into a YAML text string, preserving
 * the style metadata encoded in each AST node.
 *
 * @remarks
 * Scalar nodes use their `style` field (`"plain"`, `"single-quoted"`,
 * `"double-quoted"`, `"block-literal"`, `"block-folded"`) to control
 * rendering. Collection nodes use their `style` field (`"block"` or
 * `"flow"`). Nodes without an explicit style fall back to the defaults in
 * `options`.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { parseDocument } from "yaml-effect";
 * import { stringifyDocument } from "yaml-effect";
 *
 * const program = parseDocument("name: Alice\nage: 30").pipe(
 *   Effect.flatMap((doc) => stringifyDocument(doc)),
 *   Effect.tap((yaml) => Effect.log(yaml)),
 * );
 *
 * Effect.runPromise(program);
 * // name: Alice
 * // age: 30
 * ```
 *
 * @param doc - The parsed YAML document whose AST to serialize.
 * @param options - Optional formatting options.
 * @returns An `Effect` that resolves to the YAML text string.
 *
 * @public
 */
export function stringifyDocument(
	doc: YamlDocument,
	options?: YamlStringifyOptions | Partial<ConstructorParameters<typeof YamlStringifyOptions>[0]>,
): Effect.Effect<string, YamlStringifyError> {
	return Effect.try({
		try: () => {
			const opts = options instanceof YamlStringifyOptions ? options : new YamlStringifyOptions(options ?? {});
			const ctx: StringifyContext = {
				indent: opts.indent,
				lineWidth: opts.lineWidth,
				defaultScalarStyle: opts.defaultScalarStyle,
				defaultCollectionStyle: opts.defaultCollectionStyle,
				sortKeys: opts.sortKeys,
				forceDefaultStyles: opts.forceDefaultStyles,
				seen: new Set(),
			};

			// Strip comments when producing canonical output
			let contents = doc.contents;
			const docComment = ctx.forceDefaultStyles ? undefined : doc.comment;
			if (ctx.forceDefaultStyles && contents) {
				contents = stripNodeComments(contents);
			}

			if (contents === null) {
				// Empty document (no contents) — canonical output is empty string
				if (ctx.forceDefaultStyles) return "";
				return opts.finalNewline ? "null\n" : "null";
			}

			const result = stringifyNodeLines(contents, ctx).join("\n");
			const body = opts.finalNewline ? `${result}\n` : result;

			const docEnd = doc.hasDocumentEnd ? "...\n" : "";

			if (doc.hasDocumentStart) {
				const rootTag = contents && "tag" in contents ? contents.tag : undefined;
				const rootAnchor = contents && "anchor" in contents ? contents.anchor : undefined;
				const isCollection = contents instanceof YamlMap || contents instanceof YamlSeq;
				const isScalar = contents instanceof YamlScalar;

				if (rootTag || rootAnchor) {
					// Build metadata prefix — canonical ordering: &anchor !!tag
					const metaParts: string[] = [];
					if (rootAnchor) metaParts.push(`&${rootAnchor}`);
					if (rootTag) metaParts.push(rootTag);
					const metaStr = metaParts.join(" ");

					// Strip tag/anchor prefix from body (already prepended by stringifyNodeLines)
					let bodyClean = body;
					// For block collections, the metadata is on its own line
					const metaLinePrefix = `${metaStr}\n`;
					const metaInlinePrefix = `${metaStr} `;
					if (bodyClean.startsWith(metaLinePrefix)) {
						bodyClean = bodyClean.slice(metaLinePrefix.length);
					} else if (bodyClean.startsWith(metaInlinePrefix)) {
						bodyClean = bodyClean.slice(metaInlinePrefix.length);
					}

					const docStart = `--- ${metaStr}`;
					const sep = isCollection ? "\n" : " ";
					return docComment
						? `# ${docComment}\n${docStart}${sep}${bodyClean}${docEnd}`
						: `${docStart}${sep}${bodyClean}${docEnd}`;
				}

				// No tag/anchor — inline scalars after ---
				if (isScalar) {
					return docComment ? `# ${docComment}\n--- ${body}${docEnd}` : `--- ${body}${docEnd}`;
				}
				return docComment ? `# ${docComment}\n---\n${body}${docEnd}` : `---\n${body}${docEnd}`;
			}
			return docComment ? `# ${docComment}\n${body}${docEnd}` : `${body}${docEnd}`;
		},
		catch: (err) => {
			const reason = err instanceof Error ? err.message : String(err);
			return new YamlStringifyError({ value: doc, reason });
		},
	});
}
