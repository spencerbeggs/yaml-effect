/**
 * yaml-effect — YAML 1.2 parser and stringifier built on Effect.
 *
 * @packageDocumentation
 */

export type { YamlError } from "./errors/index.js";
export { YamlComposerError, YamlComposerErrorBase } from "./errors/YamlComposerError.js";
export { YamlErrorDetail } from "./errors/YamlErrorDetail.js";
export { YamlFormatError, YamlFormatErrorBase } from "./errors/YamlFormatError.js";
// Errors
export { YamlLexError, YamlLexErrorBase } from "./errors/YamlLexError.js";
export { YamlModificationError, YamlModificationErrorBase } from "./errors/YamlModificationError.js";
export { YamlNodeNotFoundError, YamlNodeNotFoundErrorBase } from "./errors/YamlNodeNotFoundError.js";
export { YamlParseError, YamlParseErrorBase } from "./errors/YamlParseError.js";
export { YamlSchemaError, YamlSchemaErrorBase } from "./errors/YamlSchemaError.js";
export { YamlStringifyError, YamlStringifyErrorBase } from "./errors/YamlStringifyError.js";
export { CstNode, CstNodeType } from "./schemas/CstNode.js";
export { YamlAlias } from "./schemas/YamlAlias.js";
// CST Visitor
export {
	CstAliasEvent,
	CstCommentEvent,
	CstDirectiveEvent,
	CstDocumentEndEvent,
	CstDocumentStartEvent,
	CstErrorEvent,
	CstKeyEvent,
	CstMapEndEvent,
	CstMapStartEvent,
	CstScalarEvent,
	CstSeqEndEvent,
	CstSeqStartEvent,
	CstValueEvent,
	YamlCstVisitorEvent,
	isCstAliasEvent,
	isCstCommentEvent,
	isCstDirectiveEvent,
	isCstDocumentEndEvent,
	isCstDocumentStartEvent,
	isCstErrorEvent,
	isCstKeyEvent,
	isCstMapEndEvent,
	isCstMapStartEvent,
	isCstScalarEvent,
	isCstSeqEndEvent,
	isCstSeqStartEvent,
	isCstValueEvent,
} from "./schemas/YamlCstVisitorEvent.js";
export { YamlDirective, YamlDocument } from "./schemas/YamlDocument.js";
export { YamlFormattingOptions } from "./schemas/YamlFormattingOptions.js";
export { YamlMap } from "./schemas/YamlMap.js";
export { YamlNode } from "./schemas/YamlNode.js";
export { YamlPair } from "./schemas/YamlPair.js";
export { YamlParseOptions } from "./schemas/YamlParseOptions.js";
// Types and schemas
export { YamlScalar } from "./schemas/YamlScalar.js";
export { YamlSeq } from "./schemas/YamlSeq.js";
export type { YamlPath } from "./schemas/YamlShared.js";
export { CollectionStyle, ScalarStyle, YamlEdit, YamlRange } from "./schemas/YamlShared.js";
export { YamlStringifyOptions } from "./schemas/YamlStringifyOptions.js";
export { YamlToken, YamlTokenKind } from "./schemas/YamlToken.js";
// AST Visitor
export {
	AliasEvent,
	CommentEvent,
	DirectiveEvent,
	DocumentEndEvent,
	DocumentStartEvent,
	MapEndEvent,
	MapStartEvent,
	PairEvent,
	ScalarEvent,
	SeqEndEvent,
	SeqStartEvent,
	YamlVisitorEvent,
	isAliasEvent,
	isCommentEvent,
	isDirectiveEvent,
	isDocumentEndEvent,
	isDocumentStartEvent,
	isMapEndEvent,
	isMapStartEvent,
	isPairEvent,
	isScalarEvent,
	isSeqEndEvent,
	isSeqStartEvent,
} from "./schemas/YamlVisitorEvent.js";
// AST navigation
// Type guards
export {
	findNode,
	findNodeAtOffset,
	getNodePath,
	getNodeValue,
	isAlias,
	isDocument,
	isMap,
	isNode,
	isPair,
	isScalar,
	isSeq,
} from "./utils/ast.js";
// Core parse/stringify
export { parse, parseAllDocuments, parseDocument } from "./utils/composer.js";
export { visitCST, visitCSTCollect } from "./utils/cst-visitor.js";
// Equality
export { equals, equalsValue } from "./utils/equality.js";
// Format & Modify
export type { RawFormatOptions } from "./utils/format.js";
export {
	applyEdits,
	format,
	formatAndApply,
	modify,
	modifyAndApply,
	stripComments,
} from "./utils/format.js";
// Low-level APIs
export type { YamlScanner } from "./utils/lexer.js";
export { createScanner, lex } from "./utils/lexer.js";
export { parseCST } from "./utils/parser.js";
// Schema integration
export {
	YamlAllFromString,
	YamlFromString,
	makeYamlAllFromString,
	makeYamlDocumentSchema,
	makeYamlFromString,
	makeYamlSchema,
} from "./utils/schema-integration.js";
export { stringify, stringifyDocument } from "./utils/stringify.js";
export { visit, visitCollect } from "./utils/visitor.js";
