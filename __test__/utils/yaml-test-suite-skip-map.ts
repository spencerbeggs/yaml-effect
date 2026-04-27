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
 */

/** Tests to skip entirely — not applicable to our implementation. */
export const SKIP: Record<string, string> = {};

/** Tests expected to fail at parse level — known gaps to fix later. */
export const XFAIL: Record<string, string> = {
	// Parser accepts invalid YAML (27)
	"4HVU": "Parser accepts invalid YAML: Wrong indendation in Sequence",
	"4JVG": "Parser accepts invalid YAML: Scalar value with two anchors",
	"5LLU": "Parser accepts invalid YAML: Block scalar with wrong indented line after spaces only",
	"9C9N": "Parser accepts invalid YAML: Wrong indented flow sequence",
	"9KBC": "Parser accepts invalid YAML: Mapping starting at --- line",
	BS4K: "Parser accepts invalid YAML: Comment between plain scalar lines",
	C2SP: "Parser accepts invalid YAML: Flow Mapping Key on two lines",
	CXX2: "Parser accepts invalid YAML: Mapping with anchor on document start line",
	DMG6: "Parser accepts invalid YAML: Wrong indendation in Map",
	EW3V: "Parser accepts invalid YAML: Wrong indendation in mapping",
	G9HC: "Parser accepts invalid YAML: Invalid anchor in zero indented sequence",
	H7J7: "Parser accepts invalid YAML: Node anchor not indented",
	N4JP: "Parser accepts invalid YAML: Bad indentation in mapping",
	QB6E: "Parser accepts invalid YAML: Wrong indented multiline quoted scalar",
	QLJ7: "Parser accepts invalid YAML: Tag shorthand used in documents but only defined in the first",
	S98Z: "Parser accepts invalid YAML: Block scalar with more spaces than first content line",
	SY6V: "Parser accepts invalid YAML: Anchor before sequence entry on same line",
	U44R: "Parser accepts invalid YAML: Bad indentation in mapping (2)",
	U99R: "Parser accepts invalid YAML: Invalid comma in tag",
	"VJP3/00": "Parser accepts invalid YAML: Flow collections over many lines",
	W9L4: "Parser accepts invalid YAML: Literal block scalar with more spaces in first line",
	"Y79Y/009": "Parser accepts invalid YAML: Tab as block indentation after value indicator",
	ZVH3: "Parser accepts invalid YAML: Wrong indented sequence item",
};

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
	"5WE3": ["output"],
	"652Z": ["output"],
	"6BFJ": ["output"],
	"6JWB": ["output"],
	"6M2F": ["output"],
	"6SLA": ["output"],
	"6WLZ": ["output"],
	"735Y": ["output"],
	"9KAX": ["output"],
	"9MMW": ["output"],
	"9MQT/00": ["output"],
	B3HG: ["output"],
	C4HZ: ["output"],
	EXG3: ["output"],
	F8F9: ["output"],
	"JEF9/00": ["output"],
	"JEF9/01": ["output"],
	"JEF9/02": ["output"],
	K54U: ["output"],
	K858: ["output"],
	KK5P: ["output"],
	KSS4: ["output"],
	"M2N8/00": ["output"],
	"M2N8/01": ["output"],
	M5DY: ["output"],
	PUW8: ["output"],
	Q9WF: ["output"],
	R4YG: ["output"],
	T5N4: ["output"],
	UGM3: ["output"],
	"VJP3/01": ["output"],
	WZ62: ["output"],
	X38W: ["output"],
	XLQ9: ["output"],
};
