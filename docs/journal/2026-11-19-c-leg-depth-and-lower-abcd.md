---
date: 2026-11-19
author: Claude
type: fix
status: done
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD C leg: depth limit 0.728 and the lower-timeframe row on the extreme wick

## Request
Decision owner: user, 2026-11-19 (plan 1114-A4). Two fixes in the C leg section of the AB=CD trade block (`lib/formation/cLeg.ts`).

## U1: depth limit (ABCD-06)
The C leg depth row tested only the lower limit (0.382). `abcd.ts` limits the correction to 0.382 to 0.728 (`ABCD_PARAMS.maxCorrection`) and `abcdChecks.ts` makes ABCD-06 a reason for an invalid candidate. The measurement of PR 617 found 18 real C with a depth above 0.728 that still got a C leg block.

Decision: the block stays, but the depth row is `unmet` above `maxCorrection`. The required row is not met, so the block shows no entry, stop or target. The block follows ABCD-06, and the user still sees the depth value. Test: `depth above 0.728 -> depth row unmet, no values` (sell and buy), and 0.72 stays `met`.

## U2: lower-timeframe row (`lowerAbcdAt`)
Old rule (from `2026-11-16-abcd-lower-timeframe-abcd.md`, assumption "last four turning points"): a, b, c, d were the last four trend turning points of the lower timeframe before the end of the C candle. The turning point d often lay before the most extreme wick of the C candle, or a reaction and a second low inside the C candle shifted the last four points.

New rule:
- d is the most extreme lower-timeframe wick inside the large C candle (sell: lowest low; buy: highest high).
- a, b, c are the last three turning points of the lower timeframe before d.
- Turning points inside the same large C candle are noise (TRD-06 idea): if the sequence before the C candle ends on the c side, the points in the candle do not count. If it ends on the d side, only the first c-side point in the candle counts (this is c itself). Trailing d-side points are overtaken by the extreme wick.
- The other conditions stay: a opens at B or later, depth 0.382 to 0.728, d reaches small level 1 with the tolerance of ABCD-08. The row is a reinforcement (`bonus`).
- Hint of the row (tr, en, de): condition 4 describes d as the extreme wick. Visible text change, no layout change.

## Tests (`e2e/mocked/formation-abcd-cleg.spec.ts`)
New tests (each for sell and buy):
| Test | Red before the change |
|---|---|
| depth above 0.728: depth row `unmet`, no values | yes (2 tests) |
| trend point d' is less extreme than the wick in the C candle: `met` | yes |
| reaction and second low in the C candle, first low is d: `met` | yes |
| second low (after the reaction) is more extreme: `met` | yes |
| c is alone inside the C candle: `met` (second part: more points after c) | yes (second part) |
| straight fall from B to C, no small AB=CD: `unmet` | no (guard) |

Changed existing tests: none. The helper `lowerEnv` changed: the lower-timeframe candles were flat (119 to 121) and the turning point prices were not in the candle wicks. The new rule reads wicks, so a turning point candle now has its wick at the turning point price (and `wicks` adds extra wicks). All 54 existing library tests of the file pass with the new helper and no assertion changed. `formation-trade.spec.ts` (51 tests) passes unchanged.

## Measurement (local, not a test)
Method as in the 2026-11-16 trial: 100 real H4 fixtures, main timeframe D1 built from H4 (6 candles per day), lower timeframe H4, trend setting of each fixture, C leg section evaluated at every H4 candle from candle 20. The D1 candidate only. No weekly series, so the trend row is not measurable.

| | old rule (main before this PR) | new rule |
|---|---|---|
| States with a C leg section | 8851 | 8851 |
| Lower row `met` | 754 (8.5 %) | 1563 (17.7 %) |
| Lower row `unmet` | 8097 | 7288 |
| Lower row `unmeasurable` | 0 | 0 |
| Distinct C with a section | 578 | 578 |
| C with `met` at least once | 39 (6.7 %) | 93 (16.1 %) |

The new rule is below the limit of one half and not near zero, so the rule stays. Before this PR the numbers of 2026-11-16 were 767 of 8791 states and 39 C (the small differences come from later trend changes on main).

U1 in the same method: 2420 states (239 C) have a depth above 0.728. The depth row is `met` in none of them with the new code (`unmet` in 2420). Neither before nor after did one of them have values, because the trend row is not measurable without a weekly series. So this method cannot show a change of values. The effect on real values is the 18 C of PR 617 (weekly data present).

## Assumptions and open points
- A sequence with two turning points of the same side in a row inside the C candle before the first c-side point (for example `[a, b, low, c]`) is not collapsed; the row is then `unmet`. The trend model does not make such a sequence normally.
- The ratio of the real, live hit rate (XAUUSD 11 of 1108, AUDUSD 0 of 587 in one year, with the old rule) is not re-measured. It needs a real H1 series.
