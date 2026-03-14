/**
 * yaml-effect — A pure Effect-based YAML 1.2 parser, stringifier, and toolkit
 * for TypeScript.
 *
 * @remarks
 * This library provides a complete YAML 1.2 processing pipeline built entirely
 * on the {@link https://effect.website | Effect} library. Every operation
 * returns an `Effect`, enabling typed error handling, composability, and
 * integration with Effect-based applications.
 *
 * **Core pipeline stages:**
 *
 * 1. **Lex** — tokenize raw YAML text via {@link lex} or {@link createScanner}
 * 2. **Parse** — build a Concrete Syntax Tree via {@link parseCST}
 * 3. **Compose** — produce a typed AST via {@link parseDocument}, {@link parseAllDocuments}, or {@link parse}
 * 4. **Stringify** — convert values or AST back to YAML via {@link stringify} or {@link stringifyDocument}
 *
 * **Additional capabilities:**
 *
 * - **Formatting** — re-indent, sort keys, strip comments via {@link format} and {@link formatAndApply}
 * - **Modification** — insert, replace, or remove values by path via {@link modify} and {@link modifyAndApply}
 * - **Equality** — semantic YAML comparison via {@link equals} and {@link equalsValue}
 * - **Visitor pattern** — SAX-style streaming traversal at AST ({@link visit}) and CST ({@link visitCST}) levels
 * - **Schema integration** — bidirectional Effect Schema composition via {@link YamlFromString} and {@link makeYamlSchema}
 *
 * @example Parsing and stringifying
 * ```ts
 * import { Effect } from "effect";
 * import { parse, stringify } from "yaml-effect";
 *
 * const program = Effect.gen(function* () {
 *   const value = yield* parse("name: Alice\nage: 30");
 *   console.log(value); // { name: "Alice", age: 30 }
 *
 *   const yaml = yield* stringify({ greeting: "hello", count: 42 });
 *   console.log(yaml); // "greeting: hello\ncount: 42\n"
 * });
 *
 * Effect.runSync(program);
 * ```
 *
 * @example Typed schema integration
 * ```ts
 * import { Effect, Schema } from "effect";
 * import { makeYamlSchema } from "yaml-effect";
 *
 * const UserSchema = makeYamlSchema(
 *   Schema.Struct({ name: Schema.String, age: Schema.Number }),
 * );
 *
 * const program = Effect.gen(function* () {
 *   const user = yield* Schema.decode(UserSchema)("name: Alice\nage: 30");
 *   console.log(user); // { name: "Alice", age: 30 }
 * });
 *
 * Effect.runSync(program);
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type { YamlError } from "./errors/index.js";
export { YamlComposerError, YamlComposerErrorBase } from "./errors/YamlComposerError.js";
export { YamlErrorDetail } from "./errors/YamlErrorDetail.js";
export { YamlFormatError, YamlFormatErrorBase } from "./errors/YamlFormatError.js";
export { YamlLexError, YamlLexErrorBase } from "./errors/YamlLexError.js";
export { YamlModificationError, YamlModificationErrorBase } from "./errors/YamlModificationError.js";
export { YamlNodeNotFoundError, YamlNodeNotFoundErrorBase } from "./errors/YamlNodeNotFoundError.js";
export { YamlParseError, YamlParseErrorBase } from "./errors/YamlParseError.js";
export { YamlSchemaError, YamlSchemaErrorBase } from "./errors/YamlSchemaError.js";
export { YamlStringifyError, YamlStringifyErrorBase } from "./errors/YamlStringifyError.js";

// ---------------------------------------------------------------------------
// Schemas & AST types
// ---------------------------------------------------------------------------

export { CstNode, CstNodeType } from "./schemas/CstNode.js";
export { YamlAlias, YamlMap, YamlNode, YamlPair, YamlScalar, YamlSeq } from "./schemas/YamlAstNodes.js";

// ---------------------------------------------------------------------------
// CST Visitor Events
// ---------------------------------------------------------------------------

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
export { YamlParseOptions } from "./schemas/YamlParseOptions.js";
export type { YamlPath } from "./schemas/YamlShared.js";
export { CollectionStyle, ScalarStyle, YamlEdit, YamlRange } from "./schemas/YamlShared.js";
export { YamlStringifyOptions } from "./schemas/YamlStringifyOptions.js";
export { YamlToken, YamlTokenKind } from "./schemas/YamlToken.js";

// ---------------------------------------------------------------------------
// AST Visitor Events
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AST Navigation & Type Guards
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core Parse / Stringify
// ---------------------------------------------------------------------------

export { parse, parseAllDocuments, parseDocument } from "./utils/composer.js";
export { stringify, stringifyDocument } from "./utils/stringify.js";

// ---------------------------------------------------------------------------
// CST Visitor
// ---------------------------------------------------------------------------

export { visitCST, visitCSTCollect } from "./utils/cst-visitor.js";

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

export { equals, equalsValue } from "./utils/equality.js";

// ---------------------------------------------------------------------------
// Format & Modify
// ---------------------------------------------------------------------------

export type { RawFormatOptions } from "./utils/format.js";
export {
	applyEdits,
	format,
	formatAndApply,
	modify,
	modifyAndApply,
	stripComments,
} from "./utils/format.js";

// ---------------------------------------------------------------------------
// Low-level APIs
// ---------------------------------------------------------------------------

export type { YamlScanner } from "./utils/lexer.js";
export { createScanner, lex } from "./utils/lexer.js";
export { parseCST } from "./utils/parser.js";

// ---------------------------------------------------------------------------
// Schema Integration
// ---------------------------------------------------------------------------

export {
	YamlAllFromString,
	YamlFromString,
	makeYamlAllFromString,
	makeYamlDocumentSchema,
	makeYamlFromString,
	makeYamlSchema,
} from "./utils/schema-integration.js";

// ---------------------------------------------------------------------------
// AST Visitor
// ---------------------------------------------------------------------------

export { visit, visitCollect } from "./utils/visitor.js";
