import { Schema } from "effect";
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
