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
 * differs from a direct `stringifyDocument` in two cases:
 *
 * - The leading `---` is omitted for a single-document stream rooted in a
 *   multi-line quoted scalar (single- or double-quoted). Block scalars and
 *   single-line values retain `---` because the marker is needed for
 *   unambiguous parsing.
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
	if (typeof val !== "string" || !val.includes("\n")) return output;
	if (firstAfter !== "'" && firstAfter !== '"') return output;
	return output.slice(4);
}
