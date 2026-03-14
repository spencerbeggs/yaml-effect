/**
 * Tests for the enhanced YamlScanner pull-based accessor API.
 *
 * @packageDocumentation
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createScanner, lexAll } from "../src/utils/lexer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runLexAll(text: string) {
	return Effect.runSync(lexAll(text));
}

// ===========================================================================
// Basic scanning
// ===========================================================================

describe("basic scanning", () => {
	it("scans a key-value pair and returns token kinds", () => {
		const scanner = createScanner("foo: bar");
		const kinds: (string | null)[] = [];
		let kind = scanner.scan();
		while (kind !== null) {
			kinds.push(kind);
			kind = scanner.scan();
		}
		expect(kinds).toContain("block-map-start");
		expect(kinds).toContain("scalar");
		expect(kinds).toContain("block-map-value");
	});

	it("getToken returns current token kind without advancing", () => {
		const scanner = createScanner("hello");
		expect(scanner.getToken()).toBeNull();
		const kind = scanner.scan();
		expect(kind).toBe("scalar");
		// calling getToken again should return the same kind
		expect(scanner.getToken()).toBe("scalar");
		expect(scanner.getToken()).toBe("scalar");
		// scan to end
		expect(scanner.scan()).toBeNull();
		expect(scanner.getToken()).toBeNull();
	});

	it("getTokenValue returns the value of the current token", () => {
		const scanner = createScanner("hello");
		scanner.scan();
		expect(scanner.getTokenValue()).toBe("hello");
	});

	it("getTokenLength returns the span of the current token", () => {
		const scanner = createScanner("hello");
		scanner.scan();
		expect(scanner.getTokenLength()).toBe(5);
	});

	it("getTokenOffset returns zero-based char offset", () => {
		const scanner = createScanner("foo: bar");
		// First token is block-map-start (zero-width) at offset 0
		scanner.scan();
		expect(scanner.getTokenOffset()).toBe(0);
	});

	it("getTokenLine and getTokenColumn return position info", () => {
		const scanner = createScanner("foo: bar");
		// Advance past block-map-start to the scalar "foo"
		let kind = scanner.scan();
		while (kind !== null && kind !== "scalar") {
			kind = scanner.scan();
		}
		expect(scanner.getTokenLine()).toBe(0);
		expect(scanner.getTokenColumn()).toBe(0);
	});

	it("getPosition advances as tokens are consumed", () => {
		const scanner = createScanner("ab");
		expect(scanner.getPosition()).toBe(0);
		scanner.scan(); // scalar "ab"
		expect(scanner.getPosition()).toBe(2);
	});

	it("returns null kind and empty accessors before any scan", () => {
		const scanner = createScanner("hello");
		expect(scanner.getToken()).toBeNull();
		expect(scanner.getTokenValue()).toBe("");
		expect(scanner.getTokenOffset()).toBe(0);
		expect(scanner.getTokenLength()).toBe(0);
		expect(scanner.getTokenLine()).toBe(0);
		expect(scanner.getTokenColumn()).toBe(0);
	});
});

// ===========================================================================
// Token sequence parity with lex()
// ===========================================================================

describe("token sequence parity with lex()", () => {
	function scanAll(text: string) {
		const scanner = createScanner(text);
		const tokens: Array<{ kind: string; value: string; offset: number; length: number }> = [];
		let kind = scanner.scan();
		while (kind !== null) {
			tokens.push({
				kind,
				value: scanner.getTokenValue(),
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			});
			kind = scanner.scan();
		}
		return tokens;
	}

	it("produces same token kinds and values as lexAll for a simple scalar", () => {
		const text = "hello";
		const fromLex = runLexAll(text).map((t) => ({ kind: t.kind, value: t.value, offset: t.offset, length: t.length }));
		const fromScanner = scanAll(text);
		expect(fromScanner).toEqual(fromLex);
	});

	it("produces same token sequence as lexAll for a key-value pair", () => {
		const text = "key: value";
		const fromLex = runLexAll(text).map((t) => ({ kind: t.kind, value: t.value, offset: t.offset, length: t.length }));
		const fromScanner = scanAll(text);
		expect(fromScanner).toEqual(fromLex);
	});

	it("produces same token sequence as lexAll for a multi-key block map", () => {
		const text = "a: 1\nb: 2\n";
		const fromLex = runLexAll(text).map((t) => ({ kind: t.kind, value: t.value, offset: t.offset, length: t.length }));
		const fromScanner = scanAll(text);
		expect(fromScanner).toEqual(fromLex);
	});

	it("produces same token sequence as lexAll for a block sequence", () => {
		const text = "- one\n- two\n";
		const fromLex = runLexAll(text).map((t) => ({ kind: t.kind, value: t.value, offset: t.offset, length: t.length }));
		const fromScanner = scanAll(text);
		expect(fromScanner).toEqual(fromLex);
	});

	it("produces same token sequence as lexAll for a flow map", () => {
		const text = "{a: 1, b: 2}";
		const fromLex = runLexAll(text).map((t) => ({ kind: t.kind, value: t.value, offset: t.offset, length: t.length }));
		const fromScanner = scanAll(text);
		expect(fromScanner).toEqual(fromLex);
	});
});

// ===========================================================================
// setPosition
// ===========================================================================

describe("setPosition", () => {
	it("re-scans from the given offset", () => {
		// "foo: bar" — after consuming all tokens, seek back to 0 and re-scan
		const scanner = createScanner("foo: bar");
		let kind = scanner.scan();
		while (kind !== null) {
			kind = scanner.scan();
		}
		scanner.setPosition(0);
		expect(scanner.getPosition()).toBe(0);
		expect(scanner.getToken()).toBeNull();

		// Re-scanning should yield the same first meaningful token
		kind = scanner.scan();
		// First token after reset is block-map-start (zero-width) or scalar
		expect(kind).not.toBeNull();
	});

	it("can seek to mid-document position", () => {
		// "key: val" — 'v' is at offset 5
		const text = "key: val";
		const scanner = createScanner(text);
		scanner.setPosition(5);
		expect(scanner.getPosition()).toBe(5);
		const kind = scanner.scan();
		expect(kind).toBe("scalar");
		expect(scanner.getTokenValue()).toBe("val");
		expect(scanner.getTokenOffset()).toBe(5);
	});

	it("resets currentToken to null after setPosition", () => {
		const scanner = createScanner("hello");
		scanner.scan();
		expect(scanner.getToken()).toBe("scalar");
		scanner.setPosition(0);
		expect(scanner.getToken()).toBeNull();
	});

	it("correctly tracks line/col after seeking to a second line", () => {
		const text = "a: 1\nb: 2";
		// "b" starts at offset 5
		const scanner = createScanner(text);
		scanner.setPosition(5);
		// Scan the block-map-start (zero-width) then the scalar "b"
		let kind = scanner.scan();
		// Skip any block-map-start tokens
		while (kind === "block-map-start") {
			kind = scanner.scan();
		}
		expect(kind).toBe("scalar");
		expect(scanner.getTokenLine()).toBe(1);
		expect(scanner.getTokenColumn()).toBe(0);
	});
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe("edge cases", () => {
	it("handles empty input — scan returns null immediately", () => {
		const scanner = createScanner("");
		expect(scanner.scan()).toBeNull();
		expect(scanner.getToken()).toBeNull();
	});

	it("handles BOM at start of input", () => {
		const scanner = createScanner("\uFEFFhello");
		const kind = scanner.scan();
		expect(kind).toBe("byte-order-mark");
		expect(scanner.getTokenValue()).toBe("\uFEFF");
		expect(scanner.getTokenOffset()).toBe(0);
		expect(scanner.getTokenLength()).toBe(1);
	});

	it("handles YAML directives", () => {
		const scanner = createScanner("%YAML 1.2\n---\nhello");
		const kind = scanner.scan();
		expect(kind).toBe("directive");
		expect(scanner.getTokenValue()).toBe("%YAML 1.2");
	});

	it("handles a document-start marker", () => {
		const scanner = createScanner("---\nhello");
		const kind = scanner.scan();
		expect(kind).toBe("document-start");
		expect(scanner.getTokenValue()).toBe("---");
	});

	it("handles a document-end marker", () => {
		const scanner = createScanner("hello\n...");
		const kinds: string[] = [];
		let kind = scanner.scan();
		while (kind !== null) {
			kinds.push(kind);
			kind = scanner.scan();
		}
		expect(kinds).toContain("document-end");
	});

	it("getTokenLength equals value length for plain scalars", () => {
		const scanner = createScanner("hello");
		scanner.scan();
		expect(scanner.getTokenLength()).toBe(scanner.getTokenValue().length);
	});

	it("getTokenLength reflects raw span for quoted scalars (includes quotes)", () => {
		const scanner = createScanner('"hello"');
		scanner.scan();
		// value is "hello" (5 chars) but raw span is 7 (including quotes)
		expect(scanner.getTokenValue()).toBe("hello");
		expect(scanner.getTokenLength()).toBe(7);
	});
});
