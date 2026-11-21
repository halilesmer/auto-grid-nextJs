---
date: 2026-11-20
author: Claude
type: decision
status: done
pr: []
features: [FRM-44]
areas: [frontend, tests]
---

# The D badge sits below D for a buy and above D for a sell

## Request
- The project owner asked on 2026-11-20 that the formation summary badge (for example "Butterfly ✓") shows below point D for a buy and above point D for a sell. He approved the design (Artifact with four views) first.

## Solution
| File | Change |
|---|---|
| `src/lib/formation/drawingLayout.ts` | `layoutExpectedD`: with one badge, the badge is centered on D. It sits below the D letter for a buy and above it for a sell (`D_LETTER_SPACE` = 24 px from the D center). The badge stays inside the drawing area on all four sides. |
| `e2e/mocked/formation-expected-d-lib.spec.ts` | The old check "badge is right of D" is removed. New FRM-44 test for buy, sell, bottom and top limit, and right limit. |

## Why
- The D letter sits next to the point on the outer side (below a buy low, above a sell high). The badge goes past the letter, so the two never overlap.
- With more than one badge, the stack at the right edge did not change. The badges there belong to different D levels, and the stack keeps them apart. The approved design showed two formations at the same D below or above each other. That case is not built.

## Verification
- `npx tsc --noEmit`: no error.
- `npx playwright test e2e/mocked/formation-expected-d-lib.spec.ts`: 12 passed.
- Not checked: the badge on the real chart in the browser, and the full e2e run (`precheck.sh`).

## Open points
- [ ] Stack case with more than one badge: decide if each badge also moves to its own D (buy below, sell above).
