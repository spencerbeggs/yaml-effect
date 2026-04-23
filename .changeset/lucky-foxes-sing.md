---
"yaml-effect": minor
---

## Features

- Added YAML 1.2 named escape sequences to the stringifier (`\a`, `\b`, `\e`, `\f`, `\v`, `\0`, `\_`, `\N`, `\L`, `\P`) for spec-compliant double-quoted scalar output.
- Added canonical unicode escaping in the stringifier: non-printable and non-ASCII characters are now rendered as `\uXXXX` or `\UXXXXXXXX` escape sequences instead of raw bytes.
- Added tag normalization via `%TAG` directives in the stringifier: tag handles (e.g., `!!str`) are resolved and expanded using the document's directive prefix map before output.
- Added explicit key (`?`) syntax support in the stringifier for non-scalar mapping keys, enabling round-trip fidelity for complex keys such as sequences and mappings.
- Added explicit key (`?`) indicator support in the composer for flow mappings, so `{? key: value}` is now parsed correctly.
- Added whitespace-only and empty block scalar handling in the stringifier: scalars that consist entirely of whitespace are rendered as block literals rather than being silently collapsed.
- Added block literal indent indicator output for block scalars with leading empty lines (e.g., `|2`), preventing ambiguity in the re-parsed indent level.
- Added multiline mapping key stringification: mapping keys that span multiple lines are now rendered as double-quoted scalars rather than producing malformed plain scalar output.
- Added quoting for strings containing trailing whitespace or tabs adjacent to indicator characters (`:`, `#`), preventing silent data loss on re-parse.
- Flow sequences and flow mappings may now appear as implicit mapping keys at the document level; the composer correctly identifies these as `block-seq-start` context entries.
- Added anchor-on-alias `DuplicateAnchor` validation in the composer: redefining an anchor that is already in use now produces a `YamlComposerError` with code `DuplicateAnchor`.

## Bug Fixes

- Fixed compact block sequence as a mapping value: a sequence appearing immediately after a `:` at the same indentation level is now parsed as the value of that mapping entry rather than being treated as a sibling node.
- Fixed nested sequences inside compact seq-of-maps (`- - item`) so that inner sequences are correctly attached as values rather than being dropped.
- Fixed the parser's `block-seq-start` indent check for implicit mappings: the sequence-start threshold is now derived from the enclosing mapping's indent rather than the current token's column, resolving misclassification of deeply nested entries.

## Performance

- YAML 1.2 test suite compliance increased from 82.2% to 93.3% (1,144 of 1,226 assertions now pass).
- Stringify round-trip failures reduced from 18 to 0: every test case that can be parsed can now be stringified and re-parsed to an identical value.
