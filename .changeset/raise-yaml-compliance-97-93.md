---
"yaml-effect": minor
---

## Features

### YAML 1.2 spec compliance raised to 97.93%

Round-trip canonical output now preserves source representation in
several places that previously lost information.

- Block scalar chomp indicators (keep, strip, clip) are tracked on the
  scalar AST node so a keep-chomp block scalar parses, stringifies, and
  re-parses without losing trailing-newline semantics.
- Numeric scalars expose the source representation on a new optional
  field so non-canonical numeric formats survive a parse-stringify round
  trip. Hex literals like 0xFFEEBB stay hex, and decimals with trailing
  zeros like 450.00 keep their precision.
- Tag and anchor placement on block collections now honours newlines
  between the marker and the inner key. A tag that crosses a newline
  attaches to the collection rather than to the first key inside it.
- Document-level outer/inner metadata is split when a doc starts with
  metadata on one line and a tagged or anchored first key on the next.
  Both pieces of metadata are now preserved instead of the inner one
  silently overwriting the outer one.
- The stringifier emits an explicit document-end marker after a document
  whose final scalar uses keep-chomp, so the open-ended scalar has an
  unambiguous terminator on output.

### New optional fields on YamlScalar

YamlScalar gains two optional fields that callers can read but are not
required to construct.

- chomp: literal "strip" / "clip" / "keep" populated when the source
  uses a block scalar header. Surfaces the original chomp indicator for
  consumers that need to render canonical YAML or build tools that
  depend on byte-for-byte fidelity.
- raw: the source representation string, populated only when the
  resolved value is non-string and the source form differs from the
  default JS rendering. Useful for IDEs and formatters that want to
  preserve the user's chosen numeric notation.

## Bug Fixes

- Fixed a regression where a keep-chomp block scalar with newline-only
  content was emitted as a double-quoted scalar, breaking round-trip.
- Fixed canonical output for sequences whose tagged item is a block
  map: the tag now sits on its own line above the indented map keys
  rather than inline with the first key.
- Fixed canonical output for explicit-key entries whose key is a
  collection with anchor-only metadata on its first line. Continuation
  lines now sit at the same indent as the question-mark marker rather
  than indented one level deeper.
