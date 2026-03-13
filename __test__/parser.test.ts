/**
 * Tests for the YAML CST parser.
 *
 * @packageDocumentation
 */

import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import type { CstNode } from "../src/schemas/CstNode.js";
import { parseCST, parseCSTAll } from "../src/utils/parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(text: string): CstNode[] {
	return Effect.runSync(parseCSTAll(text));
}

/** Find a node (or nested child) by type. */
function findByType(nodes: readonly CstNode[], type: string): CstNode | undefined {
	for (const node of nodes) {
		if (node.type === type) return node;
		if (node.children) {
			const found = findByType(node.children, type);
			if (found) return found;
		}
	}
	return undefined;
}

/** Find all nodes (or nested children) by type. */
function findAllByType(nodes: readonly CstNode[], type: string): CstNode[] {
	const result: CstNode[] = [];
	for (const node of nodes) {
		if (node.type === type) result.push(node);
		if (node.children) {
			result.push(...findAllByType(node.children, type));
		}
	}
	return result;
}

// ===========================================================================
// Task 12: Block structures
// ===========================================================================

describe("Task 12: Block structures", () => {
	describe("simple key-value mapping", () => {
		it("parses a: 1 into a document with block-map", () => {
			const nodes = parse("a: 1");
			expect(nodes).toHaveLength(1);
			expect(nodes[0].type).toBe("document");
			const blockMap = findByType(nodes, "block-map");
			expect(blockMap).toBeDefined();
			expect(blockMap?.type).toBe("block-map");
		});

		it("preserves source text in document node", () => {
			const text = "a: 1";
			const nodes = parse(text);
			expect(nodes[0].source).toBe(text);
		});

		it("parses multiple key-value pairs", () => {
			const text = "a: 1\nb: 2";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const blockMap = findByType(nodes, "block-map");
			expect(blockMap).toBeDefined();
		});
	});

	describe("nested mapping", () => {
		it("parses a nested mapping a:\\n  b: 1", () => {
			const text = "a:\n  b: 1";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const maps = findAllByType(nodes, "block-map");
			// Should have at least 2 block-maps: outer and inner
			expect(maps.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("simple sequence", () => {
		it("parses - a\\n- b into a document with block-seq", () => {
			const text = "- a\n- b";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			expect(nodes[0].type).toBe("document");
			const blockSeq = findByType(nodes, "block-seq");
			expect(blockSeq).toBeDefined();
		});
	});

	describe("map with sequence value", () => {
		it("parses items:\\n  - a\\n  - b", () => {
			const text = "items:\n  - a\n  - b";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const blockMap = findByType(nodes, "block-map");
			expect(blockMap).toBeDefined();
			const blockSeq = findByType(nodes, "block-seq");
			expect(blockSeq).toBeDefined();
		});
	});

	describe("sequence of mappings", () => {
		it("parses - a: 1\\n- b: 2", () => {
			const text = "- a: 1\n- b: 2";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const blockSeq = findByType(nodes, "block-seq");
			expect(blockSeq).toBeDefined();
			const maps = findAllByType(nodes, "block-map");
			expect(maps.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("empty document", () => {
		it("parses empty string into an empty document", () => {
			const nodes = parse("");
			expect(nodes).toHaveLength(1);
			expect(nodes[0].type).toBe("document");
			expect(nodes[0].source).toBe("");
		});
	});

	describe("document with --- marker", () => {
		it("parses ---\\na: 1", () => {
			const text = "---\na: 1";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			expect(nodes[0].type).toBe("document");
			expect(nodes[0].source).toBe(text);
		});
	});

	describe("source fidelity", () => {
		it("preserves all whitespace and comments in CST", () => {
			const text = "a: 1 # comment\nb: 2";
			const nodes = parse(text);
			expect(nodes[0].source).toBe(text);
			const comment = findByType(nodes, "comment");
			expect(comment).toBeDefined();
			expect(comment?.source).toBe("# comment");
		});

		it("preserves newlines in CST", () => {
			const text = "a: 1\nb: 2\n";
			const nodes = parse(text);
			expect(nodes[0].source).toBe(text);
		});
	});

	describe("streaming API", () => {
		it("parseCST returns a Stream of CstNode", () => {
			const text = "a: 1";
			const stream = parseCST(text);
			const result = Effect.runSync(Stream.runCollect(stream));
			expect([...result]).toHaveLength(1);
			expect([...result][0].type).toBe("document");
		});
	});
});

// ===========================================================================
// Task 13: Flow structures, scalars, anchors, tags, directives
// ===========================================================================

describe("Task 13: Flow structures, scalars, anchors, tags, directives", () => {
	describe("flow mapping", () => {
		it("parses {a: 1, b: 2} into flow-map", () => {
			const text = "{a: 1, b: 2}";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const flowMap = findByType(nodes, "flow-map");
			expect(flowMap).toBeDefined();
		});

		it("does not produce error nodes for flow brackets or commas", () => {
			const text = "{a: 1, b: 2}";
			const nodes = parse(text);
			const errors = findAllByType(nodes, "error");
			expect(errors).toHaveLength(0);
		});

		it("types brackets as whitespace, not flow-scalar", () => {
			const text = "{a: 1}";
			const nodes = parse(text);
			const flowMap = findByType(nodes, "flow-map");
			expect(flowMap).toBeDefined();
			// Brackets should be whitespace children, not flow-scalar
			const bracketChildren = flowMap?.children?.filter((c) => c.source === "{" || c.source === "}");
			expect(bracketChildren?.length).toBe(2);
			for (const bc of bracketChildren ?? []) {
				expect(bc.type).toBe("whitespace");
			}
		});
	});

	describe("flow sequence", () => {
		it("parses [1, 2, 3] into flow-seq", () => {
			const text = "[1, 2, 3]";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const flowSeq = findByType(nodes, "flow-seq");
			expect(flowSeq).toBeDefined();
		});

		it("does not produce error nodes for flow brackets or commas", () => {
			const text = "[1, 2, 3]";
			const nodes = parse(text);
			const errors = findAllByType(nodes, "error");
			expect(errors).toHaveLength(0);
		});
	});

	describe("nested flow in block", () => {
		it("parses key: {a: [1, 2]}", () => {
			const text = "key: {a: [1, 2]}";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const blockMap = findByType(nodes, "block-map");
			expect(blockMap).toBeDefined();
			const flowMap = findByType(nodes, "flow-map");
			expect(flowMap).toBeDefined();
			const flowSeq = findByType(nodes, "flow-seq");
			expect(flowSeq).toBeDefined();
		});
	});

	describe("block scalar", () => {
		it("parses literal block scalar", () => {
			const text = "key: |\n  line1\n  line2";
			const nodes = parse(text);
			expect(nodes).toHaveLength(1);
			const blockScalar = findByType(nodes, "block-scalar");
			expect(blockScalar).toBeDefined();
		});
	});

	describe("quoted scalars", () => {
		it("parses single-quoted scalar as flow-scalar", () => {
			const text = "key: 'hello'";
			const nodes = parse(text);
			const flowScalar = findByType(nodes, "flow-scalar");
			expect(flowScalar).toBeDefined();
		});

		it("parses double-quoted scalar as flow-scalar", () => {
			const text = 'key: "hello"';
			const nodes = parse(text);
			const flowScalar = findByType(nodes, "flow-scalar");
			expect(flowScalar).toBeDefined();
		});

		it("preserves raw source text for single-quoted scalars (includes quotes)", () => {
			const text = "key: 'hello'";
			const nodes = parse(text);
			const scalars = findAllByType(nodes, "flow-scalar");
			const quoted = scalars.find((s) => s.source.includes("'"));
			expect(quoted).toBeDefined();
			expect(quoted?.source).toBe("'hello'");
		});

		it("preserves raw source text for double-quoted scalars (includes quotes)", () => {
			const text = 'key: "hello"';
			const nodes = parse(text);
			const scalars = findAllByType(nodes, "flow-scalar");
			const quoted = scalars.find((s) => s.source.includes('"'));
			expect(quoted).toBeDefined();
			expect(quoted?.source).toBe('"hello"');
		});
	});

	describe("anchors and aliases", () => {
		it("parses anchor in CST", () => {
			const text = "a: &ref value";
			const nodes = parse(text);
			const anchor = findByType(nodes, "anchor");
			expect(anchor).toBeDefined();
		});

		it("parses alias in CST", () => {
			const text = "b: *ref";
			const nodes = parse(text);
			const alias = findByType(nodes, "alias");
			expect(alias).toBeDefined();
		});
	});

	describe("tags", () => {
		it("parses tag in CST", () => {
			const text = "a: !!str true";
			const nodes = parse(text);
			const tag = findByType(nodes, "tag");
			expect(tag).toBeDefined();
		});
	});

	describe("directives", () => {
		it("parses %YAML 1.2 directive", () => {
			const text = "%YAML 1.2\n---\na: 1";
			const nodes = parse(text);
			const directive = findByType(nodes, "directive");
			expect(directive).toBeDefined();
			expect(directive?.source).toBe("%YAML 1.2");
		});
	});

	describe("multi-document", () => {
		it("parses multiple documents separated by ---", () => {
			const text = "---\na: 1\n---\nb: 2";
			const nodes = parse(text);
			expect(nodes).toHaveLength(2);
			expect(nodes[0].type).toBe("document");
			expect(nodes[1].type).toBe("document");
		});

		it("parses documents separated by ...", () => {
			const text = "a: 1\n...\nb: 2";
			const nodes = parse(text);
			expect(nodes).toHaveLength(2);
		});
	});

	describe("comments preserved in correct positions", () => {
		it("preserves top-level comment", () => {
			const text = "# header comment\na: 1";
			const nodes = parse(text);
			const comment = findByType(nodes, "comment");
			expect(comment).toBeDefined();
			expect(comment?.source).toBe("# header comment");
		});

		it("preserves inline comment", () => {
			const text = "a: 1 # inline";
			const nodes = parse(text);
			const comment = findByType(nodes, "comment");
			expect(comment).toBeDefined();
			expect(comment?.source).toBe("# inline");
		});
	});
});
