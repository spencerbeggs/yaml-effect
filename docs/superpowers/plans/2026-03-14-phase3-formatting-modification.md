# Phase 3: Formatting & Modification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add format, modify, applyEdits, stripComments, equals, and equalsValue
functions to `@spencerbeggs/yaml-effect`.

**Architecture:** AST-based approach — all operations use the project's own
`parseDocument`/`stringifyDocument` pipeline (in `src/utils/composer.ts` and
`src/utils/stringify.ts`). Parse → transform AST → stringify back. Edit-producing
functions diff original vs transformed text using a character-level scan.
Two new files: `format.ts` (6 functions) and `equality.ts` (2 functions).

**Tech Stack:** Effect (Effect, Function as Fn), project's own YAML parser/
composer/stringifier (NOT `eemeli/yaml` — this project has its own stack),
Vitest

---

## File Map

| File | Purpose | Action |
| ---- | ------- | ------ |
| `src/utils/format.ts` | format, formatAndApply, modify, modifyAndApply, applyEdits, stripComments | Create |
| `src/utils/equality.ts` | equals, equalsValue, deepEqual (internal) | Create |
| `__test__/format.test.ts` | Tests for all format.ts functions | Create |
| `__test__/equality.test.ts` | Tests for equals and equalsValue | Create |
| `src/index.ts` | Re-export all 8 new public functions | Modify |

## Existing Code Reference

**IMPORTANT: This project does NOT use `eemeli/yaml`. It has its own complete
YAML stack. All implementations must use the project's own infrastructure.**

**Schemas (already exist, do not modify):**

- `src/schemas/YamlShared.ts` — `YamlEdit` (offset, length, content),
  `YamlRange` (offset, length), `YamlPath` type
- `src/schemas/YamlFormattingOptions.ts` — `YamlFormattingOptions` class with
  indent, lineWidth, defaultScalarStyle, defaultCollectionStyle, sortKeys,
  finalNewline, preserveComments, range fields
- `src/schemas/YamlStringifyOptions.ts` — `YamlStringifyOptions` class with
  indent, lineWidth, defaultScalarStyle, defaultCollectionStyle, sortKeys,
  finalNewline fields
- `src/schemas/YamlAstNodes.ts` — `YamlScalar`, `YamlMap`, `YamlSeq`,
  `YamlAlias`, `YamlPair` (all `Schema.TaggedClass`). Each collection and
  scalar has an optional `comment` field. `YamlMap.items` is `YamlPair[]`,
  `YamlSeq.items` is `YamlNode[]`.

**Errors (already exist, do not modify):**

- `src/errors/YamlFormatError.ts` — `YamlFormatError` with `text` and `reason`
- `src/errors/YamlModificationError.ts` — `YamlModificationError` with `path`
  and `reason`
- `src/errors/YamlComposerError.ts` — used by `parse()` in `composer.ts`

**Existing functions to use:**

- `parseDocument(text, options?)` from `src/utils/composer.ts` — returns
  `Effect<YamlDocument, YamlComposerError>`
- `parse(text, options?)` from `src/utils/composer.ts` — returns
  `Effect<unknown, YamlComposerError>` (resolves aliases to plain JS values)
- `stringifyDocument(doc, options?)` from `src/utils/stringify.ts` — returns
  `Effect<string, YamlStringifyError>`
- `stringify(value, options?)` from `src/utils/stringify.ts` — returns
  `Effect<string, YamlStringifyError>`
- `getNodeValue(node, anchors?)` from `src/utils/composer.ts` — resolves a
  `YamlNode` to its plain JS value
- `buildAnchorMap(node)` from `src/utils/composer.ts` — builds anchor lookup
  map for alias resolution

**AST node structure (comments are fields, not standalone nodes):**

```text
YamlDocument { contents: YamlNode | null, comment?: string, ... }
YamlScalar   { value, style, tag?, anchor?, comment?, offset, length }
YamlMap      { items: YamlPair[], style, tag?, anchor?, comment?, offset, length }
YamlSeq      { items: YamlNode[], style, tag?, anchor?, comment?, offset, length }
YamlPair     { key: YamlNode, value: YamlNode | null, comment? }
YamlAlias    { name, offset, length }
```

**Import patterns (follow existing conventions):**

```typescript
import { Effect, Function as Fn } from "effect";
import { YamlFormatError } from "../errors/YamlFormatError.js";
import type { YamlNode } from "../schemas/YamlAstNodes.js";
import { YamlMap, YamlPair, YamlScalar, YamlSeq } from "../schemas/YamlAstNodes.js";
import type { YamlDocument } from "../schemas/YamlDocument.js";
import type { YamlPath } from "../schemas/YamlShared.js";
import { YamlEdit } from "../schemas/YamlShared.js";
import { YamlFormattingOptions } from "../schemas/YamlFormattingOptions.js";
import { parseDocument } from "./composer.js";
import { stringifyDocument } from "./stringify.js";
```

**Test patterns:**

- Tests in `__test__/` directory, import from `../src/utils/*.js` and
  `../src/errors/*.js`
- Use `import { describe, expect, it } from "vitest"`
- Use `Effect.runSync()` for synchronous tests
- Use `Effect.runSync(Effect.either(...))` for testing error cases

---

## Chunk 1: applyEdits + computeEdits helper

### Task 1: `applyEdits` — pure text edit application

**Files:**

- Create: `src/utils/format.ts`
- Create: `__test__/format.test.ts`

- [ ] **Step 1: Write failing tests for applyEdits**

Create `__test__/format.test.ts`:

```typescript
import { Effect, pipe } from "effect";
import { describe, expect, it } from "vitest";
import { YamlEdit } from "../src/schemas/YamlShared.js";
import { applyEdits } from "../src/utils/format.js";

describe("applyEdits", () => {
  it("applies a single replacement edit", () => {
    const text = "hello world";
    const edits = [new YamlEdit({ offset: 6, length: 5, content: "yaml" })];
    const result = Effect.runSync(applyEdits(text, edits));
    expect(result).toBe("hello yaml");
  });

  it("applies multiple edits in correct order", () => {
    const text = "aaa bbb ccc";
    const edits = [
      new YamlEdit({ offset: 0, length: 3, content: "xxx" }),
      new YamlEdit({ offset: 8, length: 3, content: "zzz" }),
    ];
    const result = Effect.runSync(applyEdits(text, edits));
    expect(result).toBe("xxx bbb zzz");
  });

  it("handles insertion (length 0)", () => {
    const text = "ab";
    const edits = [new YamlEdit({ offset: 1, length: 0, content: "X" })];
    const result = Effect.runSync(applyEdits(text, edits));
    expect(result).toBe("aXb");
  });

  it("handles deletion (empty content)", () => {
    const text = "hello world";
    const edits = [new YamlEdit({ offset: 5, length: 6, content: "" })];
    const result = Effect.runSync(applyEdits(text, edits));
    expect(result).toBe("hello");
  });

  it("returns original text for empty edit list", () => {
    const text = "unchanged";
    const result = Effect.runSync(applyEdits(text, []));
    expect(result).toBe("unchanged");
  });

  it("supports pipeline (data-last) usage", () => {
    const text = "abc";
    const edits = [new YamlEdit({ offset: 1, length: 1, content: "X" })];
    const result = Effect.runSync(pipe(text, applyEdits(edits)));
    expect(result).toBe("aXc");
  });

  it("clamps offset beyond string length", () => {
    const text = "short";
    const edits = [new YamlEdit({ offset: 100, length: 0, content: "!" })];
    const result = Effect.runSync(applyEdits(text, edits));
    expect(result).toBe("short!");
  });

  it("clamps length when offset + length exceeds string length", () => {
    const text = "short";
    const edits = [new YamlEdit({ offset: 3, length: 100, content: "!" })];
    const result = Effect.runSync(applyEdits(text, edits));
    expect(result).toBe("sho!");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: FAIL — `applyEdits` does not exist yet

- [ ] **Step 3: Implement applyEdits and computeEdits**

Create `src/utils/format.ts`:

```typescript
/**
 * YAML formatting, modification, and edit application.
 *
 * All mutation functions use an AST-based approach (parse → transform →
 * stringify) using the project's own YAML pipeline and return computed edits
 * rather than mutated strings.
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn } from "effect";
import { YamlEdit } from "../schemas/YamlShared.js";

// ---------------------------------------------------------------------------
// Internal: character-level diff
// ---------------------------------------------------------------------------

/**
 * Compute edits by diffing two strings character by character.
 *
 * Walks both strings from each end inward to find the common prefix and
 * suffix, then emits a single edit covering the changed region in the
 * middle. This is sufficient because both strings derive from the same AST
 * and share structural skeleton — typically only whitespace and values differ.
 *
 * For more granular edits (multiple disjoint changes), a line-level pass
 * splits the middle region into per-line edits when possible.
 *
 * @internal
 */
function computeEdits(
  original: string,
  modified: string,
): ReadonlyArray<YamlEdit> {
  if (original === modified) return [];

  // Find common prefix
  let prefixLen = 0;
  const minLen = Math.min(original.length, modified.length);
  while (prefixLen < minLen && original[prefixLen] === modified[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix (not overlapping with prefix)
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    original[original.length - 1 - suffixLen] ===
      modified[modified.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const origStart = prefixLen;
  const origEnd = original.length - suffixLen;
  const modStart = prefixLen;
  const modEnd = modified.length - suffixLen;

  if (origStart >= origEnd && modStart >= modEnd) {
    return [];
  }

  // Try to split into line-level edits for better granularity
  const origMiddle = original.substring(origStart, origEnd);
  const modMiddle = modified.substring(modStart, modEnd);
  const origLines = origMiddle.split("\n");
  const modLines = modMiddle.split("\n");

  if (origLines.length === modLines.length && origLines.length > 1) {
    // Same number of lines — emit per-line edits for changed lines only
    const edits: YamlEdit[] = [];
    let offset = origStart;
    for (let i = 0; i < origLines.length; i++) {
      if (origLines[i] !== modLines[i]) {
        edits.push(
          new YamlEdit({
            offset,
            length: origLines[i].length,
            content: modLines[i],
          }),
        );
      }
      offset += origLines[i].length + 1; // +1 for the \n (assumes LF-only)
    }
    return edits;
  }

  // Fallback: single edit covering the entire changed region
  return [
    new YamlEdit({
      offset: origStart,
      length: origEnd - origStart,
      content: modified.substring(modStart, modEnd),
    }),
  ];
}

// ---------------------------------------------------------------------------
// applyEdits
// ---------------------------------------------------------------------------

/**
 * Apply an array of text edits to YAML source text.
 *
 * @remarks
 * Edits are sorted in reverse offset order before application so that
 * earlier edits do not shift the offsets of later ones. Offsets beyond the
 * string boundary are clamped. The original `edits` array is not mutated.
 *
 * @public
 */
export const applyEdits: {
  (edits: ReadonlyArray<YamlEdit>): (text: string) => Effect.Effect<string>;
  (text: string, edits: ReadonlyArray<YamlEdit>): Effect.Effect<string>;
} = Fn.dual(
  2,
  (text: string, edits: ReadonlyArray<YamlEdit>): Effect.Effect<string> =>
    Effect.sync(() => {
      const sorted = [...edits].sort((a, b) => b.offset - a.offset);
      let result = text;
      for (const edit of sorted) {
        const offset = Math.min(edit.offset, result.length);
        const length = Math.min(edit.length, result.length - offset);
        result =
          result.substring(0, offset) +
          edit.content +
          result.substring(offset + length);
      }
      return result;
    }),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts __test__/format.test.ts
git commit -m "$(cat <<'EOF'
feat: add applyEdits and computeEdits for text edit application

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

## Chunk 2: format + formatAndApply

### Task 2: `format` and `formatAndApply`

**Files:**

- Modify: `src/utils/format.ts`
- Modify: `__test__/format.test.ts`

**Key insight:** `format` uses `parseDocument()` → `stringifyDocument()` with
formatting options. The `YamlFormattingOptions` extends `YamlStringifyOptions`
with `preserveComments` and `range`. We pass the stringify-relevant fields
(indent, lineWidth, defaultScalarStyle, defaultCollectionStyle, sortKeys,
finalNewline) to `stringifyDocument()`. Comment stripping requires walking
the AST to clear `comment` fields on all nodes before stringifying.

- [ ] **Step 1: Write failing tests for format**

Add to `__test__/format.test.ts`:

```typescript
import { YamlFormatError } from "../src/errors/YamlFormatError.js";
import {
  applyEdits,
  format,
  formatAndApply,
} from "../src/utils/format.js";

describe("format", () => {
  it("re-indents from 4 spaces to 2 spaces", () => {
    const input = "root:\n    nested: value\n";
    const result = Effect.runSync(
      format(input, { indent: 2 }).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toContain("root:");
    expect(result).toContain("nested: value");
    // Should use 2-space indent, not 4
    expect(result).not.toContain("    nested");
  });

  it("adds final newline when finalNewline is true", () => {
    const input = "key: value";
    const result = Effect.runSync(
      format(input, { finalNewline: true }).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toMatch(/\n$/);
  });

  it("removes final newline when finalNewline is false", () => {
    const input = "key: value\n";
    const result = Effect.runSync(
      format(input, { finalNewline: false }).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).not.toMatch(/\n$/);
  });

  it("sorts keys alphabetically when sortKeys is true", () => {
    const input = "z: 1\na: 2\nm: 3\n";
    const result = Effect.runSync(
      format(input, { sortKeys: true }).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    const keys = result
      .trim()
      .split("\n")
      .map((l) => l.split(":")[0]);
    expect(keys).toEqual(["a", "m", "z"]);
  });

  it("returns empty edits for already-formatted input", () => {
    const input = "key: value\n";
    const edits = Effect.runSync(format(input));
    expect(edits).toEqual([]);
  });

  it("preserves comments by default", () => {
    const input = "# header comment\nkey: value\n";
    const result = Effect.runSync(
      format(input).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toContain("# header comment");
  });

  it("strips comments when preserveComments is false", () => {
    const input = "# header\nkey: value # inline\n";
    const result = Effect.runSync(
      format(input, { preserveComments: false }).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).not.toContain("# header");
    expect(result).not.toContain("# inline");
    expect(result).toContain("key: value");
  });

  it("restricts edits to range when specified", () => {
    const input = "a: 1\nb:   2\nc: 3\n";
    const edits = Effect.runSync(
      format(input, { range: { offset: 5, length: 7 } }),
    );
    // Only edits within the range [5, 12) should be returned
    for (const edit of edits) {
      expect(edit.offset).toBeGreaterThanOrEqual(5);
      expect(edit.offset + edit.length).toBeLessThanOrEqual(12);
    }
  });

  it("fails with YamlFormatError on invalid YAML", () => {
    const result = Effect.runSync(
      Effect.either(format(":\n  : [}"))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(YamlFormatError);
    }
  });
});

describe("formatAndApply", () => {
  it("returns formatted string directly", () => {
    const input = "root:\n    nested: value\n";
    const result = Effect.runSync(formatAndApply(input, { indent: 2 }));
    expect(result).toContain("root:");
    expect(result).not.toContain("    nested");
  });

  it("produces same result as format + applyEdits", () => {
    const input = "z: 1\na: 2\n";
    const opts = { sortKeys: true } as const;
    const viaEdits = Effect.runSync(
      format(input, opts).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    const viaDirect = Effect.runSync(formatAndApply(input, opts));
    expect(viaDirect).toBe(viaEdits);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: FAIL — `format` and `formatAndApply` do not exist yet

- [ ] **Step 3: Implement format and formatAndApply**

Add to `src/utils/format.ts` (new imports at top):

```typescript
import { YamlFormatError } from "../errors/YamlFormatError.js";
import type { YamlNode } from "../schemas/YamlAstNodes.js";
import { YamlMap, YamlPair, YamlScalar, YamlSeq } from "../schemas/YamlAstNodes.js";
import { YamlDocument } from "../schemas/YamlDocument.js";
import { YamlFormattingOptions } from "../schemas/YamlFormattingOptions.js";
import { parseDocument } from "./composer.js";
import { stringifyDocument } from "./stringify.js";

// ---------------------------------------------------------------------------
// Internal: strip comments from AST nodes
// ---------------------------------------------------------------------------

/**
 * Recursively create a copy of a YamlNode with all comment fields removed.
 */
function stripNodeComments(node: YamlNode): YamlNode {
  if (node instanceof YamlScalar) {
    return new YamlScalar({
      value: node.value,
      style: node.style,
      tag: node.tag,
      anchor: node.anchor,
      offset: node.offset,
      length: node.length,
    });
  }
  if (node instanceof YamlMap) {
    return new YamlMap({
      items: node.items.map(
        (pair) =>
          new YamlPair({
            key: stripNodeComments(pair.key),
            value: pair.value ? stripNodeComments(pair.value) : null,
          }),
      ),
      style: node.style,
      tag: node.tag,
      anchor: node.anchor,
      offset: node.offset,
      length: node.length,
    });
  }
  if (node instanceof YamlSeq) {
    return new YamlSeq({
      items: node.items.map(stripNodeComments),
      style: node.style,
      tag: node.tag,
      anchor: node.anchor,
      offset: node.offset,
      length: node.length,
    });
  }
  // YamlAlias has no comment field
  return node;
}

// ---------------------------------------------------------------------------
// Internal: format a YAML document via AST round-trip
// ---------------------------------------------------------------------------

function formatImpl(
  text: string,
  options?: Partial<ConstructorParameters<typeof YamlFormattingOptions>[0]>,
): Effect.Effect<string, YamlFormatError> {
  const opts = new YamlFormattingOptions(options ?? {});

  return parseDocument(text).pipe(
    Effect.mapError(
      (e) => new YamlFormatError({ text, reason: e.message }),
    ),
    Effect.flatMap((doc) => {
      let contents = doc.contents;

      // Strip comments if requested
      if (!opts.preserveComments && contents) {
        contents = stripNodeComments(contents);
      }

      const strippedDoc = new YamlDocument({
        contents,
        errors: doc.errors,
        warnings: doc.warnings,
        directives: doc.directives,
        comment: opts.preserveComments ? doc.comment : undefined,
      });

      return stringifyDocument(strippedDoc, {
        indent: opts.indent,
        lineWidth: opts.lineWidth,
        defaultScalarStyle: opts.defaultScalarStyle,
        defaultCollectionStyle: opts.defaultCollectionStyle,
        sortKeys: opts.sortKeys,
        finalNewline: opts.finalNewline,
      }).pipe(
        Effect.mapError(
          (e) => new YamlFormatError({ text, reason: e.message }),
        ),
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// format
// ---------------------------------------------------------------------------

/**
 * Compute formatting edits for a YAML document.
 *
 * @remarks
 * Parses the input into an AST Document, applies formatting options, and
 * stringifies back. Returns the diff as an array of {@link YamlEdit} objects.
 * When `options.range` is set, only edits within that range are returned.
 *
 * @public
 */
export function format(
  text: string,
  options?: Partial<ConstructorParameters<typeof YamlFormattingOptions>[0]>,
): Effect.Effect<ReadonlyArray<YamlEdit>, YamlFormatError> {
  return formatImpl(text, options).pipe(
    Effect.map((formatted) => {
      const opts = new YamlFormattingOptions(options ?? {});
      let edits = computeEdits(text, formatted);

      if (opts.range) {
        const rangeStart = opts.range.offset;
        const rangeEnd = opts.range.offset + opts.range.length;
        edits = edits.filter((e) => {
          const editEnd = e.offset + e.length;
          return e.offset >= rangeStart && editEnd <= rangeEnd;
        });
      }

      return edits;
    }),
  );
}

// ---------------------------------------------------------------------------
// formatAndApply
// ---------------------------------------------------------------------------

/**
 * Format a YAML document in one step.
 *
 * @remarks
 * Convenience combining parse → apply options → stringify. Returns the
 * formatted string directly without computing a diff.
 *
 * @public
 */
export function formatAndApply(
  text: string,
  options?: Partial<ConstructorParameters<typeof YamlFormattingOptions>[0]>,
): Effect.Effect<string, YamlFormatError> {
  return formatImpl(text, options);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run linter**

Run: `pnpm run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add src/utils/format.ts __test__/format.test.ts
git commit -m "$(cat <<'EOF'
feat: add format and formatAndApply for YAML formatting

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

## Chunk 3: modify + modifyAndApply + stripComments

### Task 3: `modify` and `modifyAndApply`

**Files:**

- Modify: `src/utils/format.ts`
- Modify: `__test__/format.test.ts`

**Key insight:** The project's AST nodes are `Schema.TaggedClass` instances.
Modification requires: parse → navigate to parent node → rebuild with
modified value → stringify → diff. For maps, we find the `YamlPair` by key
and create a new `YamlPair` with the new value. For sequences, we replace
or splice the items array. Creating new values from plain JS uses `stringify`
to get the text, then re-parsing to get an AST node.

- [ ] **Step 1: Write failing tests for modify**

Add to `__test__/format.test.ts`:

```typescript
import { YamlModificationError } from "../src/errors/YamlModificationError.js";
import {
  applyEdits,
  format,
  formatAndApply,
  modify,
  modifyAndApply,
} from "../src/utils/format.js";

describe("modify", () => {
  it("replaces an existing scalar value", () => {
    const input = "name: Alice\nage: 30\n";
    const result = Effect.runSync(
      modify(input, ["name"], "Bob").pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toContain("name: Bob");
  });

  it("inserts a new key at top level", () => {
    const input = "name: Alice\n";
    const result = Effect.runSync(
      modify(input, ["email"], "alice@example.com").pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toContain("email:");
    expect(result).toContain("name: Alice");
  });

  it("removes a key when value is undefined", () => {
    const input = "name: Alice\nage: 30\n";
    const result = Effect.runSync(
      modify(input, ["age"], undefined).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).not.toContain("age");
    expect(result).toContain("name: Alice");
  });

  it("modifies a nested value", () => {
    const input = "server:\n  host: localhost\n  port: 3000\n";
    const result = Effect.runSync(
      modify(input, ["server", "port"], 8080).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toContain("8080");
    expect(result).toContain("host: localhost");
  });

  it("modifies an array element by index", () => {
    const input = "items:\n  - apple\n  - banana\n  - cherry\n";
    const result = Effect.runSync(
      modify(input, ["items", 1], "blueberry").pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toContain("blueberry");
    expect(result).not.toContain("banana");
  });

  it("supports pipeline (data-last) usage", () => {
    const input = "key: old\n";
    const result = Effect.runSync(
      pipe(
        input,
        modify(["key"], "new"),
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    expect(result).toContain("key: new");
  });

  it("fails with YamlModificationError on invalid path", () => {
    const input = "name: Alice\n";
    const result = Effect.runSync(
      Effect.either(modify(input, ["nonexistent", "deep"], "value")),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(YamlModificationError);
    }
  });
});

describe("modifyAndApply", () => {
  it("returns modified string directly", () => {
    const input = "name: Alice\n";
    const result = Effect.runSync(modifyAndApply(input, ["name"], "Bob"));
    expect(result).toContain("name: Bob");
  });

  it("produces same result as modify + applyEdits", () => {
    const input = "a: 1\nb: 2\n";
    const viaEdits = Effect.runSync(
      modify(input, ["a"], 99).pipe(
        Effect.flatMap((edits) => applyEdits(input, edits)),
      ),
    );
    const viaDirect = Effect.runSync(modifyAndApply(input, ["a"], 99));
    expect(viaDirect).toBe(viaEdits);
  });

  it("supports pipeline (data-last) usage", () => {
    const input = "key: old\n";
    const result = Effect.runSync(pipe(input, modifyAndApply(["key"], "new")));
    expect(result).toContain("key: new");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: FAIL — `modify` and `modifyAndApply` do not exist yet

- [ ] **Step 3: Implement modify and modifyAndApply**

Add to `src/utils/format.ts`:

```typescript
import { YamlModificationError } from "../errors/YamlModificationError.js";
import type { YamlPath } from "../schemas/YamlShared.js";
import { stringify } from "./stringify.js";

// ---------------------------------------------------------------------------
// Internal: create a YamlScalar from a JS value
// ---------------------------------------------------------------------------

function jsValueToNode(value: unknown): YamlNode {
  return new YamlScalar({
    value,
    style: "plain" as const,
    offset: 0,
    length: 0,
  });
}

// ---------------------------------------------------------------------------
// Internal: modify a YAML document via AST manipulation
// ---------------------------------------------------------------------------

function modifyDocument(
  doc: YamlDocument,
  path: YamlPath,
  value: unknown,
): YamlDocument {
  if (path.length === 0) {
    return new YamlDocument({
      contents: value === undefined ? null : jsValueToNode(value),
      errors: doc.errors,
      warnings: doc.warnings,
      directives: doc.directives,
      comment: doc.comment,
    });
  }

  if (!doc.contents) {
    throw new Error("Cannot navigate path in empty document");
  }

  const newContents = modifyNode(doc.contents, path, 0, value);

  return new YamlDocument({
    contents: newContents,
    errors: doc.errors,
    warnings: doc.warnings,
    directives: doc.directives,
    comment: doc.comment,
  });
}

function modifyNode(
  node: YamlNode,
  path: YamlPath,
  depth: number,
  value: unknown,
): YamlNode {
  const segment = path[depth];
  const isLast = depth === path.length - 1;

  if (node instanceof YamlMap) {
    const pairIndex = node.items.findIndex(
      (pair) =>
        pair.key instanceof YamlScalar && pair.key.value === segment,
    );

    if (isLast) {
      if (value === undefined) {
        // Remove the key
        if (pairIndex < 0) return node; // Nothing to remove
        const newItems = [...node.items];
        newItems.splice(pairIndex, 1);
        return new YamlMap({
          items: newItems,
          style: node.style,
          tag: node.tag,
          anchor: node.anchor,
          comment: node.comment,
          offset: node.offset,
          length: node.length,
        });
      }

      const newValueNode = jsValueToNode(value);
      if (pairIndex >= 0) {
        // Replace existing value
        const newItems = [...node.items];
        const oldPair = newItems[pairIndex];
        newItems[pairIndex] = new YamlPair({
          key: oldPair.key,
          value: newValueNode,
          comment: oldPair.comment,
        });
        return new YamlMap({
          items: newItems,
          style: node.style,
          tag: node.tag,
          anchor: node.anchor,
          comment: node.comment,
          offset: node.offset,
          length: node.length,
        });
      }

      // Insert new key
      const keyNode = new YamlScalar({
        value: String(segment),
        style: "plain" as const,
        offset: 0,
        length: 0,
      });
      const newPair = new YamlPair({
        key: keyNode,
        value: newValueNode,
      });
      return new YamlMap({
        items: [...node.items, newPair],
        style: node.style,
        tag: node.tag,
        anchor: node.anchor,
        comment: node.comment,
        offset: node.offset,
        length: node.length,
      });
    }

    // Navigate deeper
    if (pairIndex < 0) {
      throw new Error(
        `Key "${String(segment)}" not found in mapping`,
      );
    }
    const pair = node.items[pairIndex];
    if (!pair.value) {
      throw new Error(
        `Value at key "${String(segment)}" is null`,
      );
    }
    const newValue = modifyNode(pair.value, path, depth + 1, value);
    const newItems = [...node.items];
    newItems[pairIndex] = new YamlPair({
      key: pair.key,
      value: newValue,
      comment: pair.comment,
    });
    return new YamlMap({
      items: newItems,
      style: node.style,
      tag: node.tag,
      anchor: node.anchor,
      comment: node.comment,
      offset: node.offset,
      length: node.length,
    });
  }

  if (node instanceof YamlSeq) {
    const idx = typeof segment === "number" ? segment : Number(segment);
    if (Number.isNaN(idx) || idx < 0) {
      throw new Error(`Invalid sequence index: ${String(segment)}`);
    }

    if (isLast) {
      const newItems = [...node.items];
      if (value === undefined) {
        if (idx < newItems.length) {
          newItems.splice(idx, 1);
        }
      } else if (idx < newItems.length) {
        newItems[idx] = jsValueToNode(value);
      } else {
        newItems.push(jsValueToNode(value));
      }
      return new YamlSeq({
        items: newItems,
        style: node.style,
        tag: node.tag,
        anchor: node.anchor,
        comment: node.comment,
        offset: node.offset,
        length: node.length,
      });
    }

    // Navigate deeper
    if (idx >= node.items.length) {
      throw new Error(`Index ${idx} out of bounds`);
    }
    const child = node.items[idx];
    const newChild = modifyNode(child, path, depth + 1, value);
    const newItems = [...node.items];
    newItems[idx] = newChild;
    return new YamlSeq({
      items: newItems,
      style: node.style,
      tag: node.tag,
      anchor: node.anchor,
      comment: node.comment,
      offset: node.offset,
      length: node.length,
    });
  }

  throw new Error(
    `Cannot navigate through ${node._tag} at segment "${String(segment)}"`,
  );
}

// ---------------------------------------------------------------------------
// Internal: modify implementation
// ---------------------------------------------------------------------------

function modifyImpl(
  text: string,
  path: YamlPath,
  value: unknown,
): Effect.Effect<string, YamlModificationError> {
  return parseDocument(text).pipe(
    Effect.mapError(
      (e) =>
        new YamlModificationError({
          path,
          reason: e.message,
        }),
    ),
    Effect.flatMap((doc) => {
      try {
        const modified = modifyDocument(doc, path, value);
        return stringifyDocument(modified).pipe(
          Effect.mapError(
            (e) =>
              new YamlModificationError({
                path,
                reason: e.message,
              }),
          ),
        );
      } catch (err) {
        return Effect.fail(
          new YamlModificationError({
            path,
            reason:
              err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// modify
// ---------------------------------------------------------------------------

/**
 * Compute edits to insert, replace, or remove a value at a YAML path.
 *
 * @remarks
 * Parses the input, navigates to the target path in the Document AST,
 * applies the change, stringifies back, and diffs to produce edits.
 * Pass `undefined` as `value` to remove the property or element.
 *
 * @public
 */
export const modify: {
  (
    path: YamlPath,
    value: unknown,
  ): (
    text: string,
  ) => Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
  (
    text: string,
    path: YamlPath,
    value: unknown,
  ): Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError>;
} = Fn.dual(
  3,
  (
    text: string,
    path: YamlPath,
    value: unknown,
  ): Effect.Effect<ReadonlyArray<YamlEdit>, YamlModificationError> =>
    modifyImpl(text, path, value).pipe(
      Effect.map((modified) => computeEdits(text, modified)),
    ),
);

// ---------------------------------------------------------------------------
// modifyAndApply
// ---------------------------------------------------------------------------

/**
 * Modify a YAML document in one step.
 *
 * @remarks
 * Same as {@link modify} but returns the modified string directly.
 *
 * @public
 */
export const modifyAndApply: {
  (
    path: YamlPath,
    value: unknown,
  ): (text: string) => Effect.Effect<string, YamlModificationError>;
  (
    text: string,
    path: YamlPath,
    value: unknown,
  ): Effect.Effect<string, YamlModificationError>;
} = Fn.dual(
  3,
  (
    text: string,
    path: YamlPath,
    value: unknown,
  ): Effect.Effect<string, YamlModificationError> =>
    modifyImpl(text, path, value),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts __test__/format.test.ts
git commit -m "$(cat <<'EOF'
feat: add modify and modifyAndApply for path-based YAML editing

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 4: `stripComments`

**Files:**

- Modify: `src/utils/format.ts`
- Modify: `__test__/format.test.ts`

**Key insight:** For removal mode, we use `parseDocument` →
`stripNodeComments` (already written in Task 2) → `stringifyDocument`.
For `replaceCh` mode, we operate at the text level using a state machine
that detects `#` comment starts outside of quoted strings, since we need
to preserve character offsets.

- [ ] **Step 1: Write failing tests for stripComments**

Add to `__test__/format.test.ts`:

```typescript
import {
  applyEdits,
  format,
  formatAndApply,
  modify,
  modifyAndApply,
  stripComments,
} from "../src/utils/format.js";

describe("stripComments", () => {
  it("removes inline comments", () => {
    const input = "key: value # inline comment\n";
    const result = Effect.runSync(stripComments(input));
    expect(result).not.toContain("# inline comment");
    expect(result).toContain("key: value");
  });

  it("removes full-line comments", () => {
    const input = "# full line comment\nkey: value\n";
    const result = Effect.runSync(stripComments(input));
    expect(result).not.toContain("# full line comment");
    expect(result).toContain("key: value");
  });

  it("preserves offsets with replaceCh", () => {
    const input = "key: value # comment\n";
    const result = Effect.runSync(stripComments(input, " "));
    expect(result.length).toBe(input.length);
    expect(result).not.toContain("#");
  });

  it("preserves newlines with replaceCh", () => {
    const input = "# comment\nkey: value\n";
    const result = Effect.runSync(stripComments(input, " "));
    expect(result).toContain("\n");
    expect(result.split("\n").length).toBe(input.split("\n").length);
  });

  it("handles document with no comments", () => {
    const input = "key: value\n";
    const result = Effect.runSync(stripComments(input));
    expect(result).toContain("key: value");
  });

  it("does not treat # inside quoted strings as comments", () => {
    const input = 'message: "hello # world"\n';
    const result = Effect.runSync(stripComments(input));
    expect(result).toContain("hello # world");
  });

  it("fails with YamlFormatError on invalid YAML (removal mode)", () => {
    const result = Effect.runSync(
      Effect.either(stripComments(":\n  : [}"))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(YamlFormatError);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: FAIL — `stripComments` does not exist yet

- [ ] **Step 3: Implement stripComments**

Add to `src/utils/format.ts`:

```typescript
// ---------------------------------------------------------------------------
// stripComments
// ---------------------------------------------------------------------------

/**
 * Remove all comments from a YAML document.
 *
 * @remarks
 * Without `replaceCh`: parses the document, removes all comment fields from
 * the AST, and stringifies back. Full-line comments are removed entirely.
 *
 * With `replaceCh` (a single character): replaces each character of comment
 * text (including the `#` marker) with the given character to preserve
 * character offsets. Newlines are always preserved.
 *
 * @public
 */
export function stripComments(
  text: string,
  replaceCh?: string,
): Effect.Effect<string, YamlFormatError> {
  if (replaceCh !== undefined) {
    // Offset-preserving mode: replace comment characters in the raw text
    return Effect.sync(() => {
      let result = "";
      let i = 0;
      let inComment = false;
      let inSingleQuote = false;
      let inDoubleQuote = false;

      while (i < text.length) {
        const ch = text[i];

        if (inComment) {
          if (ch === "\n") {
            inComment = false;
            result += ch;
          } else {
            result += replaceCh;
          }
        } else if (inDoubleQuote) {
          result += ch;
          if (ch === "\\" && i + 1 < text.length) {
            i++;
            result += text[i];
          } else if (ch === '"') {
            inDoubleQuote = false;
          }
        } else if (inSingleQuote) {
          result += ch;
          if (
            ch === "'" &&
            i + 1 < text.length &&
            text[i + 1] === "'"
          ) {
            i++;
            result += text[i];
          } else if (ch === "'") {
            inSingleQuote = false;
          }
        } else if (ch === '"') {
          inDoubleQuote = true;
          result += ch;
        } else if (ch === "'") {
          inSingleQuote = true;
          result += ch;
        } else if (ch === "#") {
          const prev = i > 0 ? text[i - 1] : "\n";
          if (
            prev === " " ||
            prev === "\t" ||
            prev === "\n" ||
            i === 0
          ) {
            inComment = true;
            result += replaceCh;
          } else {
            result += ch;
          }
        } else {
          result += ch;
        }

        i++;
      }

      return result;
    });
  }

  // Removal mode: parse, strip comments, stringify
  return parseDocument(text).pipe(
    Effect.mapError(
      (e) => new YamlFormatError({ text, reason: e.message }),
    ),
    Effect.flatMap((doc) => {
      const contents = doc.contents
        ? stripNodeComments(doc.contents)
        : null;

      const strippedDoc = new YamlDocument({
        contents,
        errors: doc.errors,
        warnings: doc.warnings,
        directives: doc.directives,
      });

      return stringifyDocument(strippedDoc).pipe(
        Effect.mapError(
          (e) => new YamlFormatError({ text, reason: e.message }),
        ),
      );
    }),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/format.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts __test__/format.test.ts
git commit -m "$(cat <<'EOF'
feat: add stripComments for YAML comment removal

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

## Chunk 4: equality + exports + build verification

### Task 5: `equals` and `equalsValue`

**Files:**

- Create: `src/utils/equality.ts`
- Create: `__test__/equality.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__test__/equality.test.ts`:

```typescript
import { Effect, pipe } from "effect";
import { describe, expect, it } from "vitest";
import { YamlComposerError } from "../src/errors/YamlComposerError.js";
import { equals, equalsValue } from "../src/utils/equality.js";

describe("equals", () => {
  it("returns true for identical documents", () => {
    const result = Effect.runSync(equals("key: value\n", "key: value\n"));
    expect(result).toBe(true);
  });

  it("returns true for same data with different formatting", () => {
    const a = "key:   value\n";
    const b = "key: value\n";
    const result = Effect.runSync(equals(a, b));
    expect(result).toBe(true);
  });

  it("returns true for different key ordering", () => {
    const a = "z: 1\na: 2\n";
    const b = "a: 2\nz: 1\n";
    const result = Effect.runSync(equals(a, b));
    expect(result).toBe(true);
  });

  it("returns false for different sequence ordering", () => {
    const a = "items:\n  - 1\n  - 2\n";
    const b = "items:\n  - 2\n  - 1\n";
    const result = Effect.runSync(equals(a, b));
    expect(result).toBe(false);
  });

  it("returns true with resolved anchors/aliases", () => {
    const withAnchor = "defaults: &defs\n  timeout: 30\n";
    const withoutAnchor = "defaults:\n  timeout: 30\n";
    const result = Effect.runSync(equals(withAnchor, withoutAnchor));
    expect(result).toBe(true);
  });

  it("returns false for different values", () => {
    const result = Effect.runSync(equals("key: 1\n", "key: 2\n"));
    expect(result).toBe(false);
  });

  it("supports pipeline (data-last) usage", () => {
    const result = Effect.runSync(pipe("a: 1\n", equals("a: 1\n")));
    expect(result).toBe(true);
  });

  it("fails with YamlComposerError on invalid input", () => {
    const result = Effect.runSync(
      Effect.either(equals("valid: true\n", ":\n  : [}"))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(YamlComposerError);
    }
  });

  it("ignores comments", () => {
    const a = "key: value # comment\n";
    const b = "key: value\n";
    const result = Effect.runSync(equals(a, b));
    expect(result).toBe(true);
  });

  it("handles nested key order differences recursively", () => {
    const a = "outer:\n  z: 1\n  a: 2\n";
    const b = "outer:\n  a: 2\n  z: 1\n";
    const result = Effect.runSync(equals(a, b));
    expect(result).toBe(true);
  });
});

describe("equalsValue", () => {
  it("returns true when YAML matches JS value", () => {
    const yaml = "name: Alice\nage: 30\n";
    const value = { name: "Alice", age: 30 };
    const result = Effect.runSync(equalsValue(yaml, value));
    expect(result).toBe(true);
  });

  it("returns false when YAML does not match JS value", () => {
    const yaml = "name: Alice\n";
    const value = { name: "Bob" };
    const result = Effect.runSync(equalsValue(yaml, value));
    expect(result).toBe(false);
  });

  it("supports pipeline (data-last) usage", () => {
    const yaml = "items:\n  - 1\n  - 2\n";
    const value = { items: [1, 2] };
    const result = Effect.runSync(pipe(yaml, equalsValue(value)));
    expect(result).toBe(true);
  });

  it("fails with YamlComposerError on invalid YAML", () => {
    const result = Effect.runSync(
      Effect.either(equalsValue(":\n  : [}", {}))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(YamlComposerError);
    }
  });

  it("handles null values", () => {
    const result = Effect.runSync(equalsValue("~\n", null));
    expect(result).toBe(true);
  });

  it("handles scalar values", () => {
    const result = Effect.runSync(equalsValue("42\n", 42));
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run __test__/equality.test.ts`
Expected: FAIL — module does not exist yet

- [ ] **Step 3: Implement equals, equalsValue, and deepEqual**

Create `src/utils/equality.ts`:

```typescript
/**
 * YAML equality comparisons — semantic equivalence for YAML documents.
 *
 * Compares parsed values ignoring comments, whitespace, formatting,
 * and mapping key ordering. Sequence order IS significant.
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn } from "effect";
import type { YamlComposerError } from "../errors/YamlComposerError.js";
import { parse } from "./composer.js";

// ---------------------------------------------------------------------------
// Internal: deep structural equality
// ---------------------------------------------------------------------------

/**
 * Deep-compare two plain JS values for structural equality.
 * Object key order is ignored (recursively at all nesting levels).
 * Array order is significant.
 *
 * @internal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  // Handle NaN (NaN !== NaN but should be considered equal)
  if (
    typeof a === "number" &&
    typeof b === "number" &&
    Number.isNaN(a) &&
    Number.isNaN(b)
  ) {
    return true;
  }

  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.hasOwn(bObj, key)) return false;
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// equals
// ---------------------------------------------------------------------------

/**
 * Compare two YAML strings for semantic equality.
 *
 * @remarks
 * Both strings are parsed via {@link parse} (which resolves anchors/aliases
 * to plain JS values) and then deep-compared. Comments, whitespace,
 * formatting, and object key ordering are ignored. Array order IS
 * significant. For multi-document input, only the first document is
 * compared.
 *
 * @public
 */
export const equals: {
  (that: string): (self: string) => Effect.Effect<boolean, YamlComposerError>;
  (self: string, that: string): Effect.Effect<boolean, YamlComposerError>;
} = Fn.dual(
  2,
  (self: string, that: string): Effect.Effect<boolean, YamlComposerError> =>
    Effect.map(
      Effect.all([parse(self), parse(that)]),
      ([a, b]) => deepEqual(a, b),
    ),
);

// ---------------------------------------------------------------------------
// equalsValue
// ---------------------------------------------------------------------------

/**
 * Compare a YAML string against a JavaScript value for semantic equality.
 *
 * @remarks
 * Only the YAML string is parsed; the JS value is used as-is. Same
 * comparison semantics as {@link equals}.
 *
 * @public
 */
export const equalsValue: {
  (value: unknown): (self: string) => Effect.Effect<boolean, YamlComposerError>;
  (self: string, value: unknown): Effect.Effect<boolean, YamlComposerError>;
} = Fn.dual(
  2,
  (self: string, value: unknown): Effect.Effect<boolean, YamlComposerError> =>
    Effect.map(parse(self), (parsed) => deepEqual(parsed, value)),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run __test__/equality.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/equality.ts __test__/equality.test.ts
git commit -m "$(cat <<'EOF'
feat: add equals and equalsValue for semantic YAML comparison

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 6: Public API exports

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Add exports to index.ts**

Add the following export lines to `src/index.ts` (Biome will auto-sort on
lint):

```typescript
// Equality
export { equals, equalsValue } from "./utils/equality.js";
// Format & Modify
export {
  applyEdits,
  format,
  formatAndApply,
  modify,
  modifyAndApply,
  stripComments,
} from "./utils/format.js";
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Run linter**

Run: `pnpm run lint:fix`

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "$(cat <<'EOF'
feat: export Phase 3 format/modify/equality functions

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 7: Build verification and full test suite

**Files:** None modified — verification only.

- [ ] **Step 1: Run full test suite**

Run: `pnpm run test`
Expected: All tests pass (667 existing + new format + equality tests)

- [ ] **Step 2: Run ci:build**

Run: `pnpm ci:build`
Expected: Build succeeds. No new `ae-forgotten-export` blockers expected
(format.ts and equality.ts export plain functions, not Schema.Class/
TaggedError types).

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit any lint/format changes from build**

If the build produced any auto-generated changes, commit them with specific
file paths (check `git status` first):

```bash
git commit -m "$(cat <<'EOF'
chore: post-build cleanup

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```
