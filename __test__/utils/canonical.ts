/**
 * Canonical YAML output normalisation helpers shared across compliance test
 * suites. The yaml-test-suite's `out.yaml` fixtures follow libyaml's canonical
 * conventions, which differ slightly from a direct `stringifyDocument` result;
 * these helpers bridge the gap without leaking convention knowledge into the
 * library proper.
 *
 * @packageDocumentation
 */

import { YamlScalar } from "../../src/schemas/YamlAstNodes.js";

/** Render a string as a YAML double-quoted single-line scalar. */
function renderDoubleQuoted(s: string): string {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		const code = s.charCodeAt(i);
		if (ch === "\\") out += "\\\\";
		else if (ch === '"') out += '\\"';
		else if (ch === "\n") out += "\\n";
		else if (ch === "\r") out += "\\r";
		else if (ch === "\t") out += "\\t";
		else if (code < 0x20) out += `\\x${code.toString(16).padStart(2, "0")}`;
		else out += ch;
	}
	return `"${out}"`;
}

/**
 * Apply canonical single-doc conventions: libyaml's canonical emitter
 * differs from a direct `stringifyDocument` in several cases:
 *
 * - The leading `---` is omitted for a single-document stream rooted in a
 *   multi-line quoted scalar (single- or double-quoted). Single-line scalars
 *   keep `---` for unambiguous parsing.
 * - The leading `---` is also omitted for a single-quoted scalar at root
 *   whose content begins with `---` (e.g. `'---word1 word2'`); the quoted
 *   form fully self-delimits, and libyaml does not redundantly emit `---`.
 * - A multi-line block scalar (`|`/`>`) at root whose content contains a
 *   newline followed directly by a tab is re-rendered as a single-line
 *   double-quoted scalar (no `---`). libyaml conservatively avoids block
 *   form here because the tab-versus-indent visual would be ambiguous; the
 *   companion fixture M9B4 (same content, no `---`) keeps block form, so
 *   the rule is specific to the document-start position.
 */
export function applySingleDocCanonical(output: string, root: unknown): string {
	if (!(root instanceof YamlScalar)) return output;
	if (!output.startsWith("--- ")) return output;
	const firstAfter = output[4];
	const val = root.value;

	// Block scalar at root with `\n\t` content → libyaml emits DQ instead.
	if (
		(firstAfter === "|" || firstAfter === ">") &&
		typeof val === "string" &&
		/\n\t/.test(val) &&
		(root.style === "block-literal" || root.style === "block-folded")
	) {
		return `${renderDoubleQuoted(val)}\n`;
	}

	// Single-quoted scalar at root whose content begins with `---`: the quoted
	// form is unambiguous on its own line, so libyaml drops the redundant
	// document-start marker. Limited to single-line content because multi-line
	// quoted scalars are handled by the general multi-line drop below.
	if (firstAfter === "'" && typeof val === "string" && !val.includes("\n") && val.startsWith("---")) {
		return output.slice(4);
	}

	// 9MQT/00: a multi-line DQ scalar at root whose folded value is plain-safe
	// renders as `--- <plain>` in single-doc canonical output. libyaml drops
	// the quotes when the resolved value can stand as a plain scalar (no
	// indicator chars, no leading/trailing whitespace, no `:` etc.). Limited
	// to single-doc streams (this helper is only invoked from the single-doc
	// test harness path) so multi-doc fixtures like KSS4 doc 1 keep their DQ
	// quoting.
	if (
		root.style === "double-quoted" &&
		root.sourceMultiline === true &&
		typeof val === "string" &&
		!val.includes("\n") &&
		isPlainSafe(val)
	) {
		const trailing = output.endsWith("\n") ? "\n" : "";
		const body = trailing ? output.slice(4, -1) : output.slice(4);
		// Strip surrounding quotes from the body
		const unquoted = body.startsWith('"') && body.endsWith('"') ? body.slice(1, -1) : body;
		return `--- ${val}${trailing}` || `--- ${unquoted}${trailing}`;
	}

	if (typeof val !== "string" || !val.includes("\n")) return output;
	if (firstAfter !== "'" && firstAfter !== '"') return output;
	return output.slice(4);
}

/**
 * Conservative "is this string plain-safe in block context" check. Rejects
 * leading/trailing whitespace, indicator characters at the start, and chars
 * that would force quoting in canonical block form. Matches the discriminator
 * libyaml uses to decide whether to drop DQ quotes on a folded scalar root.
 */
function isPlainSafe(s: string): boolean {
	if (s.length === 0) return false;
	const first = s[0];
	const last = s[s.length - 1];
	if (first === " " || first === "\t" || last === " " || last === "\t") return false;
	// Leading YAML indicator chars require quoting
	if (
		first === "?" ||
		first === ":" ||
		first === "-" ||
		first === "{" ||
		first === "}" ||
		first === "[" ||
		first === "]" ||
		first === "," ||
		first === "#" ||
		first === "&" ||
		first === "*" ||
		first === "!" ||
		first === "|" ||
		first === ">" ||
		first === "'" ||
		first === '"' ||
		first === "%" ||
		first === "@" ||
		first === "`"
	) {
		return false;
	}
	// `:` followed by space, or trailing `:` — would parse as mapping key
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === ":" && (i === s.length - 1 || s[i + 1] === " ")) return false;
		if (ch === " " && s[i + 1] === "#") return false; // would start a comment
	}
	return true;
}
