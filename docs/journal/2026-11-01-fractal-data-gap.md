---
date: 2026-11-01
author: Claude
type: fix
status: open
pr: []
features: [FRM-33, FRM-04, FRM-05]
areas: [frontend]
---

# Fractal neighbours stop at a data gap

## Request
Finding 31 of package C: a fractal counted its neighbours by array position. A gap in the data (MissingRange) between the five candles did not matter.

## Cause
`probeFractal` in `lib/formation/frz.ts` took the two candles left and right by index. The formation search got only candles, not the missing ranges. The chart (`findFractals`) splits the series at each missing range, so the page and the chart disagreed.

## Solution
| File | Change |
|---|---|
| `lib/analysis/fractals.ts` | New `gapBetween(missing, prev, next)`. `findFractals` uses it. Same rule for chart and search. |
| `lib/formation/types.ts` | `FormationBar.gapBefore?`: a missing range lies between this candle and the one before. |
| `lib/formation/context.ts` | `ContextInput` accepts `{ bars, missing }` per time frame (candles alone still work). The context marks `gapBefore`. |
| `lib/formation/frz.ts` | `probeFractal` counts neighbours only up to the next gap. |
| `hooks/useFormationScan.ts`, `components/formation/FormationScanRunner.tsx` | Pass `missing` to the context. The page search key includes the gaps. |

## Why
The plan said `breaks: boolean[]` on `TimeframeView` and a new argument of `probeFractal`. About ten callers use `probeFractal` or `fractalIndices` (FRZ, ABCD, CDT, TRD, FIB, XABCD, OBO, LIB), and some cut the series (`bars.slice(0, endIdx + 1)`). A flag on the candle follows the candle through all of them. No caller changes. Rejected: pass an array through every caller.
Every MissingRange counts, as in the chart. Trading pauses are not a MissingRange.

## Verification
- Red first: `formation-gap-lib.spec.ts` with 3 of 7 failing (gap between the five candles, gap right of the peak, ABCD-02 next to a gap).
- After the fix: 7 passed.

## Open points
- [ ] RSI, ATR and wave still calculate across a gap. Not part of this change.

## Lessons
Put a property that every consumer of a series needs on the element, not in a side array.
