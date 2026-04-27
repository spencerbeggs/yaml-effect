---
"yaml-effect": patch
---

## Bug Fixes

### Tighter rejection of malformed YAML

Added composer-side structural validations that clear all 15 remaining XFAIL fixtures from the official yaml-test-suite. Raw spec compliance rises from 98.27% to 98.89% (2397/2424 assertions passing), and the XFAIL skip map is now empty.

Inputs that the YAML 1.2 spec says should be rejected as invalid — but that previous releases silently accepted — now fail with `YamlComposerError`. The error channel and shape are unchanged, so downstream `Effect.catchTag("YamlComposerError", ...)` handlers see no difference; they simply receive more cases that were previously squeezed through as garbage data.

Newly rejected cases:

- Anchor or tag followed by a block-sequence `-` indicator on the same line (SY6V).
- Anchor or tag in a map value's continuation line at column less than or equal to the parent key's column (G9HC, H7J7).
- A stray `-` block-seq entry indicator at an indent shallower than its sibling sequence (4HVU).
- Multi-line flow collection content whose continuation lines are not indented past the parent block (9C9N, VJP3/00).
- A multi-line flow collection used as an implicit mapping key (C2SP).
- A multi-line quoted scalar whose continuation lines are not indented past the parent key (QB6E).
- A plain scalar that appears to continue across a comment line (BS4K).
- A block scalar whose leading empty lines are more indented than the first content line (5LLU, S98Z, W9L4).
- A scalar value carrying two separate anchor declarations (4JVG).
- A tab character used as block indent after a value indicator on a continuation line (Y79Y/009).
- A `!handle!suffix` reference in a document where no `%TAG` directive declares that handle, even when an earlier document in the same stream did (QLJ7).

The composer now emits two error codes that previously appeared only on the parser channel: `TabIndentation` (Y79Y/009) and `UnresolvedTag` (QLJ7). These are listed in the `YamlComposerErrorCode` union and surface through `parse`, `parseDocument`, and `parseAllDocuments`.
