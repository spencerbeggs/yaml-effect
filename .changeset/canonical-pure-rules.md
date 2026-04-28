---
"yaml-effect": minor
---

## Bug Fixes

### K858 canonical output

Empty keep-chomp block-literal values used as block-mapping values now render with the explicit indent indicator (`|2+`) to match libyaml's canonical emitter. Block-sequence items (e.g. `- |+`) are unchanged. The `StringifyContext` gained an internal `parentPosition?: "block-map-value" | "block-seq-item"` field so renderers can differentiate the two contexts.

## Features

### Reserved directives are preserved

`YamlDirective.name` is now `Schema.String` (was `Schema.Literal("YAML", "TAG")`). Reserved directives — those with names other than `YAML` or `TAG` per YAML 1.2 §6.8.1 — are now retained on `YamlDocument.directives`. Existing code that compares `directive.name === "YAML"` continues to work; the schema widening is non-breaking.

`parseDirective` also strips trailing comments from directive parameters (e.g., `%FOO bar # comment` parses with parameters `["bar"]`).
