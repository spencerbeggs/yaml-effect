/**
 * YAML error types for all pipeline stages.
 *
 * @packageDocumentation
 */

export { YamlComposerError, YamlComposerErrorBase } from "./YamlComposerError.js";
export type {
	YamlComposerErrorCode as YamlComposerErrorCodeType,
	YamlErrorCode as YamlErrorCodeType,
	YamlLexErrorCode as YamlLexErrorCodeType,
	YamlParseErrorCode as YamlParseErrorCodeType,
} from "./YamlErrorDetail.js";
export {
	YamlComposerErrorCode,
	YamlErrorCode,
	YamlErrorDetail,
	YamlLexErrorCode,
	YamlParseErrorCode,
} from "./YamlErrorDetail.js";
export { YamlFormatError, YamlFormatErrorBase } from "./YamlFormatError.js";
export { YamlLexError, YamlLexErrorBase } from "./YamlLexError.js";
export { YamlModificationError, YamlModificationErrorBase } from "./YamlModificationError.js";
export { YamlNodeNotFoundError, YamlNodeNotFoundErrorBase } from "./YamlNodeNotFoundError.js";
export { YamlParseError, YamlParseErrorBase } from "./YamlParseError.js";
export { YamlSchemaError, YamlSchemaErrorBase } from "./YamlSchemaError.js";
export { YamlStringifyError, YamlStringifyErrorBase } from "./YamlStringifyError.js";

/**
 * Union of all YAML error types.
 *
 * @public
 */
export type YamlError =
	| import("./YamlLexError.js").YamlLexError
	| import("./YamlParseError.js").YamlParseError
	| import("./YamlComposerError.js").YamlComposerError
	| import("./YamlStringifyError.js").YamlStringifyError
	| import("./YamlFormatError.js").YamlFormatError
	| import("./YamlModificationError.js").YamlModificationError
	| import("./YamlNodeNotFoundError.js").YamlNodeNotFoundError
	| import("./YamlSchemaError.js").YamlSchemaError;
