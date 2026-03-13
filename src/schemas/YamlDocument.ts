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
 * @public
 */
export class YamlDocument extends Schema.Class<YamlDocument>("YamlDocument")({
	contents: Schema.NullOr(Schema.suspend((): Schema.Schema<YamlNodeType> => YamlNode)),
	errors: Schema.Array(YamlErrorDetail),
	warnings: Schema.Array(YamlErrorDetail),
	directives: Schema.Array(YamlDirective),
	comment: Schema.optional(Schema.String),
}) {}
