import { Effect, Option, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
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
	isDocumentStartEvent,
	isMapStartEvent,
	isScalarEvent,
} from "../src/schemas/YamlVisitorEvent.js";
import { visit, visitCollect } from "../src/utils/visitor.js";

describe("YamlVisitorEvent schemas", () => {
	it("creates a ScalarEvent", () => {
		const event = new ScalarEvent({
			path: ["key"],
			depth: 1,
			value: "hello",
			style: "plain",
		});
		expect(event._tag).toBe("ScalarEvent");
		expect(event.value).toBe("hello");
		expect(event.path).toEqual(["key"]);
	});

	it("creates a MapStartEvent with optional tag and anchor", () => {
		const event = new MapStartEvent({
			path: [],
			depth: 0,
			style: "block",
			tag: "!!map",
			anchor: "mymap",
		});
		expect(event._tag).toBe("MapStartEvent");
		expect(event.tag).toBe("!!map");
	});

	it("creates a DocumentStartEvent with directives", () => {
		const event = new DocumentStartEvent({
			path: [],
			depth: 0,
			directives: [],
		});
		expect(event._tag).toBe("DocumentStartEvent");
	});

	it("creates a PairEvent with key and value", () => {
		const event = new PairEvent({
			path: ["obj"],
			depth: 1,
			key: "name",
			value: "world",
		});
		expect(event.key).toBe("name");
		expect(event.value).toBe("world");
	});

	it("type guards work", () => {
		const scalar = new ScalarEvent({
			path: [],
			depth: 0,
			value: 42,
			style: "plain",
		});
		const map = new MapStartEvent({
			path: [],
			depth: 0,
			style: "block",
		});
		expect(isScalarEvent(scalar)).toBe(true);
		expect(isScalarEvent(map)).toBe(false);
		expect(isMapStartEvent(map)).toBe(true);
	});

	it("YamlVisitorEvent union validates all variants", () => {
		const scalar = new ScalarEvent({
			path: [],
			depth: 0,
			value: "x",
			style: "plain",
		});
		const decoded = Schema.decodeSync(YamlVisitorEvent)(scalar);
		expect(decoded._tag).toBe("ScalarEvent");
	});

	it("creates a DocumentEndEvent", () => {
		const event = new DocumentEndEvent({ path: [], depth: 0 });
		expect(event._tag).toBe("DocumentEndEvent");
	});

	it("creates a MapEndEvent", () => {
		const event = new MapEndEvent({ path: ["root"], depth: 1 });
		expect(event._tag).toBe("MapEndEvent");
		expect(event.depth).toBe(1);
	});

	it("creates a SeqStartEvent with optional tag", () => {
		const event = new SeqStartEvent({
			path: [],
			depth: 0,
			style: "flow",
			tag: "!!seq",
		});
		expect(event._tag).toBe("SeqStartEvent");
		expect(event.tag).toBe("!!seq");
	});

	it("creates a SeqEndEvent", () => {
		const event = new SeqEndEvent({ path: [0], depth: 2 });
		expect(event._tag).toBe("SeqEndEvent");
	});

	it("creates an AliasEvent", () => {
		const event = new AliasEvent({ path: [], depth: 0, name: "myanchor" });
		expect(event._tag).toBe("AliasEvent");
		expect(event.name).toBe("myanchor");
	});

	it("creates a CommentEvent", () => {
		const event = new CommentEvent({ path: [], depth: 0, text: "this is a comment" });
		expect(event._tag).toBe("CommentEvent");
		expect(event.text).toBe("this is a comment");
	});

	it("creates a DirectiveEvent", () => {
		const event = new DirectiveEvent({ path: [], depth: 0, name: "YAML", parameters: "1.2" });
		expect(event._tag).toBe("DirectiveEvent");
		expect(event.name).toBe("YAML");
		expect(event.parameters).toBe("1.2");
	});

	it("isDocumentStartEvent type guard works", () => {
		const docStart = new DocumentStartEvent({ path: [], depth: 0, directives: [] });
		const scalar = new ScalarEvent({ path: [], depth: 0, value: "x", style: "plain" });
		expect(isDocumentStartEvent(docStart)).toBe(true);
		expect(isDocumentStartEvent(scalar)).toBe(false);
	});

	it("path accepts mixed string and number segments", () => {
		const event = new ScalarEvent({
			path: ["items", 0, "name"],
			depth: 2,
			value: "foo",
			style: "plain",
		});
		expect(event.path).toEqual(["items", 0, "name"]);
	});
});

describe("visit()", () => {
	it("emits events for a simple mapping", () => {
		const events = Effect.runSync(Stream.runCollect(visit("a: 1\nb: 2")).pipe(Effect.map((c) => [...c])));
		const tags = events.map((e) => e._tag);
		expect(tags).toContain("DocumentStartEvent");
		expect(tags).toContain("MapStartEvent");
		expect(tags).toContain("PairEvent");
		expect(tags).toContain("MapEndEvent");
		expect(tags).toContain("DocumentEndEvent");
	});

	it("emits events for a sequence", () => {
		const events = Effect.runSync(Stream.runCollect(visit("- a\n- b\n- c")).pipe(Effect.map((c) => [...c])));
		const tags = events.map((e) => e._tag);
		expect(tags).toContain("SeqStartEvent");
		expect(tags).toContain("ScalarEvent");
		expect(tags).toContain("SeqEndEvent");
	});

	it("tracks path through nested structures", () => {
		const events = Effect.runSync(Stream.runCollect(visit("obj:\n  key: value")).pipe(Effect.map((c) => [...c])));
		const scalar = events.find((e) => e._tag === "ScalarEvent" && (e as ScalarEvent).value === "value");
		expect(scalar).toBeDefined();
		expect((scalar as ScalarEvent).path).toEqual(["obj", "key"]);
	});

	it("handles multi-document streams", () => {
		const events = Effect.runSync(Stream.runCollect(visit("---\na: 1\n---\nb: 2")).pipe(Effect.map((c) => [...c])));
		const docStarts = events.filter((e) => e._tag === "DocumentStartEvent");
		expect(docStarts.length).toBe(2);
	});

	it("emits AliasEvent for aliases", () => {
		const events = Effect.runSync(Stream.runCollect(visit("a: &ref value\nb: *ref")).pipe(Effect.map((c) => [...c])));
		const alias = events.find((e) => e._tag === "AliasEvent");
		expect(alias).toBeDefined();
		expect((alias as AliasEvent).name).toBe("ref");
	});

	it("emits DirectiveEvent for YAML directives", () => {
		const events = Effect.runSync(Stream.runCollect(visit("%YAML 1.2\n---\na: 1")).pipe(Effect.map((c) => [...c])));
		const directive = events.find((e) => e._tag === "DirectiveEvent");
		expect(directive).toBeDefined();
		expect((directive as DirectiveEvent).name).toBe("YAML");
		expect((directive as DirectiveEvent).parameters).toContain("1.2");
	});

	it("emits CommentEvent for scalar with comment", () => {
		const events = Effect.runSync(Stream.runCollect(visit("key: value # my comment")).pipe(Effect.map((c) => [...c])));
		const comments = events.filter((e) => e._tag === "CommentEvent");
		expect(comments.length).toBeGreaterThanOrEqual(1);
	});

	it("emits CommentEvent for map with comment", () => {
		const yaml = "# map comment\nkey: value\n";
		const events = Effect.runSync(Stream.runCollect(visit(yaml)).pipe(Effect.map((c) => [...c])));
		const comments = events.filter((e) => e._tag === "CommentEvent");
		expect(comments.length).toBeGreaterThanOrEqual(1);
	});

	it("emits ScalarEvent with tag when node has tag", () => {
		const yaml = "key: !!str 42\n";
		const events = Effect.runSync(Stream.runCollect(visit(yaml)).pipe(Effect.map((c) => [...c])));
		const scalar = events.find((e) => e._tag === "ScalarEvent" && (e as ScalarEvent).tag !== undefined);
		expect(scalar).toBeDefined();
	});

	it("emits ScalarEvent with anchor when node has anchor", () => {
		const yaml = "key: &ref value\n";
		const events = Effect.runSync(Stream.runCollect(visit(yaml)).pipe(Effect.map((c) => [...c])));
		const scalar = events.find((e) => e._tag === "ScalarEvent" && (e as ScalarEvent).anchor !== undefined);
		expect(scalar).toBeDefined();
	});

	it("emits PairEvent with null value for complex value", () => {
		const yaml = "outer:\n  inner: value\n";
		const events = Effect.runSync(Stream.runCollect(visit(yaml)).pipe(Effect.map((c) => [...c])));
		const pairs = events.filter((e) => e._tag === "PairEvent");
		// "outer" pair has a map value, so PairEvent.value should be null
		const outerPair = pairs.find((e) => (e as PairEvent).key === "outer");
		expect(outerPair).toBeDefined();
		expect((outerPair as PairEvent).value).toBeNull();
	});

	it("emits SeqStartEvent with tag when seq has tag", () => {
		const yaml = "!!set\n- a\n- b\n";
		const events = Effect.runSync(Stream.runCollect(visit(yaml)).pipe(Effect.map((c) => [...c])));
		const seqStart = events.find((e) => e._tag === "SeqStartEvent");
		expect(seqStart).toBeDefined();
	});

	it("handles null pair value (no value after key)", () => {
		const yaml = "key:\n";
		const events = Effect.runSync(Stream.runCollect(visit(yaml)).pipe(Effect.map((c) => [...c])));
		const pair = events.find((e) => e._tag === "PairEvent");
		expect(pair).toBeDefined();
	});

	it("supports early termination via Stream.take", () => {
		const events = Effect.runSync(
			Stream.runCollect(visit("a: 1\nb: 2\nc: 3").pipe(Stream.take(3))).pipe(Effect.map((c) => [...c])),
		);
		expect(events.length).toBe(3);
	});
});

describe("visitCollect()", () => {
	it("collects matching events with Option predicate", () => {
		const scalars = Effect.runSync(
			visitCollect("a: 1\nb: hello", (e) =>
				e._tag === "ScalarEvent" ? Option.some((e as ScalarEvent).value) : Option.none(),
			),
		);
		expect(scalars).toContain(1);
		expect(scalars).toContain("hello");
	});

	it("collects transformed values", () => {
		const keys = Effect.runSync(
			visitCollect("name: John\nage: 30", (e) =>
				e._tag === "PairEvent" ? Option.some((e as PairEvent).key) : Option.none(),
			),
		);
		expect(keys).toEqual(["name", "age"]);
	});

	it("returns empty array when no events match", () => {
		const result = Effect.runSync(visitCollect("a: 1", (_e) => Option.none()));
		expect(result).toEqual([]);
	});
});
