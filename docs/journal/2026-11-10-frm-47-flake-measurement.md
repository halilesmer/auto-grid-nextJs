---
date: 2026-11-10
author: Claude
type: diagnosis
status: done
pr: []
features: [FRM-47]
areas: [tests, frontend]
---

# FRM-47 flake: measurement alone and under load

## Request
Close the open question from `2026-11-06-line-menu-a11y-r2-rest.md`: the test "Escape gibt den Fokus an das vorherige Element zurück" failed 3 of 60 and 1 of 100 runs under load. Cause was not proven.

## Measurement
- Alone (`scripts/features/run.sh e2e FRM-47`, one run at a time, no other heavy job): 10 runs x 20 tests = 200 test results, 0 failures.
- Under load (`scripts/features/run.sh e2e`, full mocked e2e under the heavy lock, 3 workers): 3359 passed, 0 failed, 0 flaky. The 20 FRM-47 tests were part of it.

## Decision
The rule of this project applies: a timeout under load is not a red test, and code changes only if the test also fails alone. It did not fail alone. No code or test changed. The assumption from 2026-11-06 (toolbar button rebuilt between `focus()` and the menu opening) stays unproven.

## Open
If the failure comes back, log removed nodes and `document.activeElement` at the `contextmenu` event first, then change code.
