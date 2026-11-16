---
date: 2026-11-16
author: Claude
type: feature
status: done
pr: [585]
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD C leg: measure the lower-timeframe AB=CD row

## Request
Decision owner: user, 2026-11-16. The row "AB=CD on a lower timeframe" in the C leg section of the AB=CD trade block was always grey (`unmeasurable`). It is a reinforcement (`bonus`). This step measures it, by form only. It closes the open point of `2026-11-16-abcd-c-leg.md`.

## Rule (all four conditions must hold)
The correction B to C of the large AB=CD is a finished small AB=CD (points a, b, c, d) on the next lower loaded timeframe. Point a is at the large B, point d is at the large C. The small trade direction equals the C leg direction.
1. Start: the candle of small a opens at the open of the large B candle or later. A zigzag that starts earlier does not count.
2. Shape: the correction depth of small c (measured on a to b) is at least `ABCD_PARAMS.minCorrection` and at most `ABCD_PARAMS.maxCorrection`. It is the same measure as the AB=CD shape check (`shapeOf`, `depth`).
3. Completion: small d reaches small level 1 (`c + (b - a)`) with the same tolerance as the large AB=CD (`dReached`, `ABCD_PARAMS.tolerance`).
4. End: the candle of small d opens inside the time of the large C candle: open of C <= open of d < open of C + duration of the main timeframe.

## States
| State | When |
|---|---|
| `met` | All four conditions hold. The value of the row is the name of the lower timeframe. |
| `unmet` | The lower timeframe is loaded and has data back to B, but one condition fails (including: fewer than four turning points before the end of the C candle, wrong side order). |
| `unmeasurable` | No lower timeframe is loaded, it has no turning points, or its data starts after the open of the B candle. |

The row stays `bonus`. It does not change entry, stop, target, `variant`, the required rows, `candidate.checks`, the verdict or any other `trade` field.

## Solution
| File | Change |
|---|---|
| `lib/formation/cLeg.ts` | New `lowerAbcdAt(env, tf, s)` (pure) and type `LowerAbcd`. `cLegOf` takes the optional input `lowerAbcd` (default: not measurable) and fills the row state and value. |
| `lib/formation/abcdChecks.ts` | Passes `lowerAbcdAt(env, tf, s)` to `cLegOf`. |
| `components/formation/FormationTrade.tsx` | The value of the row is shown as the timeframe name, like the reversal candle row. |
| `i18n/messages/hints.ts` | The hint of the row names the four conditions (tr, en, de). Before, it said "not measured yet". |
| `e2e/mocked/formation-abcd-cleg.spec.ts` | 26 new library tests (buy and sell mirror): the nine cases of the request plus boundaries, order of sides, independence of values. |
| `e2e/mocked/formation-trade.spec.ts` | One block test: the met row shows the timeframe name. |

No new constant. Tolerance and depth limits come from `ABCD_PARAMS`.

## Assumptions
- Turning points: the turning points of the lower timeframe trend (`env.trends.get(lower).pivots`) whose candle opens before the end of the large C candle. The last four are a, b, c, d. Other turning points (earlier, or after the C candle) do not change the result.
- Side order: a on the side of the large B, b on the other side, c on the side of B, d on the other side. Any other order is `unmet`.
- Tolerance: the large AB=CD tolerance (5 % of the small a to b length) is used unchanged for the small AB=CD.
- Data reach: only the start of the lower timeframe data is checked (must be at or before the open of the large B candle). Missing data after that leads to `unmet`, not `unmeasurable`.

## Measurements
Red first: the 26 new library tests were run against a stub that always returned `unmeasurable`. 18 failed, 8 passed (the unmeasurable cases and the independence test pass with a stub by design). After the implementation, all 54 tests of the file passed.

Real fixtures: all 100 real H4 fixtures hold H4 only. A lower timeframe derived from H4 does not exist, so with the real fixtures as they are, **this row is not measurable** (H1 is missing).

Reverse trial: the real H4 candles are the lower timeframe, the main timeframe is a daily series built from the H4 candles (6 H4 candles per day), as in the C leg entry. The C leg section was evaluated at every H4 candle from candle 20 on in the 100 fixtures, with the trend setting of each fixture.
- 8791 states with a C leg section; the row was `met` in 767 (8.7 %), `unmet` in 8024, `unmeasurable` in 0.
- 577 distinct C points with a section; at least once `met` at 39 C points (6.8 %).
- The same series has no weekly timeframe, so the trend row is not measurable and no state has values. The row is independent of this.
This is a trial: a daily series built from H4 is not a real daily feed, and H4 as the lower timeframe of D1 is a real pair of neighbor timeframes in the code. The count is not a test.

The block test uses a synthetic hourly series with a small AB=CD in the correction of `abcd-breakc-h4-01`.

## Open points
- [ ] Not checked on a live chart with a real hourly feed.
- [ ] The full check of the small AB=CD (zone, RSI, divergence, verdict) is not done on purpose. Only the shape is measured.
