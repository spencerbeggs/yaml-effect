/**
 * YAML document and directive schemas.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { YamlErrorDetail } from "../errors/YamlErrorDetail.js";
import type { YamlNode as YamlNodeType } from "./YamlAstNodes.js";
import { YamlNode } from "./YamlAstNodes.js";

/**
 * A YAML directive appearing at the top of a document (e.g., `%YAML 1.2`
 * or `%TAG ! tag:yaml.org,2002:`).
 *
 * @remarks
 * - `name` — either `"YAML"` (version directive) or `"TAG"` (tag directive).
 * - `parameters` — the directive's parameter tokens as raw strings.
 *
 * @public
 */
export class YamlDirective extends Schema.Class<YamlDirective>("YamlDirective")({
	name: Schema.Literal("YAML", "TAG"),
	parameters: Schema.Array(Schema.String),
}) {}

/**
 * A parsed YAML document, containing the root AST node, any parse errors or
 * warnings, YAML directives, and an optional document-level comment.
 *
 * @remarks
 * - `contents` — the root {@link YamlNode} of the document, or `null` for an
 *   empty document.
 * - `errors` — {@link YamlErrorDetail} entries produced during parsing.
 * - `warnings` — non-fatal {@link YamlErrorDetail} entries produced during
 *   parsing.
 * - `directives` — {@link YamlDirective} entries declared before the document
 *   content.
 * - `comment` — optional document-level comment text.
 *
 * @example
 * ```typescript
 * import type { YamlNode } from "yaml-effect";
 * import { isMap, isScalar, parseDocument } from "yaml-effect";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const doc = yield* parseDocument("name: Alice\nage: 30");
 *
 *   // Access the root AST node
 *   const root: YamlNode | null = doc.contents;
 *   if (root && isMap(root)) {
 *     console.log(root.items.length); // 2
 *   }
 *
 *   // Check for parse errors and warnings
 *   console.log(doc.errors.length);   // 0
 *   console.log(doc.warnings.length); // 0
 * });
 * ```
 *
 * @public
 */
export class YamlDocument extends Schema.Class<YamlDocument>("YamlDocument")({
	contents: Schema.NullOr(Schema.suspend((): Schema.Schema<YamlNodeType> => YamlNode)),
	errors: Schema.Array(YamlErrorDetail),
	warnings: Schema.Array(YamlErrorDetail),
	directives: Schema.Array(YamlDirective),
	comment: Schema.optional(Schema.String),
	hasDocumentStart: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	hasDocumentEnd: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}
