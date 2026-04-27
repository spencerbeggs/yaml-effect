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

/**
 * Apply canonical single-doc conventions: libyaml's canonical emitter omits
 * the leading `---` for a single-document stream rooted in a quoted multi-line
 * scalar (single- or double-quoted). Block scalars (`|`, `>`) and single-line
 * values retain `---` because the marker is needed for unambiguous parsing.
 */
export function applySingleDocCanonical(output: string, root: unknown): string {
	if (!(root instanceof YamlScalar)) return output;
	if (!output.startsWith("--- ")) return output;
	const val = root.value;
	if (typeof val !== "string" || !val.includes("\n")) return output;
	const firstAfter = output[4];
	if (firstAfter !== "'" && firstAfter !== '"') return output;
	return output.slice(4);
}
