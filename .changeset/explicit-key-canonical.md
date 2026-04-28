---
"yaml-effect": patch
---

## Bug Fixes

### Explicit-key canonical output

Closes 4 of the 17 remaining canonical-output failures (KK5P, M5DY, M2N8/00, M2N8/01) by improving how the parser, composer, and stringifier handle YAML's explicit-key (`?`) form. Raw compliance against the official yaml-test-suite is now 98.94% (up from 98.62%).

- Parser: `parseBlockMapping` keeps gathering siblings when a `?`-introduced explicit key is itself a block sequence whose `block-seq-start` sits at the lineIndent (M5DY: `? - Detroit Tigers\n  - Chicago cubs\n: ...`). The seq's indent is anchored to the first `-` column rather than the lexer-emitted lineIndent.
- Composer: a new `scanExplicitKeyShape` helper detects compact inline implicit-map keys after `?` (M2N8/00 `- ? : x`, M2N8/01 `? []: x`) and composes the slice as a `YamlMap` key. A same-line check prevents mis-firing on sibling pairs across lines.
- Composer: `checkMultilineImplicitKeys` skips the multi-line flow-collection-as-implicit-key check when the key was introduced by `?` (M5DY second doc with `? [ ... ,\n   ... ]`).
- Stringifier: `isComplexKey` tightened to fire only for non-empty collection keys. Empty `[]` / `{}` keys render as inline implicit `[]: x` rather than the explicit `? []\n: x` form.
