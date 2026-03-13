/**
 * YAML error detail schema and error code types.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * Error codes for the YAML lexer stage.
 *
 * @public
 */
export const YamlLexErrorCode = Schema.Literal(
	"UnexpectedCharacter",
	"UnterminatedString",
	"InvalidEscapeSequence",
	"InvalidUnicode",
	"UnterminatedBlockScalar",
	"UnterminatedFlowCollection",
	"InvalidDirective",
	"InvalidTagHandle",
	"InvalidAnchorName",
	"UnexpectedByteOrderMark",
);
/**
 * The union of all YAML lex error code string literals.
 *
 * @public
 */
export type YamlLexErrorCode = Schema.Schema.Type<typeof YamlLexErrorCode>;

/**
 * Error codes for the YAML parser stage.
 *
 * @public
 */
export const YamlParseErrorCode = Schema.Literal(
	"InvalidIndentation",
	"DuplicateKey",
	"UnexpectedToken",
	"MissingValue",
	"MissingKey",
	"TabIndentation",
	"InvalidBlockStructure",
	"MalformedFlowCollection",
);
/**
 * The union of all YAML parse error code string literals.
 *
 * @public
 */
export type YamlParseErrorCode = Schema.Schema.Type<typeof YamlParseErrorCode>;

/**
 * Error codes for the YAML composer stage.
 *
 * @public
 */
export const YamlComposerErrorCode = Schema.Literal(
	"UndefinedAlias",
	"DuplicateAnchor",
	"CircularAlias",
	"UnresolvedTag",
	"InvalidTagValue",
	"AliasCountExceeded",
);
/**
 * The union of all YAML composer error code string literals.
 *
 * @public
 */
export type YamlComposerErrorCode = Schema.Schema.Type<typeof YamlComposerErrorCode>;

/**
 * Union of all YAML error codes across all pipeline stages.
 *
 * @public
 */
export const YamlErrorCode = Schema.Union(YamlLexErrorCode, YamlParseErrorCode, YamlComposerErrorCode);
/**
 * The union of all YAML error code string literals.
 *
 * @public
 */
export type YamlErrorCode = Schema.Schema.Type<typeof YamlErrorCode>;

/**
 * Detail for a single YAML error, including the error code, a human-readable
 * message, and the exact position within the source document.
 *
 * @remarks
 * - `code` — a {@link YamlErrorCode} identifying the error kind.
 * - `message` — a descriptive message suitable for display.
 * - `offset` — zero-based character offset where the error occurred.
 * - `length` — character length of the problematic span.
 * - `line` — zero-based line number of the error.
 * - `column` — zero-based column within the line.
 *
 * @public
 */
export class YamlErrorDetail extends Schema.Class<YamlErrorDetail>("YamlErrorDetail")({
	code: YamlErrorCode,
	message: Schema.String,
	offset: Schema.Int.pipe(Schema.nonNegative()),
	length: Schema.Int.pipe(Schema.nonNegative()),
	line: Schema.Int.pipe(Schema.nonNegative()),
	column: Schema.Int.pipe(Schema.nonNegative()),
}) {}
