---
date: 2026-11-03
author: Claude
type: fix
status: open
pr: [329]
features: [ANA-21]
areas: [frontend, docs]
---

# Trend path follows the range of the chart (U1)

## Request
Step U1 of `2026-11-01-unified-chart-page.md`. On `/chart` the trend path must cover the range of the chart.

## Cause
`useTrendPath` loaded its own candles with a fixed history (`HISTORY_DAYS`: M15 10 days, H1 40, H4 120, D1 400) that ended at the end of today. The range of the chart did not count. With XAUUSD M15 and "last 30 days", the line began 10 days before today. For a range in the past, it was missing.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/hooks/useTrendPath.ts` | New input `range`. The request ends where the chart ends and begins `HISTORY_DAYS[tf]` before the start of the chart. The start is the same as in the chart: `range.from`, or the start that `ratesWindow` chooses for "all" and for a clipped range. |
| `frontend_nextjs/src/components/chart-workspace/FreeChartPanel.tsx`, `frontend_nextjs/src/components/chart/ZoneChartPanel.tsx` | Pass `range`. |
| `frontend_nextjs/e2e/mocked/analysis-trend.spec.ts` | New test (ANA-21): range in the past. The trend request has the same `to` as the chart and a `from` at least `HISTORY_DAYS` before the chart `from`. Red before the fix (the trend `to` was the end of today), green after. |
| `docs/features/features.yaml` | ANA-21 no longer says "independent of the range". |

`/formasyon` is unchanged: its line is calculated from the candles of the search.

## Why
- The lead-in `HISTORY_DAYS` lets the path settle before the left edge.
- The data source is one candle window per chart. U2 can add RSI(7) and Wave 5/35 from the same window. They are not added now (no dead code).
- The mock ignores the range for a fixed series, so the test checks the query of the requests.

## Verification
| Check | Result |
|---|---|
| `scripts/features/run.sh e2e ANA-21` | Red before the fix (new test), 34 passed after |
| `scripts/features/run.sh ANA`, `BKT` | 183 and 304 passed |
| `npx tsc --noEmit`, `npm run lint` | No error (2 old lint warnings) |
| Visual check in the browser | Passed. Coordinator, 2026-11-03, on `main`: `/chart` free, XAUUSD M15, last 30 days, trend on. 152 segments from the left edge. The trend request starts 10 days before the chart start. |
| Codex scan | Not done: `weekly_left` was 2 |

## Open points
- [x] Visual check on `main` (the coordinator, 2026-11-03): passed, see Verification.
- [ ] Range in the past with an unsafe broker clock: open. Decision needed. See `2026-11-04-chart-trend-open-points.md`, point 1.
- [ ] Clipped chart window (`MAX_CHART_BARS`) cuts the lead-in: open. Decision needed. See the same entry, point 2.
- [ ] Cost of `buildTrendPath`: measured, and too high for long ranges. See the same entry, point 3.
- [x] Tests check no value of `from`: done, two tests added (2026-11-04). See the same entry, point 4.

## Lessons
- A hook that has its own date logic drifts from the chart. Derive its window from the same function (`ratesWindow`).
- The mock ignores the range for a fixed series. Test the query of the requests, not the drawn line.
