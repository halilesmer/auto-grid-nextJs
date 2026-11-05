---
date: 2026-11-05
author: Claude
type: fix
status: open
features: [FRM-03]
areas: [frontend]
---

# Trend path review: two defects fixed, five checked

## Request
A read-only review of `buildTrend` (trend path "Trendzug") found seven spots where the behavior is not described. Decide for each: defect or intended. Test first for real defects.

## Result per finding
| # | Finding | Result |
|---|---|---|
| 1 | Measuring rectangle `Z-TRD-08` used `refCorrection` of the latest candidate, which can be a rejected one | Defect, fixed. The rectangle now uses the measure of the drawn correction (`len / ratio`). Without a ratio (rule `welle`) it keeps the old fallback |
| 2 | TRD-07/08/09 target the latest correction candidate, drawn or not | Intended. TRD-07 must show ☐ for a rejected (too small) correction. The code comment says so |
| 3 | `sizeRule`: a same-side point that lies further out skips the size gate | Intended. The leg was valid at the earlier point. Moving its end outward only makes it longer. TRD-07 can show ☑ with ratio < 1 when ATR grows. Display only, left as is |
| 4 | Outer-candle sort comparator reads only `a` | Defect (fragile, not antisymmetric), fixed with two filters in the same order. V8 gives the same result, so no failing test is possible. The reference tests guard the behavior |
| 5 | `folded`/`weaker` compared with the oldest rejected candidate | Defect, fixed. The comparison uses the most extreme rejected same-side candidate. Test: `formation-trd-review-lib.spec.ts` |
| 6 | Rule `filter` cuts two points and can remove the trend start | Open. `applyEdit` clamps `originPos`, but if the removed start was the counter-side point, the clamp can land on the new point of the other side. I could not build the case: the EWO needs about 35 bars of warm-up. No change without a failing test |
| 7 | Wilder ATR is seeded on the first loaded bar | Intended. The code comment states "no warm-up null". The seed error decays by (13/14)^n, so it is small after about 100 bars. Open point: ATR values near the start of a short load window |

## Not changed
- `RULES` status table and the TRD-08/TRD-09 check lines (separate PR).
- TRD-09 value (`m.refCorrection`) for an explicitly chosen correction still shows the latest measure. Follow-up after the other PR.
