/**
 * yaml-effect — YAML 1.2 parser and stringifier built on Effect.
 *
 * @packageDocumentation
 */

export type { YamlError } from "./errors/index.js";
export { YamlComposerError } from "./errors/YamlComposerError.js";
export { YamlErrorDetail } from "./errors/YamlErrorDetail.js";
export { YamlFormatError } from "./errors/YamlFormatError.js";
// Errors
export { YamlLexError } from "./errors/YamlLexError.js";
export { YamlModificationError } from "./errors/YamlModificationError.js";
export { YamlNodeNotFoundError } from "./errors/YamlNodeNotFoundError.js";
export { YamlParseError } from "./errors/YamlParseError.js";
export { YamlSchemaError } from "./errors/YamlSchemaError.js";
export { YamlStringifyError } from "./errors/YamlStringifyError.js";
export { CstNode, CstNodeType } from "./schemas/CstNode.js";
export { YamlAlias } from "./schemas/YamlAlias.js";
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
// Low-level APIs
export { lex } from "./utils/lexer.js";
export { parseCST } from "./utils/parser.js";
// Schema integration
export { YamlFromString, makeYamlFromString, makeYamlSchema } from "./utils/schema-integration.js";
export { stringify, stringifyDocument } from "./utils/stringify.js";
