---
date: 2026-10-31
author: Claude
type: feature
status: done
pr: [251]
features: [ANA-19, FRM-20]
areas: [frontend, tests]
---

# Chart shows all candles by default

## Request
- The chart on `/formasyon` and `/chart` must start with all candles, like after "Ansicht zurücksetzen".
- Halil decided: a click on a formation does not change the view. A zoom of the user stays saved for each product until the user resets it.

## Cause
- `FormationChart` built the chart again at each formation click and aligned the view to the formation.
- `ChartCore` showed only the last 300 candles when it had more than 2000 points.
- `ChartCore` saved each range change, also the automatic one, as a candle index. The key had no timeframe, so the index did not fit after a change.

## Solution
| File | Change |
|---|---|
| `store/useChartWorkspaceStore.ts` | `viewport` (index range) becomes `visibleTime` (candle time in seconds). Old entries are not read. |
| `chart-workspace/runtime.ts` | New `restoreChartView` and `rememberChartView`. Both callers use them. |
| `analysis/chart/ChartCore.tsx` | Analysis and free chart use the two functions. The backtest does not change. |
| `formation/FormationChart.tsx` | The framing of the formation and the width rule are removed. |
| `e2e/mocked/*.spec.ts` | New tests for the view. ANA-19 test uses `visibleTime`. |

## Why
- No saved zoom means "show all candles". A range that covers all candles deletes the saved zoom. So the reset button and a full zoom-out give the default state.
- `rememberChartView` ignores range changes that come with a new candle count or a new width. It also ignores the first 150 ms after the chart sets a restored view, because the chart rounds the range by one candle in this time. Without this rule the zoom moved by one candle at each restore.
- A time range fits after a change of timeframe or period. An index range does not.
- Rejected: save the view for each timeframe. Halil wants one zoom for each product.
- Consequence: the conditions card on `/formasyon` covers the last candles. After a zoom, the selected formation can be outside the view.
- The chart cannot show more than about 2200 candles in 1100 px (minimum bar spacing 0.5 px). Then "all candles" is the widest view the chart allows. The widest view that reaches the last candle counts as "all candles", so the reset button deletes the saved zoom there too. A review found this case; a test with 1500 candles at 600 px covers it.

## Verification
- New tests were red before the change: 3 in `formation-page.spec.ts`, 3 in `chart-workspace.spec.ts`.
- `npx tsc --noEmit` and `npx eslint src e2e`: no errors.
- `npm run test:e2e -- e2e/mocked/chart-workspace.spec.ts e2e/mocked/formation-page.spec.ts`: 60 passed (after the review fix).
- Full mocked suite: 1672 passed, 1 failed. The failure was a test that did not wait for the debounce. It is fixed and the test passed 70 times in a repeat run.
- Not verified: the pages in a browser against the real worker. The worktree has no `.env.local`, so it has no worker address. The mocked e2e tests cover the view.

## Lessons
- A zoom within 150 ms after the chart build is not saved. A test must wait before it zooms.
