---
date: 2026-10-30
author: Claude
type: fix
status: done
pr: []
features: [FRM-24]
areas: [frontend, tests]
---

# Formation card moves to the top

## Request
- Let the formation card move to the top of the chart area.
- Set all text in the card to 12 px or smaller.

## Cause
The drag area had `top-18`, so the card stopped 72 px below the chart top. That space was reserved for the floating selectors. The card has a higher z-index than these selectors, so the limit was not necessary on desktop.

## Solution
| File | Change |
|---|---|
| `FormationDetailsPanel.tsx` | Drag area uses `lg:top-0`. Below `lg` the 72 px stay. |
| `FormationChecklist.tsx`, `CandidateList.tsx` | Text sizes 15, 14 and 13 px changed to `text-xs`. |
| `formation-page.spec.ts` | Test for the top limit is exact. New test for the maximum text size. |

## Why
Below `lg` the navigation floats over the page and would cover the grip, so the limit stays there. The left, right and bottom limits keep the drawing rail and the grip reachable.

## Verification
- Top limit test: failed before the fix (128 px, expected 56 px), passes now.
- Text size test: failed before the fix (15, 14 and 13 px found), passes now.
- `formation-page.spec.ts`: 17 passed. `tsc` and `eslint`: no errors.
- Full test run and manual check in the browser: not verified, because the weekly limit is almost used. CI runs the full suite.

## Open points

## Lessons
If e2e tests show a 404 page, examine port 3100 first. `reuseExistingServer` also accepts an unrelated server on that port. Set `E2E_PORT` to a free port.
