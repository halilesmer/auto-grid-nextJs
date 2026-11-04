---
date: 2026-11-04
author: Claude
type: diagnosis
status: open
pr: []
features: [ANA-21]
areas: [frontend, docs]
---

# Trend path: four open points of U1 checked

## Request
Check the four open points in `2026-11-03-chart-u1-trend-range.md` against the current code. Fix what is small and clear. Measure the cost of the path.

## Result
Steps U2 and U3 did not change `useTrendPath.ts`, `trdPath.ts`, `candles.ts` or `useMarketRates.ts`. All four points were still valid.

| # | Point | State | Evidence |
|---|---|---|---|
| 1 | Past range with an unsafe broker clock: the last candle is dropped | Open. The owner must decide. | `closedBars` in `trdPath.ts` drops the last candle when `now` is null. `useTrendPath.ts` sets `now` to null when the answer has no `server_now` and `offsetSec` is null. |
| 2 | `MAX_CHART_BARS` cuts the lead-in | Open. The owner must decide. | `useTrendPath.ts` adds the lead-in to the clipped start. `ratesWindow` in `candles.ts` clips again, and `useMarketRates` calls it. |
| 3 | Cost of `buildTrendPath` | Measured. The cost is high for long ranges. | See below. |
| 4 | Tests do not check `from` | Done | `analysis-trend.spec.ts`: two new ANA-21 tests, "all" and "clipped". |

`MAX_CHART_BARS` counts time steps, not candles. `ratesWindow` uses `end - MAX_CHART_BARS * tfSec`. For M15 this is about 1,042 days (2.85 years). Weekends have no candles, so the window holds at most about 71,000 candles.

## Point 3: measurement
Synthetic random-walk candles without gaps, default trend settings, Node 26 in the Playwright test runner on a MacBook, 5 runs each. The temporary test is not in the repository.

| Candles | Time per run |
|---|---|
| 960 (M15, 10 days) | 7 to 9 ms |
| 5,000 | 80 to 190 ms |
| 20,000 | 1.1 s |
| 100,000 | 31 to 36 s |

The time grows with the square of the number of candles. The largest real window has about 71,000 candles. By the same growth this is about 16 s. A year of M15 has about 25,000 candles (about 1.7 s).

`useTrendPath` runs `buildTrendPath` in the render path. A long range blocks the page. The path is calculated again at each 60 s refresh of the tail.

## Point 4: tests
- "All": the chart window is 5,000 candles. The trend `from` is exactly 400 days before it. The trend `to` equals the chart `to`.
- "Clipped" (M15, 5 years): the chart window is 100,000 time steps. The first page of the chart and the first page of the trend start at the same clipped `from`. No request starts earlier. This test records the current state of point 2. If the owner decides to keep the lead-in, change this test first.

## Open points
- [ ] Point 1. Question: for a past range without a reliable clock, may the path treat all candles as closed? Or must it keep dropping the last candle? The past formation search depends on the answer.
- [ ] Point 2 (the `MAX_CHART_BARS` lead-in; the unsettled start of the 5,000-candle cap is accepted, see point 3). Question: keep the unsettled start of the path when the window is clipped? Or cut the visible part of the trend?
- [x] Point 3: done. `buildTrendPath` uses only the last `TREND_PATH_MAX_BARS` (5,000) candles (owner decision A13.3.3). For 5,000 candles or fewer the path is unchanged. Point 2 (unsettled start of a cut window) is accepted by the owner. Point 1 stays as it is until the past formation search (A13.6). The formations use `formationZug` in `context.ts`, not `buildTrendPath`, so they keep their full basis. Tests: two new ANA-21 tests in `analysis-trend-lib.spec.ts` (identical path up to the limit; only the last candles above it).
- [x] Point 4: two tests added.

## Verification
| Check | Result |
|---|---|
| `analysis-trend.spec.ts`, 3 repeats | 30 passed (the two new tests included) |
| `scripts/features/run.sh e2e ANA` | 186 passed, 1 failed: ANA-22 `chart-hover.spec.ts:103`. It fails on `main` as well and is not part of this change. |
| `scripts/features/run.sh BKT` | 304 passed |
| `npx tsc --noEmit`, `eslint` on the spec | No error |

## Lessons
- `MAX_CHART_BARS` counts time steps. Real candle counts are lower. State which one a number means.
- A quadratic cost in the render path needs a cap on its input. Measure first, then name the cap as a constant.
