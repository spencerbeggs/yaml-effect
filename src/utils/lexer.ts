/**
 * YAML 1.2 lexer — tokenizes raw YAML text into a stream of {@link YamlToken} values.
 *
 * This is the only mutable module in the pipeline: the scanner uses imperative
 * character-by-character scanning with position tracking.
 *
 * @packageDocumentation
 */

import { Effect, Option, Stream } from "effect";
import type { YamlTokenKind } from "../schemas/YamlToken.js";
import { YamlToken } from "../schemas/YamlToken.js";

// ---------------------------------------------------------------------------
// Scanner (mutable, imperative)
// ---------------------------------------------------------------------------

/**
 * A stateful YAML scanner that produces tokens one at a time.
 *
 * Provides a pull-based accessor API: call {@link YamlScanner.scan} to advance
 * to the next token, then use the `getToken*` methods to inspect the current
 * token without advancing again.
 *
 * @public
 */
export interface YamlScanner {
	/** Advance to the next token and return its kind, or `null` at end-of-input. */
	scan(): YamlTokenKind | null;
	/** Return the kind of the current token without advancing, or `null` before any scan. */
	getToken(): YamlTokenKind | null;
	/** Return the value string of the current token. */
	getTokenValue(): string;
	/** Return the zero-based character offset of the current token start. */
	getTokenOffset(): number;
	/** Return the character length of the current token span. */
	getTokenLength(): number;
	/** Return the zero-based line number of the current token start. */
	getTokenLine(): number;
	/** Return the zero-based column of the current token start. */
	getTokenColumn(): number;
	/** Return the current scanner position (next character to be scanned). */
	getPosition(): number;
	/**
	 * Reset the scanner to the given character offset and rescan from there.
	 *
	 * @remarks
	 * All block-structure state (indentation, flow depth, pending tokens) is
	 * reset. For reliable results, pass an offset previously returned by
	 * {@link getTokenOffset} rather than an arbitrary mid-token position.
	 */
	setPosition(pos: number): void;
}

/**
 * Create a new YAML scanner for the given source text.
 *
 * @public
 */
export function createScanner(text: string): YamlScanner {
	let pos = 0;
	let line = 0;
	let col = 0;
	/**
	 * The indentation level of the current line. Set to `col` when we encounter
	 * the first non-whitespace character after a newline (or at start of input).
	 */
	let lineIndent = 0;
	/** Whether `lineIndent` has been locked (set) for the current line. */
	let lineIndentLocked = false;
	/** Flow nesting depth (positive means we are inside flow context). */
	let flowDepth = 0;
	/** Whether we've emitted block-map-start / block-seq-start for the current indent. */
	const blockStarted: Map<number, "map" | "seq"> = new Map();
	/** Buffer of tokens to emit before scanning the next real token. */
	const pending: YamlToken[] = [];
	/** Mutable holder for the most recently produced token, set by the public {@link scan} method. */
	const state = { currentToken: null as YamlToken | null };

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	function peek(offset = 0): string {
		const idx = pos + offset;
		return idx < text.length ? (text[idx] ?? "") : "";
	}

	function charAt(i: number): string {
		return i < text.length ? (text[i] ?? "") : "";
	}

	function advance(count = 1): void {
		for (let i = 0; i < count; i++) {
			if (pos < text.length) {
				if (text[pos] === "\n") {
					line++;
					col = 0;
					lineIndentLocked = false;
				} else {
					col++;
				}
				pos++;
			}
		}
	}

	/** Lock the line indent to the current column (called on first non-ws char). */
	function lockLineIndent(): void {
		if (!lineIndentLocked) {
			lineIndent = col;
			lineIndentLocked = true;
			// When dedenting, clear blockStarted entries for indentation levels
			// deeper than the current line. This allows the same indent level
			// to start a new block scope after returning from deeper nesting.
			for (const key of blockStarted.keys()) {
				if (key > lineIndent) {
					blockStarted.delete(key);
				}
			}
		}
	}

	function makeToken(
		kind: YamlTokenKind,
		value: string,
		offset: number,
		tokenLine: number,
		tokenCol: number,
		rawLength?: number,
	): YamlToken {
		return new YamlToken({
			kind,
			value,
			offset,
			length: rawLength ?? value.length,
			line: tokenLine,
			column: tokenCol,
		});
	}

	function isWhitespace(ch: string): boolean {
		return ch === " " || ch === "\t";
	}

	function isNewline(ch: string): boolean {
		return ch === "\n" || ch === "\r";
	}

	function isFlowIndicator(ch: string): boolean {
		return ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === ",";
	}

	/**
	 * Returns true if `ch` cannot appear in a plain scalar at the current position.
	 */
	function isPlainScalarBreak(ch: string): boolean {
		if (ch === "" || isNewline(ch)) return true;
		if (flowDepth > 0 && isFlowIndicator(ch)) return true;
		return false;
	}

	// -----------------------------------------------------------------------
	// Block-structure helpers
	// -----------------------------------------------------------------------

	function ensureBlockMap(indent: number, offset: number, tokLine: number, _tokCol: number): void {
		if (flowDepth > 0) return;
		const started = blockStarted.get(indent);
		if (started === "map") return;
		if (started === "seq") {
			// switch from seq to map not supported in same indent; ignore
			return;
		}
		blockStarted.set(indent, "map");
		// Use `indent` (the line indent) as the column for the zero-width
		// block-map-start marker so the parser can correctly determine which
		// block scope this mapping belongs to.
		pending.push(makeToken("block-map-start", "", offset, tokLine, indent));
	}

	function ensureBlockSeq(indent: number, offset: number, tokLine: number, _tokCol: number): void {
		if (flowDepth > 0) return;
		const started = blockStarted.get(indent);
		if (started === "seq") return;
		blockStarted.set(indent, "seq");
		// Use `indent` as the column for consistency with ensureBlockMap.
		pending.push(makeToken("block-seq-start", "", offset, tokLine, indent));
	}

	// -----------------------------------------------------------------------
	// Scanning methods
	// -----------------------------------------------------------------------

	function scanNewline(): YamlToken {
		const start = pos;
		const sLine = line;
		const sCol = col;
		if (peek() === "\r" && peek(1) === "\n") {
			advance(2);
			return makeToken("newline", "\r\n", start, sLine, sCol);
		}
		const ch = peek();
		advance();
		return makeToken("newline", ch, start, sLine, sCol);
	}

	function scanWhitespace(): YamlToken {
		const start = pos;
		const sLine = line;
		const sCol = col;
		// YAML 1.2 §6.1: Tabs are not allowed as indentation characters.
		// Detect tabs in leading whitespace (before lineIndent is locked).
		if (!lineIndentLocked && peek() === "\t") {
			while (pos < text.length && isWhitespace(peek())) {
				advance();
			}
			return makeToken("error", text.slice(start, pos), start, sLine, sCol);
		}
		while (pos < text.length && isWhitespace(peek())) {
			advance();
		}
		return makeToken("whitespace", text.slice(start, pos), start, sLine, sCol);
	}

	function scanComment(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		while (pos < text.length && !isNewline(peek())) {
			advance();
		}
		return makeToken("comment", text.slice(start, pos), start, sLine, sCol);
	}

	function scanDocumentStartOrEnd(): YamlToken | null {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		const marker = text.slice(pos, pos + 3);
		// Must be exactly 3 chars followed by EOF, newline, or whitespace
		const after = charAt(pos + 3);
		if (after !== "" && !isNewline(after) && !isWhitespace(after)) {
			return null; // not a document marker, treat as plain scalar
		}
		advance(3);
		const kind = marker === "---" ? "document-start" : "document-end";
		return makeToken(kind, marker, start, sLine, sCol);
	}

	function scanPlainScalar(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;

		while (pos < text.length) {
			const ch = peek();
			if (isPlainScalarBreak(ch)) break;

			// `: ` or `:\n` or `:EOF` ends a plain scalar key
			if (
				ch === ":" &&
				(isWhitespace(peek(1)) || isNewline(peek(1)) || peek(1) === "" || (flowDepth > 0 && isFlowIndicator(peek(1))))
			) {
				break;
			}

			// ` #` starts a comment
			if (ch === " " && peek(1) === "#") {
				break;
			}

			// `\t#` also starts a comment
			if (ch === "\t" && peek(1) === "#") {
				break;
			}

			advance();
		}

		// Trim trailing whitespace from plain scalar value
		let end = pos;
		while (end > start && isWhitespace(text[end - 1] ?? "")) {
			end--;
		}

		const value = text.slice(start, end);
		return makeToken("scalar", value, start, sLine, sCol);
	}

	function scanSingleQuotedScalar(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		advance(); // skip opening quote
		let value = "";

		while (pos < text.length) {
			const ch = peek();
			if (ch === "'") {
				if (peek(1) === "'") {
					// escaped single quote
					value += "'";
					advance(2);
				} else {
					// end of string
					advance();
					return makeToken("scalar", value, start, sLine, sCol, pos - start);
				}
			} else if (ch === "\n") {
				// multi-line: newline becomes space (fold)
				value += " ";
				advance();
			} else if (ch === "\r" && peek(1) === "\n") {
				value += " ";
				advance(2);
			} else {
				value += ch;
				advance();
			}
		}

		// Unterminated — emit error token
		return makeToken("error", text.slice(start, pos), start, sLine, sCol);
	}

	function scanDoubleQuotedScalar(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		advance(); // skip opening quote
		let value = "";

		while (pos < text.length) {
			const ch = peek();
			if (ch === '"') {
				advance();
				return makeToken("scalar", value, start, sLine, sCol, pos - start);
			}
			if (ch === "\\") {
				advance(); // skip backslash
				const esc = peek();
				switch (esc) {
					case "\\":
						value += "\\";
						advance();
						break;
					case '"':
						value += '"';
						advance();
						break;
					case "/":
						value += "/";
						advance();
						break;
					case "b":
						value += "\b";
						advance();
						break;
					case "f":
						value += "\f";
						advance();
						break;
					case "n":
						value += "\n";
						advance();
						break;
					case "r":
						value += "\r";
						advance();
						break;
					case "t":
						value += "\t";
						advance();
						break;
					case "0":
						value += "\0";
						advance();
						break;
					case "a":
						value += "\x07";
						advance();
						break;
					case "e":
						value += "\x1B";
						advance();
						break;
					case "v":
						value += "\x0B";
						advance();
						break;
					case " ":
						value += " ";
						advance();
						break;
					case "N":
						value += "\u0085";
						advance();
						break;
					case "_":
						value += "\u00A0";
						advance();
						break;
					case "L":
						value += "\u2028";
						advance();
						break;
					case "P":
						value += "\u2029";
						advance();
						break;
					case "x": {
						advance(); // skip 'x'
						const hex = text.slice(pos, pos + 2);
						if (hex.length === 2 && /^[\da-fA-F]{2}$/.test(hex)) {
							value += String.fromCharCode(Number.parseInt(hex, 16));
							advance(2);
						} else {
							// Invalid escape — emit error token
							return makeToken("error", text.slice(start, pos), start, sLine, sCol);
						}
						break;
					}
					case "u": {
						advance(); // skip 'u'
						const hex = text.slice(pos, pos + 4);
						if (hex.length === 4 && /^[\da-fA-F]{4}$/.test(hex)) {
							value += String.fromCodePoint(Number.parseInt(hex, 16));
							advance(4);
						} else {
							return makeToken("error", text.slice(start, pos), start, sLine, sCol);
						}
						break;
					}
					case "U": {
						advance(); // skip 'U'
						const hex = text.slice(pos, pos + 8);
						if (hex.length === 8 && /^[\da-fA-F]{8}$/.test(hex)) {
							value += String.fromCodePoint(Number.parseInt(hex, 16));
							advance(8);
						} else {
							return makeToken("error", text.slice(start, pos), start, sLine, sCol);
						}
						break;
					}
					case "\n": {
						// line continuation
						advance();
						// skip leading whitespace on next line
						while (pos < text.length && isWhitespace(peek())) {
							advance();
						}
						break;
					}
					case "\r": {
						advance();
						if (peek() === "\n") advance();
						while (pos < text.length && isWhitespace(peek())) {
							advance();
						}
						break;
					}
					default:
						// Invalid escape sequence — emit error token
						return makeToken("error", text.slice(start, pos), start, sLine, sCol);
				}
			} else if (ch === "\n") {
				value += " ";
				advance();
			} else if (ch === "\r" && peek(1) === "\n") {
				value += " ";
				advance(2);
			} else {
				value += ch;
				advance();
			}
		}

		// Unterminated string
		return makeToken("error", text.slice(start, pos), start, sLine, sCol);
	}

	function scanBlockScalar(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		const indicator = peek(); // '|' or '>'
		const isFolded = indicator === ">";
		advance();

		// Parse header: optional chomping and/or indentation indicator
		let chomp: "clip" | "strip" | "keep" = "clip";
		let explicitIndent = 0;

		// Parse header characters
		for (let hc = 0; hc < 2 && pos < text.length && !isNewline(peek()); hc++) {
			const ch = peek();
			if (ch === "-") {
				chomp = "strip";
				advance();
			} else if (ch === "+") {
				chomp = "keep";
				advance();
			} else if (ch >= "1" && ch <= "9") {
				explicitIndent = Number.parseInt(ch, 10);
				advance();
			} else {
				break;
			}
		}

		// Skip any trailing whitespace or comment on header line
		while (pos < text.length && isWhitespace(peek())) {
			advance();
		}
		if (pos < text.length && peek() === "#") {
			while (pos < text.length && !isNewline(peek())) {
				advance();
			}
		}

		// Consume the newline after header
		if (pos < text.length && isNewline(peek())) {
			if (peek() === "\r" && peek(1) === "\n") {
				advance(2);
			} else {
				advance();
			}
		}

		// Determine content indentation
		let contentIndent = explicitIndent;
		if (contentIndent === 0) {
			// Auto-detect from first non-empty line
			let scanAhead = pos;
			while (scanAhead < text.length) {
				// Count spaces at start of this line
				let spaces = 0;
				while (scanAhead < text.length && text[scanAhead] === " ") {
					spaces++;
					scanAhead++;
				}
				// If this is a blank line, skip it
				if (scanAhead >= text.length || text[scanAhead] === "\n" || text[scanAhead] === "\r") {
					if (scanAhead < text.length) {
						scanAhead++; // skip newline
						if (text[scanAhead - 1] === "\r" && scanAhead < text.length && text[scanAhead] === "\n") {
							scanAhead++;
						}
					}
					continue;
				}
				contentIndent = spaces;
				break;
			}
		}

		if (contentIndent === 0) {
			// No content lines found — empty block scalar
			const value = chomp === "keep" ? "\n" : "";
			return makeToken("scalar", value, start, sLine, sCol, pos - start);
		}

		// Collect content lines
		const lines: string[] = [];
		const trailingNewlines: string[] = [];

		while (pos < text.length) {
			// Count leading spaces
			let spaces = 0;
			const lineStart = pos;
			while (pos < text.length && text[pos] === " ") {
				spaces++;
				pos++;
				col++;
			}

			// Check if this is a blank line
			if (pos >= text.length || text[pos] === "\n" || text[pos] === "\r") {
				// Blank line — keep it
				trailingNewlines.push("");
				if (pos < text.length) {
					if (text[pos] === "\r" && pos + 1 < text.length && text[pos + 1] === "\n") {
						pos += 2;
					} else {
						pos++;
					}
					line++;
					col = 0;
				}
				continue;
			}

			// If indentation is less than content indent, we're done
			if (spaces < contentIndent) {
				// Rewind to start of this line
				pos = lineStart;
				col = 0; // approximate
				break;
			}

			// Flush trailing newlines into lines
			for (const nl of trailingNewlines) {
				lines.push(nl);
			}
			trailingNewlines.length = 0;

			// Collect the rest of the line (including extra indentation beyond contentIndent)
			const extra = " ".repeat(spaces - contentIndent);
			const contentStart = pos;
			while (pos < text.length && text[pos] !== "\n" && text[pos] !== "\r") {
				pos++;
				col++;
			}
			lines.push(extra + text.slice(contentStart, pos));

			// Consume newline
			if (pos < text.length) {
				if (text[pos] === "\r" && pos + 1 < text.length && text[pos + 1] === "\n") {
					pos += 2;
				} else {
					pos++;
				}
				line++;
				col = 0;
			}
		}

		// Build the scalar value
		let value: string;
		if (isFolded) {
			// Folded (YAML 1.2 spec section 8.1.1.2): a single line break between
			// non-empty lines becomes a space; empty lines (blank lines in source)
			// become actual newlines (paragraph breaks).
			let result = "";
			for (let i = 0; i < lines.length; i++) {
				const ln = lines[i] ?? "";
				if (ln === "") {
					// Blank line produces a paragraph break
					result += "\n";
				} else if (result.length === 0) {
					// First non-empty line
					result = ln;
				} else {
					const lastChar = result[result.length - 1];
					if (lastChar === "\n") {
						// Previous was a blank line; don't add space
						result += ln;
					} else {
						// Fold: single line break becomes a space
						result += " ";
						result += ln;
					}
				}
			}
			// Apply chomping
			if (chomp === "strip") {
				// no trailing newline
			} else if (chomp === "keep") {
				result += "\n";
				for (const _nl of trailingNewlines) {
					result += "\n";
				}
			} else {
				// clip: single trailing newline
				result += "\n";
			}
			value = result;
		} else {
			// Literal: join lines with newlines
			value = lines.join("\n");
			if (chomp === "strip") {
				// no trailing newline
			} else if (chomp === "keep") {
				value += "\n";
				for (const _nl of trailingNewlines) {
					value += "\n";
				}
			} else {
				// clip: single trailing newline
				value += "\n";
			}
		}

		return makeToken("scalar", value, start, sLine, sCol, pos - start);
	}

	function scanAnchor(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		advance(); // skip '&'
		const nameStart = pos;
		while (
			pos < text.length &&
			!isWhitespace(peek()) &&
			!isNewline(peek()) &&
			!isFlowIndicator(peek()) &&
			peek() !== ":" &&
			peek() !== "#"
		) {
			advance();
		}
		const name = text.slice(nameStart, pos);
		if (name.length === 0) {
			return makeToken("error", text.slice(start, pos), start, sLine, sCol);
		}
		return makeToken("anchor", name, start, sLine, sCol);
	}

	function scanAlias(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		advance(); // skip '*'
		const nameStart = pos;
		while (
			pos < text.length &&
			!isWhitespace(peek()) &&
			!isNewline(peek()) &&
			!isFlowIndicator(peek()) &&
			peek() !== ":" &&
			peek() !== "#"
		) {
			advance();
		}
		const name = text.slice(nameStart, pos);
		if (name.length === 0) {
			return makeToken("error", text.slice(start, pos), start, sLine, sCol);
		}
		return makeToken("alias", name, start, sLine, sCol);
	}

	function scanTag(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		advance(); // skip first '!'

		if (peek() === "<") {
			// Verbatim tag: !<...>
			advance(); // skip '<'
			while (pos < text.length && peek() !== ">") {
				if (isNewline(peek())) {
					return makeToken("error", text.slice(start, pos), start, sLine, sCol);
				}
				advance();
			}
			if (peek() === ">") {
				advance(); // skip '>'
			} else {
				return makeToken("error", text.slice(start, pos), start, sLine, sCol);
			}
			return makeToken("tag", text.slice(start, pos), start, sLine, sCol);
		}

		if (peek() === "!") {
			// Secondary tag handle: !!
			advance();
		}

		// Collect tag suffix
		while (pos < text.length && !isWhitespace(peek()) && !isNewline(peek()) && !isFlowIndicator(peek())) {
			advance();
		}

		return makeToken("tag", text.slice(start, pos), start, sLine, sCol);
	}

	function scanDirective(): YamlToken {
		lockLineIndent();
		const start = pos;
		const sLine = line;
		const sCol = col;
		// Consume the entire line
		while (pos < text.length && !isNewline(peek())) {
			advance();
		}
		return makeToken("directive", text.slice(start, pos), start, sLine, sCol);
	}

	// -----------------------------------------------------------------------
	// Main scan (internal)
	// -----------------------------------------------------------------------

	function scanNext(): YamlToken | null {
		// Drain pending tokens first
		if (pending.length > 0) {
			const next = pending.shift();
			if (next !== undefined) return next;
		}

		if (pos >= text.length) {
			return null;
		}

		const ch = peek();

		// BOM
		if (ch === "\uFEFF") {
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			return makeToken("byte-order-mark", "\uFEFF", start, sLine, sCol);
		}

		// Newlines
		if (isNewline(ch)) {
			return scanNewline();
		}

		// Whitespace
		if (isWhitespace(ch)) {
			return scanWhitespace();
		}

		// Comment (must be at start of line or preceded by whitespace — but here
		// we're already after whitespace has been consumed as a separate token)
		if (ch === "#") {
			return scanComment();
		}

		// Document markers (only at column 0)
		if (col === 0 && ch === "-" && peek(1) === "-" && peek(2) === "-") {
			const marker = scanDocumentStartOrEnd();
			if (marker) return marker;
		}
		if (col === 0 && ch === "." && peek(1) === "." && peek(2) === ".") {
			const marker = scanDocumentStartOrEnd();
			if (marker) return marker;
		}

		// Directive
		if (ch === "%" && col === 0) {
			return scanDirective();
		}

		// Block scalar indicators
		if ((ch === "|" || ch === ">") && flowDepth === 0) {
			// Check if this is truly a block scalar indicator:
			// must be followed by newline, whitespace, chomping/indent, or EOF
			const next = peek(1);
			if (
				next === "" ||
				isNewline(next) ||
				isWhitespace(next) ||
				next === "-" ||
				next === "+" ||
				(next >= "1" && next <= "9") ||
				next === "#"
			) {
				return scanBlockScalar();
			}
		}

		// Flow indicators
		if (ch === "{") {
			lockLineIndent();
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			flowDepth++;
			return makeToken("flow-map-start", "{", start, sLine, sCol);
		}
		if (ch === "}") {
			lockLineIndent();
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			if (flowDepth > 0) flowDepth--;
			return makeToken("flow-map-end", "}", start, sLine, sCol);
		}
		if (ch === "[") {
			lockLineIndent();
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			flowDepth++;
			return makeToken("flow-seq-start", "[", start, sLine, sCol);
		}
		if (ch === "]") {
			lockLineIndent();
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			if (flowDepth > 0) flowDepth--;
			return makeToken("flow-seq-end", "]", start, sLine, sCol);
		}
		if (ch === ",") {
			lockLineIndent();
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			return makeToken("flow-separator", ",", start, sLine, sCol);
		}

		// Anchor
		if (ch === "&") {
			return scanAnchor();
		}

		// Alias
		if (ch === "*") {
			return scanAlias();
		}

		// Tag
		if (ch === "!") {
			return scanTag();
		}

		// Explicit map key
		if (ch === "?" && (isWhitespace(peek(1)) || isNewline(peek(1)) || peek(1) === "")) {
			lockLineIndent();
			const indent = lineIndent;
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			ensureBlockMap(indent, start, sLine, sCol);
			if (pending.length > 0) {
				// block-map-start was pushed, push the key indicator after it
				pending.push(makeToken("block-map-key", "?", start, sLine, sCol));
				const first = pending.shift();
				if (first !== undefined) return first;
			}
			return makeToken("block-map-key", "?", start, sLine, sCol);
		}

		// Block sequence entry
		if (ch === "-" && (isWhitespace(peek(1)) || isNewline(peek(1)) || peek(1) === "") && flowDepth === 0) {
			lockLineIndent();
			const indent = lineIndent;
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			ensureBlockSeq(indent, start, sLine, sCol);
			if (pending.length > 0) {
				// block-seq-start was pushed, push the entry after it
				pending.push(makeToken("block-seq-entry", "-", start, sLine, sCol));
				const first = pending.shift();
				if (first !== undefined) return first;
			}
			return makeToken("block-seq-entry", "-", start, sLine, sCol);
		}

		// Value indicator
		if (
			ch === ":" &&
			(isWhitespace(peek(1)) || isNewline(peek(1)) || peek(1) === "" || (flowDepth > 0 && isFlowIndicator(peek(1))))
		) {
			lockLineIndent();
			const indent = lineIndent;
			const start = pos;
			const sLine = line;
			const sCol = col;
			advance();
			ensureBlockMap(indent, start, sLine, sCol);
			if (pending.length > 0) {
				// block-map-start was pushed, push the value indicator after it
				pending.push(makeToken("block-map-value", ":", start, sLine, sCol));
				const first = pending.shift();
				if (first !== undefined) return first;
			}
			return makeToken("block-map-value", ":", start, sLine, sCol);
		}

		// Quoted scalars
		if (ch === "'") {
			return scanSingleQuotedScalar();
		}
		if (ch === '"') {
			return scanDoubleQuotedScalar();
		}

		// Plain scalar (fallback)
		return scanPlainScalar();
	}

	// -----------------------------------------------------------------------
	// Public scanner interface
	// -----------------------------------------------------------------------

	return {
		scan(): YamlTokenKind | null {
			const token = scanNext();
			state.currentToken = token;
			return token === null ? null : token.kind;
		},
		getToken(): YamlTokenKind | null {
			return state.currentToken === null ? null : state.currentToken.kind;
		},
		getTokenValue(): string {
			return state.currentToken === null ? "" : state.currentToken.value;
		},
		getTokenOffset(): number {
			return state.currentToken === null ? 0 : state.currentToken.offset;
		},
		getTokenLength(): number {
			return state.currentToken === null ? 0 : state.currentToken.length;
		},
		getTokenLine(): number {
			return state.currentToken === null ? 0 : state.currentToken.line;
		},
		getTokenColumn(): number {
			return state.currentToken === null ? 0 : state.currentToken.column;
		},
		getPosition(): number {
			return pos;
		},
		setPosition(newPos: number): void {
			// Recompute line/col by replaying character advances from the start.
			pos = 0;
			line = 0;
			col = 0;
			while (pos < newPos && pos < text.length) {
				if (text[pos] === "\n") {
					line++;
					col = 0;
				} else {
					col++;
				}
				pos++;
			}
			// Reset all mutable scanner state.
			lineIndent = 0;
			lineIndentLocked = false;
			flowDepth = 0;
			blockStarted.clear();
			pending.length = 0;
			state.currentToken = null;
		},
	};
}

// ---------------------------------------------------------------------------
// Stream API
// ---------------------------------------------------------------------------

/**
 * Tokenize a YAML source string into an Effect {@link Stream} of {@link YamlToken}.
 *
 * Lexer errors are embedded as `"error"` tokens in the success channel; the
 * downstream parser/composer will collect them and raise `YamlLexError`
 * if needed.
 *
 * @public
 */
export function lex(text: string): Stream.Stream<YamlToken, never> {
	return Stream.unfold(createScanner(text), (scanner) => {
		const kind = scanner.scan();
		if (kind === null) return Option.none();
		const token = new YamlToken({
			kind,
			value: scanner.getTokenValue(),
			offset: scanner.getTokenOffset(),
			length: scanner.getTokenLength(),
			line: scanner.getTokenLine(),
			column: scanner.getTokenColumn(),
		});
		return Option.some([token, scanner] as const);
	});
}

/**
 * Collect all tokens from a YAML source string into an array.
 * Convenience function for testing.
 *
 * @public
 */
export function lexAll(text: string): Effect.Effect<ReadonlyArray<YamlToken>, never> {
	return Stream.runCollect(lex(text)).pipe(Effect.map((chunk) => [...chunk]));
}
