---
title: Parsing
description: Lexer, parser, and composer -- how YAML text becomes AST.
status: current
module: yaml-effect
category: architecture
created: 2026-03-14
updated: 2026-04-27
last-synced: 2026-04-27
completeness: 88
related:
  - architecture.md
  - schemas.md
  - errors.md
dependencies:
  - schemas.md
---

The parsing pipeline has three stages: lexer (tokenization), parser (CST
construction), and composer (AST construction with type resolution).

## Lexer (`src/utils/lexer.ts`)

### Scanner (`createScanner`)

The core scanning engine is a stateful, imperative, synchronous scanner.
It is the only mutable module in the pipeline.

```typescript
interface YamlScanner {
  scan(): YamlTokenKind | null;
  getToken(): YamlTokenKind | null;
  getTokenValue(): string;
  getTokenOffset(): number;
  getTokenLength(): number;
  getTokenLine(): number;
  getTokenColumn(): number;
  getPosition(): number;
  setPosition(pos: number): void;
}

function createScanner(text: string): YamlScanner
```

Pull-based: call `scan()` to advance to the next token, then use
`getToken*()` methods to inspect it. `setPosition()` resets all scanner
state (indentation, flow depth, pending tokens) for incremental re-scanning.

The scanner tracks:

- `pos`, `line`, `col` -- current position
- `lineIndent`, `lineIndentLocked` -- block indentation tracking
- `flowDepth` -- flow context nesting depth
- `blockStarted: Map<number, "map" | "seq">` -- tracks emitted block-start
  markers per indent level
- `pending: YamlToken[]` -- buffer for synthetic tokens (block-map-start,
  block-seq-start) that must be emitted before the next real token

### Token Production

The scanner handles all YAML 1.2 constructs:

- **Newlines and whitespace** -- separate tokens; tab indentation produces
  `error` tokens per YAML 1.2 section 6.1
- **Comments** -- `#` to end of line
- **Document markers** -- `---` and `...` (only at column 0, followed by
  EOF/newline/whitespace)
- **Directives** -- `%` at column 0, consumes entire line
- **Block scalars** -- `|` (literal) and `>` (folded) with header parsing
  (chomp `+`/`-`, explicit indent `1`-`9`), auto-indent detection, and
  proper line folding. Explicit indentation (e.g., `|2`) is computed
  relative to the parent block context (parent indent + explicit digit),
  not just the digit alone
- **Quoted scalars** -- single-quoted (with `''` escape) and double-quoted
  (with full YAML 1.2 escape sequences: `\n`, `\t`, `\x`, `\u`, `\U`,
  `\N`, `\_`, `\L`, `\P`, line continuation)
- **Flow indicators** -- `{`, `}`, `[`, `]`, `,` with flow depth tracking.
  A `,` at `flowDepth === 0` (block context) emits an `error` token
  rather than `flow-separator`, since commas have no meaning outside
  flow collections. This causes inputs like `!!str, xxx` to be rejected
  (resolves U99R).
- **Anchors** (`&name`), **aliases** (`*name`), **tags** (`!`, `!!`, `!<>`)
- **Block structure** -- `?` (explicit key), `-` (sequence entry), `:`
  (value indicator). These emit synthetic `block-map-start` or
  `block-seq-start` tokens via the `ensureBlockMap`/`ensureBlockSeq` helpers
  when entering a new block scope
- **Plain scalars** -- fallback for unquoted text, with trailing whitespace
  trimming
- **Flow context quoted scalar handling** -- the `afterQuotedScalar` flag
  persists across whitespace, newlines, and comments so that `:` on the
  next line after a quoted key is recognized as a value indicator

### Stream API (`lex`)

```typescript
function lex(text: string): Stream.Stream<YamlToken, never>
```

Wraps `createScanner` in `Stream.unfold` for lazy token production. Error
channel is `never` -- lexer errors are embedded as `"error"` kind tokens.

```typescript
function lexAll(text: string): Effect.Effect<ReadonlyArray<YamlToken>, never>
```

Convenience: collects all tokens into an array.

## Parser (`src/utils/parser.ts`)

Transforms tokens into a CST (Concrete Syntax Tree). The CST preserves
every character of the original input.

### Implementation

Recursive descent parser operating on a collected token array (`ParserState`
with `tokens`, `text`, `pos`). Key functions:

- `parseDocuments()` -- top-level: splits input into document nodes
- `parseDocument()` -- directives, document-start marker, content
- `parseBlockMapping()` / `parseBlockSequence()` -- block structures with
  indent-based scoping
- `parseFlowMapping()` / `parseFlowSequence()` -- flow structures with
  bracket matching
- `parseBlockScalar()` -- wraps lexer-produced block scalar tokens
- `parseBlockValue()` -- content after `:` in a block mapping. Handles
  `block-seq-start`/`block-seq-entry` tokens after explicit keys (gated
  by `explicitKey` parameter)
- `parseSequenceEntryContent()` -- content after `-` in a sequence, with
  implicit mapping detection via `hasImplicitMapAhead()`. Checks for
  nested `block-seq-entry` at deeper indent before implicit mapping to
  prevent absorbing nested `- key: value` patterns
- `parseBlockMapping()` -- handles compact block sequences as mapping
  values when a `block-seq-entry` appears at the same indent and the
  last non-trivia child was a value separator `:`
- `parseImplicitBlockMapping()` -- handles `- key: value` patterns. Checks
  token column against parent sequence indent, breaking out when content
  returns to parent level
- `lastNonTriviaIsValueSep()` -- skips anchor and tag nodes (metadata, not
  values) when checking if the previous non-trivia token was a value
  separator
- `findFirstSeqEntryColumn()` -- helper for resolving indent level of the
  first sequence entry in a block

CST node construction:

- `makeContainerNode()` -- computes `source`, `offset`, `length` from
  children's span
- `makeLeafNode()` -- uses raw source text (NOT decoded `token.value`) for
  fidelity

### Public API

```typescript
function parseCST(text: string): Stream.Stream<CstNode, never>
function parseCSTAll(text: string): Effect.Effect<CstNode[], never>
```

## Composer (`src/utils/composer.ts`)

Transforms CST nodes into AST nodes (`YamlDocument`) with YAML 1.2 Core
Schema type resolution.

### Type Resolution

Implements spec chapter 10.3.2:

- `null`, `Null`, `NULL`, `~` -> `null`
- `true`/`True`/`TRUE` -> `true`, `false`/`False`/`FALSE` -> `false`
- Decimal integers, `0o` octal, `0x` hex -> `number`
- Decimal floats, `.inf`/`.Inf`/`.INF`, `-.inf`, `.nan`/`.NaN`/`.NAN` ->
  `number`
- Everything else -> `string`

### Scalar Flow Folding

The composer implements YAML 1.2 §6.5 flow line folding for all scalar
styles:

- **Plain scalars** (`decodePlainScalar`): Trims outer whitespace, then
  applies `foldFlowLines`. Multi-line plain scalars span multiple CST
  `flow-scalar` nodes (one per source line); `collectMultilinePlainScalar`
  merges consecutive plain scalars, stopping at block structure indicators
  (`?`, `:`, `-`), comments, and scalars followed by value-sep (mapping
  keys). It also stops when a candidate scalar is followed by a block-map
  sibling (detected via `hasBlockMapAfterInList`) -- such a scalar is the
  first key of a nested implicit mapping, not a continuation, so the merge
  must terminate so the scalar+block-map validation can fire (resolves
  EW3V). Continuation line detection also handles non-scalar CST nodes
  (anchors, tags, aliases, directives at non-document-start positions)
  via `extractLineContent` and `skipChildrenOnLine` helpers; in the
  non-scalar continuation branch, an optional `minContinuationColumn`
  parameter rejects content that returns to a shallower column than the
  value being continued (so `key: value\n - item1` is not absorbed --
  the col-1 block-seq is a sibling of `key`, not part of `value`).
  `composeBlockSeq` deliberately calls `collectMultilinePlainScalar`
  without `minContinuationColumn` to preserve AB8U-style continuation.
  Multi-line explicit keys (`?` followed by indented continuation
  scalars) are merged via `collectMultilineKey`.
- **Single-quoted scalars** (`decodeSingleQuoted`): Unescapes `''` to
  `'`, then applies `foldFlowLines`.
- **Double-quoted scalars** (`decodeDoubleQuoted`): Processes escape
  sequences first, then applies folding inline. Uses `significantEnd`
  tracking to distinguish escape-produced content (preserved) from raw
  trailing whitespace (trimmed at fold points). Consecutive empty lines
  are consumed in a single pass to avoid double-processing.

`foldFlowLines` implements the core algorithm: bare newlines between
non-empty lines become spaces, empty lines are preserved as newline
characters, and leading whitespace on continuation lines is trimmed.

### CST-to-AST Mapping

The composer walks CST nodes and produces:

- `document` -> `YamlDocument` (with directives, errors, warnings, comment,
  hasDocumentStart)
- `block-map` / `flow-map` -> `YamlMap` with `YamlPair` items
- `block-seq` / `flow-seq` -> `YamlSeq` with `YamlNode` items
- `flow-scalar` / `block-scalar` -> `YamlScalar` with resolved value and
  style detection
- `alias` -> `YamlAlias`
- `anchor` / `tag` -> applied to the next value node
- `comment` -> attached to parent node's `comment` field

`hasDocumentStart` is detected by checking for a `whitespace` CST node
with `source === "---"` among the document's children.

### Scalar Construction (`makeScalar`)

`makeScalar()` builds a `YamlScalar` from a CST scalar node. In addition
to `value`, `style`, `tag`, `anchor`, and `comment`, it populates two
optional round-trip metadata fields:

- **`chomp`** -- for block scalars only, computed by `getBlockChomp(node)`.
  The helper trims leading whitespace from `node.source`, isolates the
  header line (text before the first newline), and returns `"keep"` if it
  contains `+`, `"strip"` if it contains `-`, otherwise `"clip"`. Returns
  `undefined` for non-block scalars. The chomp indicator is required for
  faithful round-tripping of `|+` headers because the resolved value alone
  cannot distinguish between "the value happened to end in a newline" and
  "the source explicitly requested all trailing newlines preserved".
- **`raw`** -- the source representation when `style === "plain"`,
  `typeof value !== "string"`, and the source form differs from
  `String(value)`. The check is performed by `shouldPreserveRaw(rawValue,
  value)`, which returns `true` only for numbers whose source spelling
  (hex `0xFFEEBB`, octal, `450.00`, etc.) does not equal `String(value)`.
  Populated by `makeScalar()` for normal scalar nodes and by the
  plain-scalar paths inside `flattenBlockMapChildren()` (which constructs
  `YamlScalar` instances directly when synthesizing block-map keys/values
  from concatenated `flow-scalar` children).

### TAG Directive Resolution

The composer processes `%TAG` directives to build a tag handle prefix
map (`tagMap` on `ComposerState`). The `resolveTagHandle()` function
expands tag handles when resolving scalars:

- `!!` shorthand is expanded via the `!!` mapping (defaults to
  `tag:yaml.org,2002:`)
- Named handles like `!e!` are expanded via their `%TAG` definition
- Primary `!` handle is expanded via the `!` mapping

The tag map is populated during `composeDocument` and threaded through
all `resolveScalar()` calls.

### Block Map Flattening

`flattenBlockMapChildren()` reorganizes raw CST children into a
structured key/value sequence. Notable behaviors:

- `?` whitespace nodes reset the `afterValueSep` flag
- `hasValueSepBetween` check prevents false scalar-before-block-map
  pattern matching (where a scalar sibling should not be absorbed as
  a key if a value separator appears between them)
- `hasBlockMapAfterInList(children, startIdx)` -- helper that returns
  true when the next non-trivia child after a scalar is a `block-map`
  (i.e., the scalar is the first key of a nested implicit mapping).
  Returns false on a sibling `:` value-sep, so it does not fire on
  ordinary `key: value` shapes. Used both by the leniency-validation
  branch (below) and by `collectMultilinePlainScalar` to terminate
  merges when a scalar-then-block-map sibling pattern is detected.

### Structural Validation in `flattenBlockMapChildren`

The block-map flattener performs column-based key validation to reject
malformed indentation that would otherwise silently parse as nested
structure. State and helpers:

- `pendingExplicitKeyCol` -- column of a `?` indicator that was just
  consumed; the next key pushed uses this column (not the scalar's
  own column) for indentation tracking, so explicit keys with
  continuation content are anchored to `?`.
- `hasExternalKeyColumn` -- only validate against `lastKeyColumn` when
  the parent passed in an externally-anchored first key column. This
  avoids false positives on malformed CSTs where the flattener cannot
  trust its own column inference (e.g., KK5P).
- `validateKeyColumn(col, offset, length)` -- emits an
  `InvalidIndentation` error when `col !== lastKeyColumn` while
  `hasExternalKeyColumn` is true.
- `pushNode` -- before tracking `lastKeyColumn`, resolves the entry
  indent from `pendingExplicitKeyCol` if a `?` was just consumed.
- `precededByExplicitKeyMarker(children, idx)` -- returns true if any
  of the immediately preceding non-trivia siblings is a `?` indicator
  or an empty block-seq placeholder (length 0) or a `?`-only block-map
  sentinel. Used by the stray-dash check to allow KK5P-style explicit
  keys (`? - a`) where the parser shape includes such placeholders.
- `lineIndentColumn(text, offset)` (shared helper) -- returns the
  column of the first non-whitespace character on the line containing
  `offset`. Used in place of `lineCol(text, offset).column` whenever
  the relevant column is the line's leading-content column rather than
  the offset's own column. This matters when a key has metadata
  before the scalar (e.g. `!<tag> foo:` has line-indent 0 but the
  scalar's offset column is 25); the key's effective indent is the
  metadata column, not the scalar column. `composeBlockMap` uses this
  helper to compute `extKeyCol` from the externally-passed first key.

Validation is applied at the following points:

1. **Scalar+block-map first-key path** -- when a scalar is in key
   position and is followed by a block-map sibling (the implicit
   nested-mapping case), `validateKeyColumn` runs against the scalar's
   column. This catches misalignments like DMG6 / EW3V / N4JP / U44R
   where the inner key is not aligned with the outer key column.
2. **Block-seq in key position** -- when a non-empty block-seq appears
   with `afterValueSep === false` and no preceding `?` indicator, the
   flattener emits `InvalidIndentation`. Empty placeholder block-seqs
   (`length === 0`) are excluded so KK5P still parses. Catches ZVH3.
3. **Document-start line** -- in `composeDocument`, when the
   scalar+block-map pattern is detected at document level **and**
   `hasDocumentStart` is true **and** the scalar is on the same line
   as `---`, the composer emits `UnexpectedToken` "Mapping cannot
   start on document-start (---) line". Catches 9KBC and CXX2.
4. **Property continuation column** -- `validatePropertyContinuationColumn`
   is called from the anchor/tag handler when a property (anchor or
   tag) appears in value position. If the property is on a continuation
   line (not the same line as the introducing `:`), its column must
   be strictly greater than `parentKeyColumn` (computed via
   `lineIndentColumn` so it accounts for metadata-before-scalar
   keys). Catches G9HC and H7J7 (anchor/tag at parent column under
   a map value).
5. **Stray block-seq entry on continuation line** -- in the `-`
   whitespace handler, a stray `-` outside any block-seq, on a
   continuation line, with no `?`-explicit-key context (checked via
   `precededByExplicitKeyMarker`), emits `InvalidIndentation`.
   Catches 4HVU ("Wrong indentation in Sequence").
6. **Quoted scalar continuation indent** --
   `validateQuotedScalarContinuationIndent` runs from the flow-scalar
   branch when the scalar's style is `single-quoted` or `double-quoted`
   and the scalar is in value position. Continuation lines whose first
   non-whitespace column is `<= parentKeyColumn` produce
   `InvalidIndentation`. Catches QB6E (multi-line quoted value indented
   at or below the key column).
7. **No tab after continuation value-sep** --
   `validateNoTabAfterContinuationValueSep` runs from the `:` branch.
   When the `:` is at column 0 (start of a continuation line) AND
   followed by a tab plus same-line content, the helper emits a
   `TabIndentation` error. The fatal-error filter in `parseDocument`
   was extended to include `TabIndentation` so this fails the parse.
   Catches Y79Y/009 (tab as block indentation after a value indicator).
8. **No double anchor on a non-key scalar** --
   `validateNoDoubleAnchorOnScalar` runs from the flow-scalar /
   block-scalar branch. When both `outerMeta.anchor` and
   `pendingMeta.anchor` are set AND the scalar is not a key (no
   following `:` value-sep, no following block-map sibling), the
   helper emits `UnexpectedToken`. Catches 4JVG (a single scalar
   value carrying two anchors).

### Trailing-Content Detection in Scalar Root

When the document root is a scalar and additional content follows that
cannot be merged via multi-line plain scalar collection, the composer
flags trailing content. This now also fires for scalar+block-map
sibling patterns (using `hasBlockMapAfterInList`), preserving the 2CMS
rejection that previously relied on the multi-line merge consuming
the "invalid" continuation.

The standalone-scalar branch of `composeDocument` extends this check
to the `partsCount === 1` case as well: when
`collectMultilinePlainScalar` stops because of an intervening comment
(leaving a single line in `parts`), `checkTrailingContentAfterDocValue`
is still invoked so a subsequent flow-scalar across the comment is
flagged as trailing. Catches BS4K (comment between plain scalar lines
that would otherwise look like a single value).

`InvalidIndentation` is included in all three fatal-error filters
(`parseDocument`, `parseAllDocuments`, `composeDocumentFromCst`) so
that these structural-validation errors fail the parse Effect rather
than being absorbed as warnings. `TabIndentation` and `UnresolvedTag`
were added to both the `parseDocument` and `parseAllDocuments` filters
so that a tab used as block indent after a continuation-line value
indicator (Y79Y/009) and a `!handle!suffix` whose handle is not
declared in the same document (QLJ7) are fatal at either entry point.
`composeDocumentFromCst` keeps the narrower filter
(`InvalidIndentation` only) because it is the low-level entry point
used by visitors and other consumers that should not fail on these
higher-level structural rejections.

### Composer Flow-Content Indent Validation

`composeFlowMap` and `composeFlowSeq` accept an optional
`parentBlockColumn?: number` parameter. When set, the new helper
`validateFlowContentIndent` walks the source text between the flow
opener (`{` or `[`) and the closing bracket and rejects any
continuation line whose first non-whitespace column is
`<= parentBlockColumn`. Per YAML 1.2 §7.4, flow content nested under
a block context must be more indented than its parent block.

Callers pass:

- `lastKeyColumn` from `flattenBlockMapChildren` (when a flow
  collection appears in value position under a block mapping)
- `seqIndent` (computed via `lineIndentColumn`) from `composeBlockSeq`
  (when a flow collection appears as a block-seq entry)
- `undefined` from `composeDocument` at root level (no parent block,
  so the check is skipped)

Catches 9C9N and VJP3/00 ("Flow content indentation").

### Anchor Before Sequence Dash on Same Line

`composeDocument`'s anchor/tag handlers call
`validateAnchorTagNotFollowedBySeqDashOnSameLine`. The helper scans
forward through the children looking for a `block-seq` whose first
entry begins on the same source line as the just-seen anchor or tag.
Empty `block-seq` placeholders (length 0) are skipped during the
forward scan because they do not represent actual content. When a
real same-line `-` is found, the composer emits `UnexpectedToken`.
Catches SY6V ("Anchor before sequence entry on same line").

### Block Scalar Leading-Empty Validation

`makeScalar()` calls `validateBlockScalarLeadingEmpties` for
block-literal and block-folded scalars. The helper walks the raw
source after the header line, tracks the indent of leading
whitespace-only lines, then -- when the first non-empty content line
is found -- rejects any preceding empty whose indent exceeds the
content indent. Per YAML 1.2 §8.1.1, `l-empty(n,c)` requires `<= n`
spaces, so a leading blank line that is more indented than the
first real content line is invalid. Catches 5LLU, S98Z, and W9L4.

### Multi-Line Implicit Keys (Flow Collections)

The existing `checkMultilineImplicitKeys` helper -- which previously
only flagged scalar keys whose source spans multiple lines -- was
extended to cover `YamlMap` and `YamlSeq` keys with `style === "flow"`
whose source spans multiple lines. A flow collection used as an
implicit mapping key must fit on a single line. Catches C2SP ("Flow
mapping key on two lines").

### Cross-Document Tag-Handle Validation

`validateCrossDocumentDirectives` was extended: for every document
index `>= 1` (regardless of whether that document declares its own
directives), the new `validateTagHandlesInDocument` helper walks
the document's CST. It builds the per-document handle set from
`%TAG` directives, then walks all `tag` CST nodes and emits
`UnresolvedTag` for any `!handle!suffix` whose handle is not declared
in this same document. Verbatim tags (`!<...>`), `!!`-prefixed
shorthands, and bare `!` are always considered valid. Catches QLJ7
("Tag shorthand used in documents but only defined in the first
document").

### Anchor/Alias Handling

- `buildAnchorMap(node)` -- builds a `Map<string, YamlNode>` from anchor
  definitions in the AST
- Alias resolution in `getNodeValue()` uses the anchor map to substitute
  aliased values
- `maxAliasCount` option (default 100) prevents DoS via alias expansion
- `checkAnchorOnAlias()` validates that anchors are not applied to alias
  nodes (produces `DuplicateAnchor` fatal error). Aliases used as
  implicit mapping keys (followed by block-map) skip this check since
  the anchor applies to the map, not the alias.

### Newline-Aware Tag/Anchor Split in `composeBlockSeq`

`composeBlockSeq()` tracks `pendingMeta` (the most-recent uncomsumed
tag/anchor) plus a `sawNewlineSincePending` flag. The flag is set when
a `newline` CST child is encountered while `pendingMeta` is non-empty,
and cleared whenever the meta is consumed. When the next significant
content is a flow-scalar followed by a block-map (the implicit-map case
inside a sequence entry, e.g. `- !!map\n  key: value`), the helper
splits the meta:

- If `sawNewlineSincePending` is true, the pending meta belongs to the
  outer container (the implicit map). The first key is constructed
  with no meta, and `composeBlockMap(blockMap, state, key, mapMeta)`
  receives `mapMeta`.
- Otherwise, the pending meta attaches to the first key (legacy
  behavior: `&a key: value` anchors the key, not the map).

Without this split, a tag like `!!map` written above the first key on
its own line was incorrectly attached to the key (or silently dropped
when the next anchor overwrote it). The same flag is also reset on
every other code path that consumes `pendingMeta` (scalar, alias,
block-map, block-seq, empty-key cases).

### Flow Collection as Document-Level Key

When `composeDocument()` encounters a `flow-seq` or `flow-map` CST node
followed by a `block-map` sibling, the flow collection becomes the first
key of an implicit mapping via `composeBlockMap(blockMap, state, flowNode)`.
When metadata is present, the `outerMeta` split (described below) routes
it to the outer block-map; the remaining `meta` attaches to the flow
collection that becomes the inner first key. Both `flow-map`-as-key and
`flow-seq`-as-key paths use this split.

### Document-Level Outer/Inner Meta Split (`composeDocument`)

`composeDocument()` maintains two metadata slots:

- `meta` -- the most-recent uncommitted tag/anchor at document level.
- `outerMeta` -- meta that has crossed a newline boundary and therefore
  belongs to the outer container (the root collection), not to whatever
  inner key/scalar it precedes.

A `sawNewlineSinceMeta` flag is set whenever a `newline` CST child is
seen while `meta` is non-empty. When the next `anchor` or `tag` child
arrives, the helper `commitMetaAcrossNewline()` moves the existing
`meta` into `outerMeta` (because that meta crossed a newline) and
starts a fresh `meta` for the incoming token. Without this commit step,
a sequence like `&a !!t1\n&b !!t2 key: ...` would silently overwrite
the first pair when the second arrives.

When the document's root content is finally constructed, all six
content-producing paths consult both slots:

- **block-map** / **block-seq** / **flow-map** / **flow-seq** as root
  collection -- combine `outerMeta` and `meta` (both apply to the same
  collection at root level when there is no inner key).
- **flow-map** / **flow-seq as key** (followed by a `block-map`
  sibling) -- when `outerMeta` is set, route it to the outer
  `composeBlockMap` call as `mapMeta`; route remaining `meta` to the
  flow collection (the inner first key). When `outerMeta` is empty,
  combine both into the flow collection's meta.
- **scalar root** (including the multi-line plain scalar path via
  `collectMultilinePlainScalar`) -- combine `outerMeta` and `meta` and
  apply to the scalar.
- **scalar as block-map key** -- when `outerMeta` is set, it becomes
  the map meta and `meta` becomes the key meta. When `outerMeta` is
  empty, the legacy `hasDocStart && hasMeta(meta)` rule still treats
  `meta` as map-level (otherwise it attaches to the key). The same
  three-branch resolution is applied to both the `block-map` follow-on
  case and the flat (`hasValueSepAfter`) case.

After the root content is built, both `meta` and `outerMeta` are
cleared and `sawNewlineSinceMeta` is reset.

### Explicit Key `?` in Flow Mappings

`flattenFlowChildren()` recognizes `?` whitespace nodes as explicit key
indicators, emitting `{ kind: "key" }` semantic items. `buildPairs()`
handles key items without an attached node by consuming the next node
item as the explicit key. Trailing `?` with no content creates a
null-key entry.

### Error Handling

Composition errors produce `YamlComposerError` containing:

- `errors: ReadonlyArray<YamlErrorDetail>` -- with code, message, offset,
  length, line, column
- `text: string` -- the original source

Error codes: `UndefinedAlias`, `DuplicateAnchor`, `CircularAlias`,
`UnresolvedTag`, `InvalidTagValue`, `AliasCountExceeded`,
`InvalidIndentation`, `UnexpectedToken`, `TabIndentation`. The
indentation, token, and tab-indentation codes are produced by the
structural-validation paths in `flattenBlockMapChildren` and
`composeDocument` (see "Structural Validation in
`flattenBlockMapChildren`" above) and are reported on the
`YamlComposerError` channel rather than `YamlParseError`.
`UnresolvedTag` is also produced by the cross-document tag-handle
check (`validateTagHandlesInDocument`) when a `!handle!suffix` tag
references a `%TAG` handle that was only declared in a different
document of the same stream.

### Block Scalar Decoding

The composer's `decodeBlockScalar()` re-decodes block scalar content from
the CST `source` field independently of the lexer. Explicit indentation
is computed using `findParentIndent()`, which scans backward through the
full source text to find the `:` or `-` that introduced the block scalar,
then adds the explicit indent digit to that parent indent level. This
ensures correct content extraction when block scalars are nested inside
mappings or sequences.

See also the "Dual Block Scalar Decoders" note in
[compliance-testing.md](./compliance-testing.md) -- any block scalar fix
must be applied in both the lexer and composer.

### Composer Public API

```typescript
function parse(
  text: string,
  options?: Partial<YamlParseOptions>,
): Effect.Effect<unknown, YamlComposerError>

function parseDocument(
  text: string,
  options?: Partial<YamlParseOptions>,
): Effect.Effect<YamlDocument, YamlComposerError>

function parseAllDocuments(
  text: string,
  options?: Partial<YamlParseOptions>,
): Effect.Effect<YamlDocument[], YamlComposerError>
```

`parse()` returns the plain JS value (first document). `parseDocument()`
returns the full `YamlDocument` AST. `parseAllDocuments()` returns all
documents for multi-document streams.

## AST Navigation (`src/utils/ast.ts`)

Utilities for traversing the AST after parsing:

```typescript
// Type guards
function isScalar(node: unknown): node is YamlScalar
function isMap(node: unknown): node is YamlMap
function isSeq(node: unknown): node is YamlSeq
function isPair(node: unknown): node is YamlPair
function isAlias(node: unknown): node is YamlAlias
function isNode(node: unknown): node is YamlNode
function isDocument(node: unknown): node is YamlDocument

// Navigation (all Fn.dual(2, ...))
const findNode: (root, path) => Effect<Option<YamlNode>>
const findNodeAtOffset: (root, offset) => Effect<Option<YamlNode>>
const getNodePath: (root, offset) => Effect<Option<YamlPath>>

// Value extraction
function getNodeValue(node: YamlNode): Effect<unknown>
```

`findNode` navigates by string keys (YamlMap) and numeric indices (YamlSeq).
`findNodeAtOffset` finds the deepest node containing a character offset.
`getNodePath` returns the path segments leading to a node at a given offset.
`getNodeValue` recursively extracts plain JS values (aliases return the
anchor name, not the resolved value).
