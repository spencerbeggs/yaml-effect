---
"yaml-effect": patch
---

## Bug Fixes

### Composer anchor placement

Resolves several bugs where anchors and tags were attached to the wrong AST node during composition. Raw YAML 1.2 compliance climbs from 97.24% to 97.47% (5 more canonical-output tests pass).

- Block-map composition now tracks outer and inner metadata separately. When an anchor or tag appears before a newline and a second anchor or tag appears on the indented line that follows, the first now attaches to the new mapping and the second attaches to the first key. Previously the second overwrote the first, dropping one anchor and misplacing the other.
- Empty sequence items now retain their anchor or tag. Inputs like a sequence whose first item is an empty entry with an anchor on its own line followed by a populated next entry no longer migrate the anchor to the wrong item.
- A block mapping that begins with a value indicator (implicit empty key) now correctly carries the pending anchor or tag on that empty key rather than on the surrounding map.

### Stringifier separator for anchored empty keys

Mapping keys whose only rendering is an anchor or tag (zero-length empty scalar with metadata) now emit a space before the colon. This matches the existing handling for alias keys and prevents readers from absorbing the colon into the anchor or tag name.
