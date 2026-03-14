import { Effect, Option, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
	CstAliasEvent,
	CstCommentEvent,
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
	isCstDocumentStartEvent,
	isCstErrorEvent,
	isCstKeyEvent,
	isCstMapStartEvent,
	isCstScalarEvent,
	isCstSeqStartEvent,
	isCstValueEvent,
} from "../src/schemas/YamlCstVisitorEvent.js";
import { visitCST, visitCSTCollect } from "../src/utils/cst-visitor.js";

describe("YamlCstVisitorEvent schemas", () => {
	it("creates a CstDocumentStartEvent", () => {
		const event = new CstDocumentStartEvent({ path: [], depth: 0 });
		expect(event._tag).toBe("CstDocumentStartEvent");
		expect(event.depth).toBe(0);
		expect(event.path).toEqual([]);
	});

	it("creates a CstDocumentEndEvent", () => {
		const event = new CstDocumentEndEvent({ path: [], depth: 0 });
		expect(event._tag).toBe("CstDocumentEndEvent");
	});

	it("creates a CstMapStartEvent with source", () => {
		const event = new CstMapStartEvent({ path: [], depth: 0, source: "a: 1" });
		expect(event._tag).toBe("CstMapStartEvent");
		expect(event.source).toBe("a: 1");
	});

	it("creates a CstMapEndEvent", () => {
		const event = new CstMapEndEvent({ path: ["root"], depth: 1 });
		expect(event._tag).toBe("CstMapEndEvent");
		expect(event.depth).toBe(1);
	});

	it("creates a CstSeqStartEvent with source", () => {
		const event = new CstSeqStartEvent({ path: [], depth: 0, source: "- a\n- b" });
		expect(event._tag).toBe("CstSeqStartEvent");
		expect(event.source).toBe("- a\n- b");
	});

	it("creates a CstSeqEndEvent", () => {
		const event = new CstSeqEndEvent({ path: [0], depth: 2 });
		expect(event._tag).toBe("CstSeqEndEvent");
	});

	it("creates a CstKeyEvent with source", () => {
		const event = new CstKeyEvent({ path: [], depth: 1, source: "name" });
		expect(event._tag).toBe("CstKeyEvent");
		expect(event.source).toBe("name");
	});

	it("creates a CstValueEvent with source", () => {
		const event = new CstValueEvent({ path: [], depth: 1, source: "John" });
		expect(event._tag).toBe("CstValueEvent");
		expect(event.source).toBe("John");
	});

	it("creates a CstScalarEvent with raw source text", () => {
		const event = new CstScalarEvent({ path: [0], depth: 1, source: "true" });
		expect(event._tag).toBe("CstScalarEvent");
		// Source is raw — "true" stays as the string "true", not a boolean
		expect(event.source).toBe("true");
	});

	it("creates a CstAliasEvent with source", () => {
		const event = new CstAliasEvent({ path: [], depth: 0, source: "*ref" });
		expect(event._tag).toBe("CstAliasEvent");
		expect(event.source).toBe("*ref");
	});

	it("creates a CstCommentEvent with source", () => {
		const event = new CstCommentEvent({ path: [], depth: 0, source: "# this is a comment" });
		expect(event._tag).toBe("CstCommentEvent");
		expect(event.source).toBe("# this is a comment");
	});

	it("creates a CstErrorEvent with source", () => {
		const event = new CstErrorEvent({ path: [], depth: 0, source: "\t" });
		expect(event._tag).toBe("CstErrorEvent");
	});

	it("type guards work", () => {
		const scalar = new CstScalarEvent({ path: [], depth: 0, source: "foo" });
		const key = new CstKeyEvent({ path: [], depth: 0, source: "bar" });
		const map = new CstMapStartEvent({ path: [], depth: 0, source: "" });
		const seq = new CstSeqStartEvent({ path: [], depth: 0, source: "" });
		const docStart = new CstDocumentStartEvent({ path: [], depth: 0 });
		const err = new CstErrorEvent({ path: [], depth: 0, source: "\t" });

		expect(isCstScalarEvent(scalar)).toBe(true);
		expect(isCstScalarEvent(key)).toBe(false);
		expect(isCstKeyEvent(key)).toBe(true);
		expect(isCstKeyEvent(scalar)).toBe(false);
		expect(isCstMapStartEvent(map)).toBe(true);
		expect(isCstSeqStartEvent(seq)).toBe(true);
		expect(isCstDocumentStartEvent(docStart)).toBe(true);
		expect(isCstErrorEvent(err)).toBe(true);
		expect(isCstValueEvent(new CstValueEvent({ path: [], depth: 0, source: "x" }))).toBe(true);
	});

	it("YamlCstVisitorEvent union validates all variants", () => {
		const scalar = new CstScalarEvent({ path: [], depth: 0, source: "x" });
		const decoded = Schema.decodeSync(YamlCstVisitorEvent)(scalar);
		expect(decoded._tag).toBe("CstScalarEvent");
	});

	it("path accepts mixed string and number segments", () => {
		const event = new CstKeyEvent({ path: ["items", 0, "name"], depth: 2, source: "key" });
		expect(event.path).toEqual(["items", 0, "name"]);
	});
});

describe("visitCST()", () => {
	it("emits events for a simple mapping", () => {
		const events = Effect.runSync(Stream.runCollect(visitCST("a: 1\nb: 2")).pipe(Effect.map((c) => [...c])));
		const tags = events.map((e) => e._tag);
		expect(tags).toContain("CstDocumentStartEvent");
		expect(tags).toContain("CstMapStartEvent");
		expect(tags).toContain("CstKeyEvent");
		expect(tags).toContain("CstValueEvent");
		expect(tags).toContain("CstMapEndEvent");
		expect(tags).toContain("CstDocumentEndEvent");
	});

	it("emits CstKeyEvent and CstValueEvent for mappings", () => {
		const events = Effect.runSync(Stream.runCollect(visitCST("name: John\nage: 30")).pipe(Effect.map((c) => [...c])));

		const keys = events.filter(isCstKeyEvent).map((e) => e.source);
		const values = events.filter(isCstValueEvent).map((e) => e.source);

		expect(keys).toContain("name");
		expect(keys).toContain("age");
		expect(values).toContain("John");
		expect(values).toContain("30");
	});

	it("emits CstScalarEvent with raw source text for sequences", () => {
		const events = Effect.runSync(Stream.runCollect(visitCST("- true\n- 42\n- hello")).pipe(Effect.map((c) => [...c])));

		const scalars = events.filter(isCstScalarEvent).map((e) => e.source);
		// Raw source — no type resolution
		expect(scalars).toContain("true");
		expect(scalars).toContain("42");
		expect(scalars).toContain("hello");
	});

	it("emits CstSeqStartEvent and CstSeqEndEvent for sequences", () => {
		const events = Effect.runSync(Stream.runCollect(visitCST("- a\n- b\n- c")).pipe(Effect.map((c) => [...c])));
		const tags = events.map((e) => e._tag);
		expect(tags).toContain("CstSeqStartEvent");
		expect(tags).toContain("CstScalarEvent");
		expect(tags).toContain("CstSeqEndEvent");
	});

	it("emits CstDocumentStartEvent and CstDocumentEndEvent", () => {
		const events = Effect.runSync(Stream.runCollect(visitCST("a: 1")).pipe(Effect.map((c) => [...c])));
		const first = events[0];
		const last = events[events.length - 1];
		expect(first?._tag).toBe("CstDocumentStartEvent");
		expect(last?._tag).toBe("CstDocumentEndEvent");
	});

	it("handles multi-document streams", () => {
		const events = Effect.runSync(Stream.runCollect(visitCST("---\na: 1\n---\nb: 2")).pipe(Effect.map((c) => [...c])));
		const docStarts = events.filter((e) => e._tag === "CstDocumentStartEvent");
		expect(docStarts.length).toBe(2);
	});

	it("emits CstCommentEvent for comments", () => {
		const events = Effect.runSync(Stream.runCollect(visitCST("# top comment\na: 1")).pipe(Effect.map((c) => [...c])));
		const comment = events.find((e) => e._tag === "CstCommentEvent");
		expect(comment).toBeDefined();
	});

	it("emits CstAliasEvent for aliases", () => {
		const events = Effect.runSync(
			Stream.runCollect(visitCST("a: &ref value\nb: *ref")).pipe(Effect.map((c) => [...c])),
		);
		const alias = events.find((e) => e._tag === "CstAliasEvent");
		expect(alias).toBeDefined();
		// The CST alias node source starts with "*" — the exact length reflects
		// the lexer's raw token span for the alias reference.
		expect((alias as CstAliasEvent).source).toMatch(/^\*/);
	});

	it("emits CstErrorEvent for error nodes", () => {
		// Tab indentation in a block mapping triggers an error node in the CST
		const events = Effect.runSync(Stream.runCollect(visitCST("key:\n\tvalue: 1")).pipe(Effect.map((c) => [...c])));
		const errors = events.filter(isCstErrorEvent);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("error channel is never (no exceptions thrown)", () => {
		// Verify the stream can be run synchronously — if error channel were
		// not `never`, Effect.runSync would require no error possibility.
		expect(() => {
			Effect.runSync(Stream.runCollect(visitCST("a: 1")));
		}).not.toThrow();
	});

	it("supports early termination via Stream.take", () => {
		const events = Effect.runSync(
			Stream.runCollect(visitCST("a: 1\nb: 2\nc: 3").pipe(Stream.take(3))).pipe(Effect.map((c) => [...c])),
		);
		expect(events.length).toBe(3);
	});
});

describe("visitCSTCollect()", () => {
	it("collects matching CST events with Option predicate", () => {
		const keys = Effect.runSync(
			visitCSTCollect("name: John\nage: 30", (e) =>
				e._tag === "CstKeyEvent" ? Option.some((e as CstKeyEvent).source) : Option.none(),
			),
		);
		expect(keys).toContain("name");
		expect(keys).toContain("age");
	});

	it("collects CstScalarEvent sources from a sequence", () => {
		const sources = Effect.runSync(
			visitCSTCollect("- true\n- 42", (e) =>
				e._tag === "CstScalarEvent" ? Option.some((e as CstScalarEvent).source) : Option.none(),
			),
		);
		expect(sources).toContain("true");
		expect(sources).toContain("42");
	});

	it("returns empty array when no events match", () => {
		const result = Effect.runSync(visitCSTCollect("a: 1", (_e) => Option.none()));
		expect(result).toEqual([]);
	});

	it("collects CstValueEvent sources", () => {
		const values = Effect.runSync(
			visitCSTCollect("x: hello\ny: world", (e) =>
				e._tag === "CstValueEvent" ? Option.some((e as CstValueEvent).source) : Option.none(),
			),
		);
		expect(values).toContain("hello");
		expect(values).toContain("world");
	});
});
