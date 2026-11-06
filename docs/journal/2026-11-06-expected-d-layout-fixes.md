---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [FRM-44]
areas: [frontend]
---

# Expected D: past time and badge stack layout

## Request
Audit R1 found two layout defects in the expected D (plan 1105-A5): R1-07 and R1-08. Fix only the layout. Do not change the design.

## Cause
- R1-07: the time of the expected D is `C + (B - A)`. It can lie left of the last candle. The ring and badge then sat between closed candles. When the time fell in a market gap, `x` was null: the ring was drawn at the old leg end, the badge was not drawn.
- R1-08: the badge stack had no lower limit. The SVG clips at the pane height, so the lower badges were cut and could not be clicked. The price text of the D (right edge) could overlap the stack.

## Solution
| File | Change |
|---|---|
| `lib/formation/drawingLayout.ts` | `expectedD` takes `{ time, step }`: a time in the past moves one candle after the last candle. Ring and badge use the same function, so their count is equal. The stack top is limited to `height - n * 24`. The price text moves left of the stack when it crosses the stack. |
| `components/formation/FormationChart.tsx` | Passes the pane height, the last candle time, the candle length and the stack edges. |
| `e2e/mocked/formation-expected-d-lib.spec.ts` | Three new `@FRM-44` tests. One old test used a last candle after D and expected the ring in the past. Its last candle time changed to 1200. |

## Why
"Expired" as a separate mark was rejected: it needs new text and a new design. Moving to the next candle keeps the code comment ("right of the last candle") true. Measuring the AB duration in candles is a design question and was not changed.

## Verification
Red before the fix (3 new tests failed), green after (10 of 10). `tsc --noEmit` clean.
