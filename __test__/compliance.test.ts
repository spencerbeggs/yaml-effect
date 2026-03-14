/**
 * YAML 1.2 Core Schema compliance tests.
 *
 * Exercises the full parse pipeline end-to-end with realistic YAML documents
 * covering all major YAML 1.2 features and Core Schema type resolution.
 *
 * @packageDocumentation
 */

import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { parse, parseAllDocuments, stringify } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function val(text: string): unknown {
	return Effect.runSync(parse(text));
}

function fails(text: string, options?: { strict?: boolean; maxAliasCount?: number; uniqueKeys?: boolean }): boolean {
	const result = Effect.runSync(Effect.either(parse(text, options)));
	return Either.isLeft(result);
}

// ===========================================================================
// 1. Basic structures
// ===========================================================================

describe("YAML 1.2 compliance: basic structures", () => {
	it("parses key-value mappings", () => {
		expect(val("name: John\nage: 30")).toEqual({ name: "John", age: 30 });
	});

	it("parses sequences", () => {
		expect(val("- apple\n- banana\n- cherry")).toEqual(["apple", "banana", "cherry"]);
	});

	it("parses nested mappings", () => {
		const yaml = "person:\n  name: Alice\n  address:\n    city: Portland";
		expect(val(yaml)).toEqual({
			person: { name: "Alice", address: { city: "Portland" } },
		});
	});

	it("parses nested sequences", () => {
		const yaml = "- - 1\n  - 2\n- - 3\n  - 4";
		expect(val(yaml)).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("parses mapping with sequence values", () => {
		const yaml = "fruits:\n  - apple\n  - banana\ncolors:\n  - red\n  - blue";
		expect(val(yaml)).toEqual({
			fruits: ["apple", "banana"],
			colors: ["red", "blue"],
		});
	});

	it("parses sequence of mappings", () => {
		const yaml = "- name: Alice\n  age: 30\n- name: Bob\n  age: 25";
		expect(val(yaml)).toEqual([
			{ name: "Alice", age: 30 },
			{ name: "Bob", age: 25 },
		]);
	});

	it("parses empty document as null", () => {
		expect(val("")).toBe(null);
	});

	it("parses document with only comments as null", () => {
		expect(val("# just a comment")).toBe(null);
	});
});

// ===========================================================================
// 2. Scalar type resolution (Core Schema)
// ===========================================================================

describe("YAML 1.2 compliance: scalar type resolution", () => {
	describe("null values", () => {
		it("resolves null keyword", () => {
			expect(val("value: null")).toEqual({ value: null });
		});

		it("resolves Null keyword", () => {
			expect(val("value: Null")).toEqual({ value: null });
		});

		it("resolves NULL keyword", () => {
			expect(val("value: NULL")).toEqual({ value: null });
		});

		it("resolves tilde as null", () => {
			expect(val("value: ~")).toEqual({ value: null });
		});

		it("resolves empty value as null", () => {
			expect(val("value:")).toEqual({ value: null });
		});
	});

	describe("boolean values", () => {
		it("resolves true", () => {
			expect(val("v: true")).toEqual({ v: true });
		});

		it("resolves True", () => {
			expect(val("v: True")).toEqual({ v: true });
		});

		it("resolves TRUE", () => {
			expect(val("v: TRUE")).toEqual({ v: true });
		});

		it("resolves false", () => {
			expect(val("v: false")).toEqual({ v: false });
		});

		it("resolves False", () => {
			expect(val("v: False")).toEqual({ v: false });
		});

		it("resolves FALSE", () => {
			expect(val("v: FALSE")).toEqual({ v: false });
		});
	});

	describe("integer values", () => {
		it("resolves positive decimal integer", () => {
			expect(val("v: 42")).toEqual({ v: 42 });
		});

		it("resolves negative decimal integer", () => {
			expect(val("v: -17")).toEqual({ v: -17 });
		});

		it("resolves zero", () => {
			expect(val("v: 0")).toEqual({ v: 0 });
		});

		it("resolves octal integer (0o prefix)", () => {
			expect(val("v: 0o17")).toEqual({ v: 15 });
		});

		it("resolves hexadecimal integer (0x prefix)", () => {
			expect(val("v: 0xFF")).toEqual({ v: 255 });
		});
	});

	describe("float values", () => {
		it("resolves decimal float", () => {
			expect(val("v: 3.14")).toEqual({ v: 3.14 });
		});

		it("resolves negative float", () => {
			expect(val("v: -0.5")).toEqual({ v: -0.5 });
		});

		it("resolves scientific notation", () => {
			expect(val("v: 1.2e3")).toEqual({ v: 1200 });
		});

		it("resolves .inf as Infinity", () => {
			expect(val("v: .inf")).toEqual({ v: Number.POSITIVE_INFINITY });
		});

		it("resolves .Inf as Infinity", () => {
			expect(val("v: .Inf")).toEqual({ v: Number.POSITIVE_INFINITY });
		});

		it("resolves -.inf as -Infinity", () => {
			expect(val("v: -.inf")).toEqual({ v: Number.NEGATIVE_INFINITY });
		});

		it("resolves .nan as NaN", () => {
			const result = val("v: .nan") as { v: number };
			expect(Number.isNaN(result.v)).toBe(true);
		});

		it("resolves .NaN as NaN", () => {
			const result = val("v: .NaN") as { v: number };
			expect(Number.isNaN(result.v)).toBe(true);
		});

		it("resolves .NAN as NaN", () => {
			const result = val("v: .NAN") as { v: number };
			expect(Number.isNaN(result.v)).toBe(true);
		});
	});

	describe("string values", () => {
		it("resolves plain strings", () => {
			expect(val("v: hello world")).toEqual({ v: "hello world" });
		});

		it("resolves single-quoted strings", () => {
			expect(val("v: 'hello world'")).toEqual({ v: "hello world" });
		});

		it("resolves double-quoted strings", () => {
			expect(val('v: "hello world"')).toEqual({ v: "hello world" });
		});

		it("preserves type as string in single quotes", () => {
			expect(val("v: 'true'")).toEqual({ v: "true" });
		});

		it("preserves type as string in double quotes", () => {
			expect(val('v: "42"')).toEqual({ v: "42" });
		});

		it("preserves null-like as string in quotes", () => {
			expect(val("v: 'null'")).toEqual({ v: "null" });
		});

		it("handles escape sequences in double quotes", () => {
			expect(val('v: "line1\\nline2"')).toEqual({ v: "line1\nline2" });
		});

		it("handles tab escape in double quotes", () => {
			expect(val('v: "col1\\tcol2"')).toEqual({ v: "col1\tcol2" });
		});
	});
});

// ===========================================================================
// 3. Block scalars
// ===========================================================================

describe("YAML 1.2 compliance: block scalars", () => {
	it("parses literal block scalar (|)", () => {
		const yaml = "text: |\n  line1\n  line2\n";
		const result = val(yaml) as { text: string };
		expect(result.text).toContain("line1\n");
		expect(result.text).toContain("line2\n");
	});

	it("parses folded block scalar (>)", () => {
		const yaml = "text: >\n  line1\n  line2\n";
		const result = val(yaml) as { text: string };
		// Folded scalars replace newlines with spaces within paragraphs
		expect(typeof result.text).toBe("string");
		expect(result.text.length).toBeGreaterThan(0);
	});

	it("parses literal block with strip chomping (|-)", () => {
		const yaml = "text: |-\n  hello\n";
		const result = val(yaml) as { text: string };
		expect(result.text).toBe("hello");
	});

	it("parses literal block with keep chomping (|+)", () => {
		const yaml = "text: |+\n  hello\n\n";
		const result = val(yaml) as { text: string };
		expect(result.text).toBe("hello\n\n");
	});

	it("parses folded block with strip chomping (>-)", () => {
		const yaml = "text: >-\n  hello\n";
		const result = val(yaml) as { text: string };
		expect(result.text).toBe("hello");
	});

	it("parses folded block with keep chomping (>+)", () => {
		const yaml = "text: >+\n  hello\n\n";
		const result = val(yaml) as { text: string };
		expect(result.text).toBe("hello\n\n");
	});

	it("parses default clip chomping for literal", () => {
		const yaml = "text: |\n  hello\n";
		const result = val(yaml) as { text: string };
		expect(result.text).toBe("hello\n");
	});

	it("parses multi-line literal block", () => {
		const yaml = "text: |\n  first\n  second\n  third\n";
		const result = val(yaml) as { text: string };
		expect(result.text).toBe("first\nsecond\nthird\n");
	});
});

// ===========================================================================
// 4. Flow collections
// ===========================================================================

describe("YAML 1.2 compliance: flow collections", () => {
	it("parses flow mapping", () => {
		expect(val("{a: 1, b: 2}")).toEqual({ a: 1, b: 2 });
	});

	it("parses flow sequence", () => {
		expect(val("[1, 2, 3]")).toEqual([1, 2, 3]);
	});

	it("parses nested flow collections", () => {
		expect(val("{a: [1, 2], b: {c: 3}}")).toEqual({
			a: [1, 2],
			b: { c: 3 },
		});
	});

	it("parses flow sequence in block mapping", () => {
		expect(val("items: [1, 2, 3]")).toEqual({ items: [1, 2, 3] });
	});

	it("parses flow mapping in block mapping", () => {
		expect(val("point: {x: 1, y: 2}")).toEqual({ point: { x: 1, y: 2 } });
	});

	it("parses empty flow mapping", () => {
		expect(val("v: {}")).toEqual({ v: {} });
	});

	it("parses empty flow sequence", () => {
		expect(val("v: []")).toEqual({ v: [] });
	});

	it("parses mixed block and flow", () => {
		const yaml = "users:\n  - {name: Alice, age: 30}\n  - {name: Bob, age: 25}";
		expect(val(yaml)).toEqual({
			users: [
				{ name: "Alice", age: 30 },
				{ name: "Bob", age: 25 },
			],
		});
	});
});

// ===========================================================================
// 5. Anchors and aliases
// ===========================================================================

describe("YAML 1.2 compliance: anchors and aliases", () => {
	it("resolves basic anchor and alias", () => {
		const yaml = "anchor: &val hello\nalias: *val";
		expect(val(yaml)).toEqual({ anchor: "hello", alias: "hello" });
	});

	it("resolves anchor on mapping value", () => {
		const yaml = "defaults: &defaults\n  timeout: 30\n  retries: 3\ncopy: *defaults";
		const result = val(yaml) as Record<string, unknown>;
		expect(result.defaults).toEqual({ timeout: 30, retries: 3 });
		expect(result.copy).toEqual({ timeout: 30, retries: 3 });
	});

	it("resolves anchor on sequence", () => {
		const yaml = "base: &items\n  - 1\n  - 2\ncopy: *items";
		const result = val(yaml) as Record<string, unknown>;
		expect(result.base).toEqual([1, 2]);
		expect(result.copy).toEqual([1, 2]);
	});

	it("resolves anchor on scalar", () => {
		const yaml = "a: &name Alice\nb: *name";
		expect(val(yaml)).toEqual({ a: "Alice", b: "Alice" });
	});
});

// ===========================================================================
// 6. Tags
// ===========================================================================

describe("YAML 1.2 compliance: tags", () => {
	it("forces string with !!str tag on number-like value", () => {
		expect(val("v: !!str 42")).toEqual({ v: "42" });
	});

	it("forces string with !!str tag on boolean-like value", () => {
		expect(val("v: !!str true")).toEqual({ v: "true" });
	});

	it("forces integer with !!int tag", () => {
		expect(val("v: !!int 42")).toEqual({ v: 42 });
	});

	it("forces float with !!float tag", () => {
		expect(val("v: !!float 3.14")).toEqual({ v: 3.14 });
	});

	it("forces boolean with !!bool tag", () => {
		expect(val("v: !!bool true")).toEqual({ v: true });
	});

	it("forces null with !!null tag", () => {
		expect(val("v: !!null ''")).toEqual({ v: null });
	});

	it("forces string with !!str tag on null-like value", () => {
		expect(val("v: !!str null")).toEqual({ v: "null" });
	});
});

// ===========================================================================
// 7. Multi-document streams
// ===========================================================================

describe("YAML 1.2 compliance: multi-document streams", () => {
	it("parses multiple documents separated by ---", () => {
		const yaml = "---\na: 1\n---\nb: 2";
		const docs = Effect.runSync(parseAllDocuments(yaml));
		expect(docs.length).toBe(2);
	});

	it("parses document with explicit end marker (...)", () => {
		const yaml = "---\na: 1\n...\n---\nb: 2";
		const docs = Effect.runSync(parseAllDocuments(yaml));
		expect(docs.length).toBe(2);
	});

	it("parses single document without markers", () => {
		const docs = Effect.runSync(parseAllDocuments("hello: world"));
		expect(docs.length).toBeGreaterThanOrEqual(1);
	});

	it("parses empty documents", () => {
		const yaml = "---\n---\n---";
		const docs = Effect.runSync(parseAllDocuments(yaml));
		expect(docs.length).toBeGreaterThanOrEqual(2);
	});
});

// ===========================================================================
// 8. Comments
// ===========================================================================

describe("YAML 1.2 compliance: comments", () => {
	it("ignores inline comments", () => {
		expect(val("key: value # this is a comment")).toEqual({ key: "value" });
	});

	it("ignores block comments before content", () => {
		const yaml = "# header comment\nkey: value";
		expect(val(yaml)).toEqual({ key: "value" });
	});

	it("ignores comments between mapping entries", () => {
		const yaml = "a: 1\n# middle comment\nb: 2";
		expect(val(yaml)).toEqual({ a: 1, b: 2 });
	});

	it("ignores comments between sequence items", () => {
		const yaml = "- 1\n# middle comment\n- 2";
		expect(val(yaml)).toEqual([1, 2]);
	});

	it("handles comment-only input as null", () => {
		expect(val("# nothing here")).toBe(null);
	});
});

// ===========================================================================
// 9. Error cases
// ===========================================================================

describe("YAML 1.2 compliance: error cases", () => {
	it("rejects duplicate keys in strict mode", () => {
		expect(fails("a: 1\na: 2", { uniqueKeys: true })).toBe(true);
	});

	it("rejects undefined alias references", () => {
		expect(fails("v: *undefined_alias")).toBe(true);
	});

	it("rejects exceeding max alias count", () => {
		const yaml = `anchor: &a value\n${Array.from({ length: 5 }, (_, i) => `ref${i}: *a`).join("\n")}`;
		expect(fails(yaml, { maxAliasCount: 2 })).toBe(true);
	});
});

// ===========================================================================
// 10. Stringify roundtrip
// ===========================================================================

describe("YAML 1.2 compliance: stringify roundtrip", () => {
	it("roundtrips nested objects", () => {
		const original = { a: { b: { c: 1 } } };
		const yaml = Effect.runSync(stringify(original));
		expect(val(yaml)).toEqual(original);
	});

	it("roundtrips arrays of objects", () => {
		const original = [
			{ name: "Alice", age: 30 },
			{ name: "Bob", age: 25 },
		];
		const yaml = Effect.runSync(stringify(original));
		expect(val(yaml)).toEqual(original);
	});

	it("roundtrips mixed scalars", () => {
		const original = { str: "hello", num: 42, bool: true, nil: null };
		const yaml = Effect.runSync(stringify(original));
		expect(val(yaml)).toEqual(original);
	});

	it("roundtrips empty object", () => {
		const yaml = Effect.runSync(stringify({}));
		const result = val(yaml);
		expect(result).toEqual({});
	});

	it("roundtrips empty array", () => {
		const yaml = Effect.runSync(stringify([]));
		const result = val(yaml);
		expect(result).toEqual([]);
	});
});

// ===========================================================================
// 11. Complex real-world documents
// ===========================================================================

describe("YAML 1.2 compliance: complex documents", () => {
	it("parses a realistic configuration document", () => {
		const yaml = [
			"server:",
			"  host: localhost",
			"  port: 8080",
			"  ssl: true",
			"database:",
			"  host: db.example.com",
			"  port: 5432",
			"  name: myapp",
			"  pool:",
			"    min: 5",
			"    max: 20",
			"logging:",
			"  level: info",
			"  outputs:",
			"    - stdout",
			"    - file",
		].join("\n");

		const result = val(yaml) as Record<string, unknown>;
		expect(result.server).toEqual({ host: "localhost", port: 8080, ssl: true });
		expect((result.database as Record<string, unknown>).pool).toEqual({ min: 5, max: 20 });
		expect((result.logging as Record<string, unknown>).outputs).toEqual(["stdout", "file"]);
	});

	it("parses a docker-compose-like document", () => {
		const yaml = [
			"version: '3'",
			"services:",
			"  web:",
			"    image: nginx",
			"    ports:",
			"      - '80:80'",
			"      - '443:443'",
			"    environment:",
			"      NODE_ENV: production",
			"      DEBUG: false",
		].join("\n");

		const result = val(yaml) as Record<string, unknown>;
		expect(result.version).toBe("3");
		const services = result.services as Record<string, unknown>;
		const web = services.web as Record<string, unknown>;
		expect(web.image).toBe("nginx");
		expect(web.ports).toEqual(["80:80", "443:443"]);
		expect(web.environment).toEqual({ NODE_ENV: "production", DEBUG: false });
	});

	it("parses GitHub Actions-like workflow", () => {
		const yaml = [
			"name: CI",
			"on:",
			"  push:",
			"    branches:",
			"      - main",
			"jobs:",
			"  test:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: actions/checkout@v4",
			"      - name: Run tests",
			"        run: npm test",
		].join("\n");

		const result = val(yaml) as Record<string, unknown>;
		expect(result.name).toBe("CI");
		const jobs = result.jobs as Record<string, unknown>;
		const test = jobs.test as Record<string, unknown>;
		expect(test["runs-on"]).toBe("ubuntu-latest");
		const steps = test.steps as Array<Record<string, unknown>>;
		expect(steps).toHaveLength(2);
		expect(steps[0].uses).toBe("actions/checkout@v4");
	});
});
