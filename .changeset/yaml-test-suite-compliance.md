---
"yaml-effect": patch
---

## Features

Add official yaml-test-suite integration for YAML 1.2 compliance validation. The suite runs ~440 test cases from the community-standard test suite against our parser, checking parse correctness, JSON output, canonical stringifier output, and roundtrip fidelity. Known gaps are tracked via skip maps. A compliance GitHub Action generates dynamic badges showing parse and full compliance percentages.
