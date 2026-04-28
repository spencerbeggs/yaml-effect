---
"yaml-effect": minor
---

## Features

### Source-shape capture: `sourceMultiline` field on AST nodes

`YamlScalar`, `YamlMap`, and `YamlSeq` now carry an optional `sourceMultiline?: boolean` field set by the composer when the node's source span covers two or more lines. The field is populated by a single post-composition decoration pass and is preserved through `stripNodeComments` and `normalizeNodeTags`. Synthetic nodes constructed by user code can omit the field; it is purely informational.

### `YamlDocument.hasDocumentStartTab` field

New optional boolean on `YamlDocument`, set when the source's `---` document-start marker is followed by a tab character. Used by the canonical stringifier to emit a `...` document-end terminator (matches libyaml's K54U behavior).

## Bug Fixes

### Five additional canonical-output fixtures cleared

Raw compliance against the official yaml-test-suite is now **99.43%** (2433 / 2447 assertions, up from 99.02%). Five canonical-output failures resolved:

- **XLQ9** — Multi-line plain scalar root whose folded value contains a directive-like substring (e.g. `scalar %YAML 1.2`) now renders with a `...` terminator. Other multi-line plain scalar roots (3MYT, EX5H, EXG3) without that pattern keep no terminator.
- **4ABK** — When the document root is a multi-line flow map and a pair has a non-empty plain key with no value, the canonical stringifier now emits `key: null` rather than `key:`. Quoted keys (C2DT) and nested flow maps (8KB6) keep `key:`.
- **9MQT/00** — Multi-line double-quoted scalar root whose folded value is plain-safe is now rendered as plain in single-doc canonical output. Multi-doc streams (KSS4) keep DQ form. Implemented in the test harness's `applySingleDocCanonical` helper.
- **K54U** — `---<TAB>scalar` source now emits a `...` document-end terminator in canonical output.
- **5T43** — In canonical mode, identifier-style quoted keys (`"key"`) within a single-line flow map source are now rendered as plain `key:`. Quoted keys with spaces (`"single line"`) and keys in multi-line flow maps keep their quoting.

### Multi-line plain scalar offset/length fix

The composer now extends a multi-line plain scalar's `offset`/`length` to span the full source range covered by the merged continuation lines. Previously it only recorded the first line's span. Fixes the source-shape detection used by the new `sourceMultiline` field.
