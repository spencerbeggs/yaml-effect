import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
	YamlComposerError,
	YamlErrorDetail,
	YamlFormatError,
	YamlLexError,
	YamlModificationError,
	YamlNodeNotFoundError,
	YamlParseError,
	YamlSchemaError,
	YamlStringifyError,
} from "../src/errors/index.js";

describe("YamlErrorDetail", () => {
	it("should construct with all fields", () => {
		const detail = new YamlErrorDetail({
			code: "UnexpectedCharacter",
			message: "Unexpected character found",
			offset: 10,
			length: 1,
			line: 2,
			column: 5,
		});
		expect(detail.code).toBe("UnexpectedCharacter");
		expect(detail.message).toBe("Unexpected character found");
		expect(detail.offset).toBe(10);
		expect(detail.length).toBe(1);
		expect(detail.line).toBe(2);
		expect(detail.column).toBe(5);
	});

	it("should accept lex error codes", () => {
		const detail = new YamlErrorDetail({
			code: "InvalidEscapeSequence",
			message: "Invalid escape",
			offset: 0,
			length: 2,
			line: 0,
			column: 0,
		});
		expect(detail.code).toBe("InvalidEscapeSequence");
	});

	it("should accept parse error codes", () => {
		const detail = new YamlErrorDetail({
			code: "DuplicateKey",
			message: "Duplicate key found",
			offset: 5,
			length: 3,
			line: 1,
			column: 0,
		});
		expect(detail.code).toBe("DuplicateKey");
	});

	it("should accept composer error codes", () => {
		const detail = new YamlErrorDetail({
			code: "UndefinedAlias",
			message: "Alias not defined",
			offset: 0,
			length: 4,
			line: 0,
			column: 0,
		});
		expect(detail.code).toBe("UndefinedAlias");
	});

	it("rejects negative offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: -1,
				length: 1,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects fractional offset", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: 0.5,
				length: 1,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects negative length", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: 0,
				length: -1,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects fractional length", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: 0,
				length: 1.5,
				line: 0,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects negative line", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: 0,
				length: 1,
				line: -1,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects fractional line", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: 0,
				length: 1,
				line: 1.5,
				column: 0,
			}),
		).toThrow();
	});

	it("rejects negative column", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: 0,
				length: 1,
				line: 0,
				column: -1,
			}),
		).toThrow();
	});

	it("rejects fractional column", () => {
		expect(() =>
			Schema.decodeUnknownSync(YamlErrorDetail)({
				code: "UnexpectedCharacter",
				message: "x",
				offset: 0,
				length: 1,
				line: 0,
				column: 0.5,
			}),
		).toThrow();
	});
});

describe("YamlLexError", () => {
	it("should have the correct _tag", () => {
		const detail = new YamlErrorDetail({
			code: "UnexpectedCharacter",
			message: "Unexpected character",
			offset: 0,
			length: 1,
			line: 0,
			column: 0,
		});
		const error = new YamlLexError({
			errors: [detail],
			text: "invalid yaml",
		});
		expect(error._tag).toBe("YamlLexError");
	});

	it("should produce a human-readable message", () => {
		const detail = new YamlErrorDetail({
			code: "UnexpectedCharacter",
			message: "Unexpected character",
			offset: 0,
			length: 1,
			line: 0,
			column: 0,
		});
		const error = new YamlLexError({
			errors: [detail],
			text: "invalid yaml",
		});
		expect(error.message).toContain("YAML lex failed");
		expect(error.message).toContain("1 error");
		expect(error.message).toContain("Unexpected character");
	});

	it("should pluralize for multiple errors", () => {
		const details = [
			new YamlErrorDetail({
				code: "UnexpectedCharacter",
				message: "Unexpected character",
				offset: 0,
				length: 1,
				line: 0,
				column: 0,
			}),
			new YamlErrorDetail({
				code: "UnterminatedString",
				message: "Unterminated string",
				offset: 5,
				length: 1,
				line: 0,
				column: 5,
			}),
		];
		const error = new YamlLexError({
			errors: details,
			text: "invalid yaml",
		});
		expect(error.message).toContain("2 errors");
	});
});

describe("YamlParseError", () => {
	it("should have the correct _tag", () => {
		const error = new YamlParseError({
			errors: [],
			text: "",
		});
		expect(error._tag).toBe("YamlParseError");
	});

	it("should produce a human-readable message", () => {
		const detail = new YamlErrorDetail({
			code: "InvalidIndentation",
			message: "Invalid indentation",
			offset: 0,
			length: 1,
			line: 0,
			column: 0,
		});
		const error = new YamlParseError({
			errors: [detail],
			text: "bad: yaml",
		});
		expect(error.message).toContain("YAML parse failed");
		expect(error.message).toContain("Invalid indentation");
	});

	it("should pluralize for multiple errors", () => {
		const details = [
			new YamlErrorDetail({ code: "InvalidIndentation", message: "a", offset: 0, length: 1, line: 0, column: 0 }),
			new YamlErrorDetail({ code: "DuplicateKey", message: "b", offset: 5, length: 1, line: 1, column: 0 }),
		];
		const error = new YamlParseError({ errors: details, text: "bad" });
		expect(error.message).toContain("2 errors");
	});
});

describe("YamlComposerError", () => {
	it("should have the correct _tag", () => {
		const error = new YamlComposerError({
			errors: [],
			text: "",
		});
		expect(error._tag).toBe("YamlComposerError");
	});

	it("should produce a human-readable message", () => {
		const detail = new YamlErrorDetail({
			code: "UndefinedAlias",
			message: "Undefined alias",
			offset: 0,
			length: 1,
			line: 0,
			column: 0,
		});
		const error = new YamlComposerError({
			errors: [detail],
			text: "*missing",
		});
		expect(error.message).toContain("YAML compose failed");
		expect(error.message).toContain("Undefined alias");
	});

	it("should pluralize for multiple errors", () => {
		const details = [
			new YamlErrorDetail({ code: "UndefinedAlias", message: "a", offset: 0, length: 1, line: 0, column: 0 }),
			new YamlErrorDetail({ code: "UndefinedAlias", message: "b", offset: 5, length: 1, line: 1, column: 0 }),
		];
		const error = new YamlComposerError({ errors: details, text: "bad" });
		expect(error.message).toContain("2 errors");
	});
});

describe("YamlStringifyError", () => {
	it("should have the correct _tag", () => {
		const error = new YamlStringifyError({
			value: { circular: "ref" },
			reason: "Circular reference detected",
		});
		expect(error._tag).toBe("YamlStringifyError");
	});

	it("should produce a human-readable message", () => {
		const error = new YamlStringifyError({
			value: 42,
			reason: "Unsupported value type",
		});
		expect(error.message).toContain("YAML stringify failed");
		expect(error.message).toContain("Unsupported value type");
	});

	it("should carry value and reason fields", () => {
		const val = { key: "value" };
		const error = new YamlStringifyError({
			value: val,
			reason: "Some reason",
		});
		expect(error.value).toBe(val);
		expect(error.reason).toBe("Some reason");
	});
});

describe("YamlFormatError", () => {
	it("should have the correct _tag", () => {
		const error = new YamlFormatError({
			text: "bad: yaml",
			reason: "Failed to format",
		});
		expect(error._tag).toBe("YamlFormatError");
	});

	it("should produce a human-readable message", () => {
		const error = new YamlFormatError({
			text: "bad: yaml",
			reason: "Failed to format",
		});
		expect(error.message).toContain("YAML format failed");
		expect(error.message).toContain("Failed to format");
	});
});

describe("YamlModificationError", () => {
	it("should have the correct _tag", () => {
		const error = new YamlModificationError({
			path: ["key", 0],
			reason: "Cannot modify",
		});
		expect(error._tag).toBe("YamlModificationError");
	});

	it("should produce a human-readable message", () => {
		const error = new YamlModificationError({
			path: ["key", 0],
			reason: "Cannot modify",
		});
		expect(error.message).toContain("Modification failed");
		expect(error.message).toContain("key, 0");
		expect(error.message).toContain("Cannot modify");
	});
});

describe("YamlNodeNotFoundError", () => {
	it("should have the correct _tag", () => {
		const error = new YamlNodeNotFoundError({
			path: ["missing"],
			rootNodeType: "mapping",
		});
		expect(error._tag).toBe("YamlNodeNotFoundError");
	});

	it("should produce a human-readable message", () => {
		const error = new YamlNodeNotFoundError({
			path: ["a", "b", 1],
			rootNodeType: "mapping",
		});
		expect(error.message).toContain("Node not found");
		expect(error.message).toContain("a, b, 1");
		expect(error.message).toContain("mapping");
	});
});

describe("YamlSchemaError", () => {
	it("should have the correct _tag", () => {
		const error = new YamlSchemaError({
			text: "key: value",
			cause: new Error("Schema mismatch"),
		});
		expect(error._tag).toBe("YamlSchemaError");
	});

	it("should produce a human-readable message", () => {
		const error = new YamlSchemaError({
			text: "key: value",
			cause: new Error("Schema mismatch"),
		});
		expect(error.message).toContain("YAML schema validation failed");
	});

	it("should carry text and cause fields", () => {
		const cause = new Error("Bad schema");
		const error = new YamlSchemaError({
			text: "foo: bar",
			cause,
		});
		expect(error.text).toBe("foo: bar");
		expect(error.cause).toBe(cause);
	});
});
