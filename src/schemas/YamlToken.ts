/**
 * YAML token schema and token kind literal union.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * The 22 token kinds produced by the YAML lexer.
 *
 * @public
 */
export const YamlTokenKind = Schema.Literal(
	"document-start",
	"document-end",
	"directive",
	"tag",
	"anchor",
	"alias",
	"scalar",
	"block-map-start",
	"block-map-key",
	"block-map-value",
	"block-seq-start",
	"block-seq-entry",
	"flow-map-start",
	"flow-map-end",
	"flow-seq-start",
	"flow-seq-end",
	"flow-separator",
	"newline",
	"whitespace",
	"comment",
	"byte-order-mark",
	"error",
);

/**
 * The union of all YAML token kind string literals.
 *
 * @public
 */
export type YamlTokenKind = Schema.Schema.Type<typeof YamlTokenKind>;

/**
 * A single YAML token produced by the lexer, carrying its kind, raw text
 * value, and exact source position.
 *
 * @remarks
 * - `kind` — a {@link YamlTokenKind} identifying the token type.
 * - `value` — the raw text slice from the source document.
 * - `offset` — zero-based character offset where the token begins.
 * - `length` — character length of the token span.
 * - `line` — zero-based line number of the token start.
 * - `column` — zero-based column within the line of the token start.
 *
 * @public
 */
export class YamlToken extends Schema.Class<YamlToken>("YamlToken")({
	kind: YamlTokenKind,
	value: Schema.String,
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
	line: Schema.Int.pipe(Schema.nonNegative()),
	column: Schema.Int.pipe(Schema.nonNegative()),
}) {}
