---
"yaml-effect": patch
---

## Bug Fixes

Improve YAML 1.2 compliance from 82% to 86% with stringifier and canonical output fixes.

- Strip comments in canonical/forceDefaultStyles mode
- Inline scalar values after document start marker (`--- value`)
- Place anchor/tag metadata on own line before block collections
- Fix anchor/tag ordering to canonical form (`&anchor !!tag`)
- Render empty scalars without trailing space or spurious `null`
- Add `hasDocumentEnd` tracking and `...` marker emission
- Preserve block scalar styles (literal/folded) in canonical mode
- Emit truly empty lines in block scalars (no indent whitespace)
- Indent nested block mapping values on next line
- Add space before colon for alias keys (`*a :` not `*a:`)
