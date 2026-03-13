/**
 * YAML CST node schema and node type literal union.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * The 15 node types produced by the YAML CST parser.
 *
 * @public
 */
export const CstNodeType = Schema.Literal(
	"document",
	"directive",
	"comment",
	"block-map",
	"block-seq",
	"flow-map",
	"flow-seq",
	"block-scalar",
	"flow-scalar",
	"alias",
	"anchor",
	"tag",
	"whitespace",
	"newline",
	"error",
);

/**
 * The union of all YAML CST node type string literals.
 *
 * @public
 */
export type CstNodeType = Schema.Schema.Type<typeof CstNodeType>;

/**
 * A single YAML Concrete Syntax Tree (CST) node, carrying its type, raw
 * source text span, position, and optional recursive children.
 *
 * @remarks
 * - `type` — a {@link CstNodeType} identifying the node kind.
 * - `source` — the raw text slice from the source document.
 * - `offset` — zero-based character offset where the node begins.
 * - `length` — character length of the node span.
 * - `children` — optional recursive child nodes.
 *
 * No interpretation occurs at the CST level — `true` is still the string
 * `"true"`.
 *
 * @public
 */
export class CstNode extends Schema.Class<CstNode>("CstNode")({
	type: CstNodeType,
	source: Schema.String,
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
	children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<CstNode> => CstNode))),
}) {}
