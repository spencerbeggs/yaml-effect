---
"yaml-effect": patch
---

## Bug Fixes

Adds composer-level validation to reject 25 invalid YAML inputs that the parser
previously accepted. Implements six validation groups covering document markers,
comment spacing, trailing content after quoted scalars and flow collections,
nested same-line mappings, and trailing block content.

- Reject stray scalars after block mappings and sequences (236B, 6S55, 9CWY, BD7L, TD5N, 7MNF)
- Reject nested mapping indicators on the same line (ZCZ6, ZL4Z, HU3P, 2CMS, 5U3A)
- Reject trailing content after quoted scalars (Q4CL, JY7Z)
- Reject trailing content after flow collections (P2EQ, 62EZ, KS4U)
- Reject comments without preceding whitespace (9JBA, CVW2)
- Reject content on document marker lines (3HFZ, LHL4)
- Reject other invalid patterns (8XDJ, BF9H, G7JE, GDY7, GT5M)

XFAIL map reduced from 47 to 36 entries. Raw compliance: 932/1226 (was 907/1226).
