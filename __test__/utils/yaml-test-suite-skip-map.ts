/**
 * Skip and expected-failure maps for the yaml-test-suite.
 *
 * - SKIP: Tests that never run (not applicable to our implementation).
 * - XFAIL: Tests that run but are allowed to fail (known gaps to fix later).
 * - SKIP_ASSERTIONS: Tests where specific assertion types are skipped.
 *
 * Every entry must include a reason string explaining WHY.
 *
 * Generated from first triage run on 2026-03-14.
 * Updated: multi-document harness, block scalar, tagged empty value, anchor name, tab handling, block mapping fixes.
 * Updated: canonical output fixes — comment stripping, inline doc-start scalars, anchor/tag placement, empty scalars.
 * Updated: scalar style preservation, tag placement on root maps, quoting for tagged values.
 * Updated: escape sequences (named C0 escapes, canonical unicode), tag normalization, multi-doc join, tagged block scalars.
 * Updated: single-quoted multi-line render, scalar-rooted single-doc canonical, block→DQ for tricky whitespace.
 * Updated: dual-anchor composer fix (outer/inner meta split), empty seq item anchor preservation, anchored empty key sep.
 * Updated: keep-chomp `...` terminator and chomp preservation, source numeric format preserved (hex, trailing zeros),
 *          tag-on-block-collection (newline-aware), document-level outer/inner meta split.
 * Updated: parser leniency fixes — block-mapping indent validation (DMG6, EW3V, N4JP, U44R),
 *          block-seq in key position (ZVH3), comma-in-tag rejection (U99R), mapping on
 *          document-start line (9KBC, CXX2).
 * Updated: explicit-key syntax for non-scalar/multi-line/block-style scalar keys, compact
 *          inline first-pair for block-map and block-seq values under explicit `?` keys
 *          (5WE3, 6SLA, Q9WF, X38W now pass canonical output).
 * Updated: libyaml conventions — block-folded indent indicator for 2+ leading blank lines
 *          (R4YG), block scalar at root with newline+tab content rendered as DQ via
 *          applySingleDocCanonical (T5N4).
 * Updated: parser/composer fixes — lexer recognises `:` after flow-collection-end as
 *          adjacent value indicator (9MMW), flow-children flatten flushes pending
 *          tag/anchor on `,` separator so it doesn't bleed into the next item (WZ62),
 *          composer flush-to-null only fires when the trailing `:` is on the same
 *          line as the scalar (6M2F).
 * Updated: stringifier canonical-mode fixes — applySingleDocCanonical drops `--- `
 *          for single-line single-quoted scalar root whose content starts with
 *          `---` (EXG3); stringifyDocument emits `...` terminator after an anchored
 *          plain scalar root with explicit `---` so the anchor binds to a definite
 *          node identity (KSS4 doc 2). Remaining 17 canonical-output gaps need
 *          AST source-text capture or a libyaml-faithful canonical emitter — see
 *          .claude/design/yaml-effect/canonical-output-gaps.md.
 */

/** Tests to skip entirely — not applicable to our implementation. */
export const SKIP: Record<string, string> = {};

/** Tests expected to fail at parse level — known gaps to fix later. */
export const XFAIL: Record<string, string> = {};

/**
 * Tests to skip specific assertions for.
 * - "json" — skip JSON output comparison
 * - "output" — skip out.yaml canonical output comparison
 * - "roundtrip" — skip stringify roundtrip comparison
 */
export const SKIP_ASSERTIONS: Record<string, string[]> = {
	"2LFX": ["output"],
	"4ABK": ["output"],
	"4WA9": ["output"],
	"5T43": ["output"],
	"652Z": ["output"],
	"6WLZ": ["output"],
	"9MQT/00": ["output"],
	B3HG: ["output"],
	K54U: ["output"],
	K858: ["output"],
	KK5P: ["output"],
	"M2N8/00": ["output"],
	"M2N8/01": ["output"],
	M5DY: ["output"],
	PUW8: ["output"],
	"VJP3/01": ["output"],
	XLQ9: ["output"],
};
