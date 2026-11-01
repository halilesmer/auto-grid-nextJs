---
date: 2026-11-01
author: Claude
type: fix
status: done
pr: []
features: [BKT-04, BKT-10, BKT-15]
areas: [frontend]
---

# Backtest: price gap with spread change, exact range

## Request
Fix two findings of an external error search on `/backtest` (package 2, calculation core): B3 (high), a price gap with a spread change triggers marks that were never reached; B2 (medium), second-exact range limits only act on candle starts.

## Cause
- B3: `traverse(..., jump=true)` in `runner.ts` sets the new candle's spread and market, then calls `nextTrigger(oldBid, newBid)`. The old bid is combined with the new spread, so a mark was reported as `immediate` although its condition held at no real quote. Example: BUY_LIMIT 2651, candle 1 bid 2650 spread 400 points, candle 2 bid 2652 spread 20 points. The limit filled (gap model at 2652.20, parity model at 2651), but the ask never reached 2651. The same happened for a sell SL when the spread widened.
- B2: `runBacktest` chose candles only by their open time. A candle that began before `to` ran to `t0 + dataSec - 1`. Range [T, T+15) closed a trade at T+35.

## Solution
| File | Change |
|---|---|
| `broker/pathBroker.ts` | New `nextGapTrigger(from, to)`: same scan and order as `nextTrigger`, but a mark counts only if its condition holds at the new bid `to`. `nextTrigger` is unchanged for normal path legs |
| `runner.ts` | The gap leg uses `nextGapTrigger`. Only candles with `t >= from` and `t + dataSec <= to` run. A limit inside a candle adds the warning `run.rangeRounded` with the range that was really calculated |
| `i18n/messages/backtest.ts` | Text for `run.rangeRounded` in tr, en, de (shown in the notes block and the run log) |
| `e2e/mocked/backtest-runner-lib.spec.ts` | New cases for all order types and sides, order along the gap, spread-only change, real gap fills (gap and parity), range limits |
| `features.yaml`, `analyse-regeln.md` | BKT-15, BKT-10 and section 5 describe the new rules |

## Why
- A call with `from = newBid` alone would lose the order along the gap (all marks would be "immediate" at one price and sorted by kind and ticket). So the scan keeps the old start and only filters by the new quote. Every mark crossed in a monotone gap passes the filter, so real gap fills stay.
- Partial candles are not estimated. There is no real price data inside a candle. Whole days stay unchanged.

## Verification
- Before the fix, 9 new tests were red (3 for the missing method, 2 for B3 in the run, 4 for B2). 2 guard tests (real gap fill, whole minutes) were green before and after.
- After: `backtest-runner-lib` 43 passed.
