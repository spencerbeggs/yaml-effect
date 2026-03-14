/**
 * YAML 1.2 CST parser — transforms a token stream into a Concrete Syntax Tree.
 *
 * The CST preserves every character of the original input, including whitespace,
 * comments, and structural indicators. No value interpretation occurs at this stage.
 *
 * @packageDocumentation
 */

import { Effect, Stream } from "effect";
import { CstNode } from "../schemas/CstNode.js";
import type { YamlToken } from "../schemas/YamlToken.js";
import { lexAll } from "./lexer.js";

// ---------------------------------------------------------------------------
// Internal parser state
// ---------------------------------------------------------------------------

interface ParserState {
	readonly tokens: ReadonlyArray<YamlToken>;
	readonly text: string;
	pos: number;
}

function atEnd(state: ParserState): boolean {
	return state.pos >= state.tokens.length;
}

function peek(state: ParserState): YamlToken | undefined {
	return state.tokens[state.pos];
}

function advance(state: ParserState): YamlToken | undefined {
	const token = state.tokens[state.pos];
	state.pos++;
	return token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if the current token is a trivia token (whitespace, newline, comment). */
function isTrivia(token: YamlToken): boolean {
	return token.kind === "whitespace" || token.kind === "newline" || token.kind === "comment";
}

/** Check if the current token starts a new document boundary. */
function isDocumentBoundary(token: YamlToken): boolean {
	return token.kind === "document-start" || token.kind === "document-end";
}

/** Build a CstNode from collected children, computing source from the text. */
function makeContainerNode(type: CstNode["type"], children: CstNode[], text: string): CstNode {
	if (children.length === 0) {
		return new CstNode({ type, source: "", offset: 0, length: 0, children });
	}
	const first = children[0];
	const last = children[children.length - 1];
	const offset = first.offset;
	const end = last.offset + last.length;
	const source = text.slice(offset, end);
	return new CstNode({ type, source, offset, length: end - offset, children });
}

/**
 * Create a leaf CstNode from a token, using the raw source text.
 *
 * We slice from the original text rather than using `token.value` because
 * the lexer decodes certain tokens (e.g. quoted scalars have quotes stripped
 * and escape sequences resolved in `value`), but the CST must preserve
 * the raw source text exactly as written.
 */
function makeLeafNode(type: CstNode["type"], token: YamlToken, text: string): CstNode {
	return new CstNode({
		type,
		source: text.slice(token.offset, token.offset + token.length),
		offset: token.offset,
		length: token.length,
	});
}

// ---------------------------------------------------------------------------
// Recursive descent parser
// ---------------------------------------------------------------------------

/**
 * Consume trivia tokens (whitespace, newline, comment) and return them as CST nodes.
 */
function consumeTrivia(state: ParserState): CstNode[] {
	const nodes: CstNode[] = [];
	while (!atEnd(state)) {
		const token = peek(state);
		if (!token || !isTrivia(token)) break;
		advance(state);
		if (token.kind === "comment") {
			nodes.push(makeLeafNode("comment", token, state.text));
		} else if (token.kind === "newline") {
			nodes.push(makeLeafNode("newline", token, state.text));
		} else {
			nodes.push(makeLeafNode("whitespace", token, state.text));
		}
	}
	return nodes;
}

/**
 * Consume a single trivia-or-content token and return it as a CST node.
 * Used for tokens that don't form higher-level structures.
 */
function consumeLeafToken(state: ParserState): CstNode | undefined {
	const token = peek(state);
	if (!token) return undefined;
	advance(state);

	switch (token.kind) {
		case "whitespace":
			return makeLeafNode("whitespace", token, state.text);
		case "newline":
			return makeLeafNode("newline", token, state.text);
		case "comment":
			return makeLeafNode("comment", token, state.text);
		case "scalar":
			return makeLeafNode("flow-scalar", token, state.text);
		case "anchor":
			return makeLeafNode("anchor", token, state.text);
		case "alias":
			return makeLeafNode("alias", token, state.text);
		case "tag":
			return makeLeafNode("tag", token, state.text);
		case "directive":
			return makeLeafNode("directive", token, state.text);
		case "flow-separator":
			// Commas are structural punctuation; typed as "whitespace" since
			// CstNodeType has no dedicated delimiter type. The raw "," is
			// preserved in the node's source field.
			return makeLeafNode("whitespace", token, state.text);
		case "block-map-value":
		case "block-map-key":
		case "block-seq-entry":
			// Structural indicators (":", "?", "-") are typed as "whitespace"
			// when consumed as generic leaf tokens (e.g. inside flow contexts).
			return makeLeafNode("whitespace", token, state.text);
		case "document-start":
		case "document-end":
			// Document markers ("---", "...") consumed as leaf tokens.
			return makeLeafNode("whitespace", token, state.text);
		case "flow-map-start":
		case "flow-map-end":
		case "flow-seq-start":
		case "flow-seq-end":
			// Flow brackets consumed as leaf tokens outside their normal
			// parse path — treat as structural whitespace.
			return makeLeafNode("whitespace", token, state.text);
		case "block-map-start":
		case "block-seq-start":
			// Zero-width start markers from the lexer — skip gracefully.
			return makeLeafNode("whitespace", token, state.text);
		case "byte-order-mark":
			// BOM is structural metadata, not visible content. Mapping it to
			// "whitespace" is intentional — it keeps source fidelity without
			// needing a dedicated CstNodeType variant.
			return makeLeafNode("whitespace", token, state.text);
		case "error":
			return makeLeafNode("error", token, state.text);
		default:
			return makeLeafNode("error", token, state.text);
	}
}

/**
 * Parse a flow mapping (curly braces).
 */
function parseFlowMapping(state: ParserState): CstNode {
	const children: CstNode[] = [];
	// Consume the opening { — typed as "whitespace" since brackets are
	// structural punctuation, not scalar content.
	const open = advance(state);
	if (open) {
		children.push(makeLeafNode("whitespace", open, state.text));
	}

	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		if (token.kind === "flow-map-end") {
			const close = advance(state);
			if (close) {
				children.push(makeLeafNode("whitespace", close, state.text));
			}
			break;
		}

		if (token.kind === "flow-map-start") {
			children.push(parseFlowMapping(state));
		} else if (token.kind === "flow-seq-start") {
			children.push(parseFlowSequence(state));
		} else {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
		}
	}

	return makeContainerNode("flow-map", children, state.text);
}

/**
 * Parse a flow sequence: [ ... ]
 */
function parseFlowSequence(state: ParserState): CstNode {
	const children: CstNode[] = [];
	// Consume the opening [ — typed as "whitespace" since brackets are
	// structural punctuation, not scalar content.
	const open = advance(state);
	if (open) {
		children.push(makeLeafNode("whitespace", open, state.text));
	}

	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		if (token.kind === "flow-seq-end") {
			const close = advance(state);
			if (close) {
				children.push(makeLeafNode("whitespace", close, state.text));
			}
			break;
		}

		if (token.kind === "flow-map-start") {
			children.push(parseFlowMapping(state));
		} else if (token.kind === "flow-seq-start") {
			children.push(parseFlowSequence(state));
		} else {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
		}
	}

	return makeContainerNode("flow-seq", children, state.text);
}

/**
 * Parse a block scalar token. The lexer already handles the block scalar
 * content (literal `|` or folded `\>`), so we just need to wrap it.
 */
function parseBlockScalar(state: ParserState): CstNode {
	const token = advance(state);
	if (!token) {
		return new CstNode({ type: "block-scalar", source: "", offset: 0, length: 0 });
	}
	// The lexer gives us a "scalar" token whose raw span in the original text
	// covers the entire block scalar including the indicator.
	// We use token.offset and token.length to get the raw source.
	const source = state.text.slice(token.offset, token.offset + token.length);
	return new CstNode({
		type: "block-scalar",
		source,
		offset: token.offset,
		length: token.length,
	});
}

/**
 * Check if the current position has a block scalar indicator in the original text.
 */
function isBlockScalarToken(state: ParserState): boolean {
	const token = peek(state);
	if (!token || token.kind !== "scalar") return false;
	const ch = state.text[token.offset];
	return ch === "|" || ch === ">";
}

/**
 * Parse a block mapping at the given indentation level.
 */
function parseBlockMapping(state: ParserState, indent: number): CstNode {
	const children: CstNode[] = [];

	// Consume the block-map-start token
	const startToken = peek(state);
	if (startToken?.kind === "block-map-start") {
		advance(state);
	}

	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		// Stop conditions
		if (isDocumentBoundary(token)) break;

		// If we hit a block-seq-start or block-map-start at same or lower indent, stop
		if (token.kind === "block-seq-start" && token.column <= indent && children.length > 0) break;

		// Trivia
		if (isTrivia(token)) {
			children.push(...consumeTrivia(state));
			continue;
		}

		// Block map key indicator (?)
		if (token.kind === "block-map-key") {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			continue;
		}

		// Block map value indicator (:)
		if (token.kind === "block-map-value") {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			// After ":", consume the value
			children.push(...parseBlockValue(state, indent));
			continue;
		}

		// Scalar (key), anchor, tag, alias
		if (token.kind === "scalar" || token.kind === "anchor" || token.kind === "alias" || token.kind === "tag") {
			// If this content token is at a lower indent than this mapping, it
			// belongs to a parent scope.
			if (token.column < indent && children.length > 0) break;
			// Check if this is a block scalar
			if (isBlockScalarToken(state)) {
				children.push(parseBlockScalar(state));
				continue;
			}
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			continue;
		}

		// Nested block structures
		if (token.kind === "block-map-start") {
			if (token.column > indent) {
				children.push(parseBlockMapping(state, token.column));
			} else if (token.column === indent) {
				// Same-indent: lexer re-emitted scope marker; consume and continue
				advance(state);
			} else {
				break;
			}
			continue;
		}

		if (token.kind === "block-seq-start") {
			children.push(parseBlockSequence(state, token.column));
			continue;
		}

		if (token.kind === "block-seq-entry") {
			// This entry belongs to a parent sequence, stop
			if (token.column <= indent) break;
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			continue;
		}

		// Flow structures
		if (token.kind === "flow-map-start") {
			children.push(parseFlowMapping(state));
			continue;
		}
		if (token.kind === "flow-seq-start") {
			children.push(parseFlowSequence(state));
			continue;
		}

		// Anything else: consume as leaf
		const leaf = consumeLeafToken(state);
		if (leaf) children.push(leaf);
	}

	return makeContainerNode("block-map", children, state.text);
}

/**
 * Parse the value part after a ":" in a block mapping.
 */
function parseBlockValue(state: ParserState, _parentIndent: number): CstNode[] {
	const nodes: CstNode[] = [];

	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		// Consume inline whitespace
		if (token.kind === "whitespace") {
			nodes.push(...consumeTrivia(state));
			continue;
		}

		// Newline: peek ahead for nested structure
		if (token.kind === "newline") {
			break;
		}

		// Comment after value
		if (token.kind === "comment") {
			break;
		}

		// Inline flow structures
		if (token.kind === "flow-map-start") {
			nodes.push(parseFlowMapping(state));
			break;
		}
		if (token.kind === "flow-seq-start") {
			nodes.push(parseFlowSequence(state));
			break;
		}

		// Block scalar
		if (isBlockScalarToken(state)) {
			nodes.push(parseBlockScalar(state));
			break;
		}

		// Scalar, anchor, alias, tag
		if (token.kind === "scalar" || token.kind === "anchor" || token.kind === "alias" || token.kind === "tag") {
			const leaf = consumeLeafToken(state);
			if (leaf) nodes.push(leaf);
			continue;
		}

		break;
	}

	return nodes;
}

/**
 * Parse a block sequence at the given indentation level.
 */
function parseBlockSequence(state: ParserState, indent: number): CstNode {
	const children: CstNode[] = [];

	// Consume the block-seq-start token
	const startToken = peek(state);
	if (startToken?.kind === "block-seq-start") {
		advance(state);
	}

	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		// Stop conditions
		if (isDocumentBoundary(token)) break;

		// Trivia
		if (isTrivia(token)) {
			children.push(...consumeTrivia(state));
			continue;
		}

		// Sequence entry
		if (token.kind === "block-seq-entry") {
			if (token.column < indent) break;
			if (token.column > indent) break;
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			// Parse the entry content
			children.push(...parseSequenceEntryContent(state, indent));
			continue;
		}

		// If we hit a map/seq start at higher indent, it's entry content
		if (token.kind === "block-map-start" && token.column > indent) {
			children.push(parseBlockMapping(state, token.column));
			continue;
		}

		if (token.kind === "block-seq-start") {
			if (token.column > indent) {
				children.push(parseBlockSequence(state, token.column));
			} else {
				// Same-indent block-seq-start: the lexer re-emitted a scope
				// marker after returning from deeper nesting. Consume and continue.
				advance(state);
			}
			continue;
		}

		// Otherwise, stop — this belongs to parent
		break;
	}

	return makeContainerNode("block-seq", children, state.text);
}

/**
 * Look ahead (without consuming) to see if a block-map-value token exists
 * before the next newline / document boundary / sequence entry at this indent.
 */
function hasImplicitMapAhead(state: ParserState, seqIndent: number): boolean {
	let flowDepth = 0;
	for (let i = state.pos; i < state.tokens.length; i++) {
		const t = state.tokens[i];
		if (!t) break;
		// Track flow depth so we don't mistake a ":" inside { } or [ ] for a
		// block mapping value indicator.
		if (t.kind === "flow-map-start" || t.kind === "flow-seq-start") {
			flowDepth++;
			continue;
		}
		if (t.kind === "flow-map-end" || t.kind === "flow-seq-end") {
			flowDepth--;
			continue;
		}
		if (flowDepth > 0) continue;
		if (t.kind === "newline") return false;
		if (isDocumentBoundary(t)) return false;
		if (t.kind === "block-seq-entry" && t.column <= seqIndent) return false;
		if (t.kind === "block-map-value") return true;
	}
	return false;
}

/**
 * Parse the content of a sequence entry (after the `-`).
 */
function parseSequenceEntryContent(state: ParserState, seqIndent: number): CstNode[] {
	const nodes: CstNode[] = [];

	// Check if this entry contains an implicit mapping (scalar followed by ":")
	if (hasImplicitMapAhead(state, seqIndent)) {
		// Wrap everything up to the next entry / doc boundary into a block-map
		nodes.push(parseImplicitBlockMapping(state, seqIndent));
		return nodes;
	}

	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		// Stop at document boundary
		if (isDocumentBoundary(token)) break;

		// Stop at next sequence entry at same indent
		if (token.kind === "block-seq-entry" && token.column <= seqIndent) break;

		// Nested sequence entry (deeper indent) without a prior block-seq-start:
		// synthesise a nested sequence parse at this indent level.
		if (token.kind === "block-seq-entry" && token.column > seqIndent) {
			nodes.push(parseBlockSequence(state, token.column));
			continue;
		}

		// Trivia
		if (isTrivia(token)) {
			nodes.push(...consumeTrivia(state));
			continue;
		}

		// Block structures
		if (token.kind === "block-map-start") {
			nodes.push(parseBlockMapping(state, token.column));
			continue;
		}

		if (token.kind === "block-seq-start") {
			// A block-seq-start at or below the current sequence indent is a
			// re-emitted scope marker for a sibling entry — let the parent
			// sequence handler consume it.
			if (token.column <= seqIndent) break;
			nodes.push(parseBlockSequence(state, token.column));
			continue;
		}

		// Flow structures
		if (token.kind === "flow-map-start") {
			nodes.push(parseFlowMapping(state));
			continue;
		}
		if (token.kind === "flow-seq-start") {
			nodes.push(parseFlowSequence(state));
			continue;
		}

		// Block scalar
		if (isBlockScalarToken(state)) {
			nodes.push(parseBlockScalar(state));
			continue;
		}

		// Scalar, value indicator, anchor, alias, tag
		if (
			token.kind === "scalar" ||
			token.kind === "block-map-value" ||
			token.kind === "block-map-key" ||
			token.kind === "anchor" ||
			token.kind === "alias" ||
			token.kind === "tag"
		) {
			// If a content token appears at or below the sequence indent, it
			// belongs to a parent scope (e.g. a sibling key in the parent mapping).
			if (token.column <= seqIndent) break;
			const leaf = consumeLeafToken(state);
			if (leaf) nodes.push(leaf);
			continue;
		}

		break;
	}

	return nodes;
}

/**
 * Parse an implicit block mapping (no block-map-start token from the lexer).
 * This occurs inside sequence entries like `- a: 1`.
 */
function parseImplicitBlockMapping(state: ParserState, seqIndent: number): CstNode {
	const children: CstNode[] = [];
	// Track the indent of the first key in this implicit mapping so we can
	// distinguish "same-level block-map-start" (continuation) from "deeper"
	// (nested sub-mapping).
	let entryIndent = -1;

	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		// Stop at document boundary
		if (isDocumentBoundary(token)) break;

		// Stop at next sequence entry at same or lower indent
		if (token.kind === "block-seq-entry" && token.column <= seqIndent) break;

		// Trivia
		if (isTrivia(token)) {
			children.push(...consumeTrivia(state));
			continue;
		}

		// Block map value indicator (:)
		if (token.kind === "block-map-value") {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			// After ":", consume the value
			children.push(...parseBlockValue(state, seqIndent));
			continue;
		}

		// Scalar (key), anchor, tag, alias
		if (token.kind === "scalar" || token.kind === "anchor" || token.kind === "alias" || token.kind === "tag") {
			if (isBlockScalarToken(state)) {
				children.push(parseBlockScalar(state));
				continue;
			}
			// Track the indent of the first key
			if (entryIndent < 0) {
				entryIndent = token.column;
			}
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			continue;
		}

		// Block-map-start at the same indent as our entries is just the lexer
		// re-emitting a scope marker — consume it and keep going.
		if (token.kind === "block-map-start") {
			if (entryIndent >= 0 && token.column <= entryIndent) {
				// Same-level or shallower: just skip the zero-width marker
				advance(state);
				continue;
			}
			// Deeper indent: nested sub-mapping
			children.push(parseBlockMapping(state, token.column));
			continue;
		}
		if (token.kind === "block-seq-start") {
			children.push(parseBlockSequence(state, token.column));
			continue;
		}

		// Flow structures
		if (token.kind === "flow-map-start") {
			children.push(parseFlowMapping(state));
			continue;
		}
		if (token.kind === "flow-seq-start") {
			children.push(parseFlowSequence(state));
			continue;
		}

		// Anything else
		const leaf = consumeLeafToken(state);
		if (leaf) children.push(leaf);
	}

	return makeContainerNode("block-map", children, state.text);
}

/**
 * Parse a single document from the token stream.
 */
function parseDocument(state: ParserState): CstNode {
	const children: CstNode[] = [];

	// Consume leading directives
	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		if (token.kind === "directive") {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			continue;
		}

		if (isTrivia(token) && token.kind !== "comment") {
			// Consume trivia before document-start
			children.push(...consumeTrivia(state));
			continue;
		}

		if (token.kind === "comment") {
			// Before document-start, comments can be directives-adjacent
			const nextNonTrivia = findNextNonTrivia(state);
			if (nextNonTrivia?.kind === "directive" || nextNonTrivia?.kind === "document-start") {
				children.push(...consumeTrivia(state));
				continue;
			}
			break;
		}

		break;
	}

	// Consume document-start marker if present
	if (!atEnd(state)) {
		const token = peek(state);
		if (token?.kind === "document-start") {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
		}
	}

	// Parse document content
	while (!atEnd(state)) {
		const token = peek(state);
		if (!token) break;

		// Stop at next document boundary
		if (token.kind === "document-start") break;
		if (token.kind === "document-end") {
			const leaf = consumeLeafToken(state);
			if (leaf) children.push(leaf);
			// Consume trailing trivia after document-end
			while (!atEnd(state)) {
				const t = peek(state);
				if (!t) break;
				if (t.kind === "newline" || t.kind === "whitespace" || t.kind === "comment") {
					children.push(...consumeTrivia(state));
				} else {
					break;
				}
			}
			break;
		}

		// Trivia
		if (isTrivia(token)) {
			children.push(...consumeTrivia(state));
			continue;
		}

		// Block structures
		if (token.kind === "block-map-start") {
			children.push(parseBlockMapping(state, token.column));
			continue;
		}

		if (token.kind === "block-seq-start") {
			children.push(parseBlockSequence(state, token.column));
			continue;
		}

		// Flow structures
		if (token.kind === "flow-map-start") {
			children.push(parseFlowMapping(state));
			continue;
		}
		if (token.kind === "flow-seq-start") {
			children.push(parseFlowSequence(state));
			continue;
		}

		// Block scalar
		if (isBlockScalarToken(state)) {
			children.push(parseBlockScalar(state));
			continue;
		}

		// Any other token
		const leaf = consumeLeafToken(state);
		if (leaf) children.push(leaf);
	}

	return makeContainerNode("document", children, state.text);
}

/**
 * Find the next non-trivia token without consuming.
 */
function findNextNonTrivia(state: ParserState): YamlToken | undefined {
	for (let i = state.pos; i < state.tokens.length; i++) {
		const t = state.tokens[i];
		if (t && !isTrivia(t)) return t;
	}
	return undefined;
}

/**
 * Parse all documents from the token stream.
 */
function parseDocuments(tokens: ReadonlyArray<YamlToken>, text: string): CstNode[] {
	const state: ParserState = { tokens, text, pos: 0 };
	const documents: CstNode[] = [];

	if (atEnd(state)) {
		// Empty input — return a single empty document
		return [new CstNode({ type: "document", source: "", offset: 0, length: 0, children: [] })];
	}

	while (!atEnd(state)) {
		const before = state.pos;
		documents.push(parseDocument(state));

		// Safety: if no progress was made, force-advance to avoid infinite loop
		if (state.pos === before && !atEnd(state)) {
			state.pos++;
		}
	}

	return documents;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse YAML source text into a stream of CST nodes (one per document).
 *
 * @public
 */
export function parseCST(text: string): Stream.Stream<CstNode, never> {
	return Stream.fromEffect(lexAll(text).pipe(Effect.map((tokens) => parseDocuments(tokens, text)))).pipe(
		Stream.flatMap((docs) => Stream.fromIterable(docs)),
	);
}

/**
 * Parse YAML source text and collect all CST document nodes into an array.
 * Convenience function for testing.
 *
 * @public
 */
export function parseCSTAll(text: string): Effect.Effect<CstNode[], never> {
	return lexAll(text).pipe(Effect.map((tokens) => parseDocuments(tokens, text)));
}
