---
date: 2026-11-07
author: Claude
type: feature
status: done
pr: []
features: [ANA-26, ANA-05, FRM-34]
areas: [frontend]
---

# W1 and MN in the free chart

## Request
Step S1 of plan 1107-A4: the free chart mode (`/chart?mode=free`) gets the timeframes W1 and MN. Both come from D1 candles in the browser. The worker does not change.

## Solution
| File | Change |
|---|---|
| `lib/analysis/calendarBars.ts` | New. `weekStart`, `weeklyFromDaily` (moved from the formation), `monthStart`, `monthlyFromDaily`, `barEnd`, `calendarFromDaily`, `liveCalendarBar` |
| `lib/formation/weekly.ts` | Re-exports `weekStart`, `weeklyFromDaily`, `W1_SEC`. Formation behavior is unchanged (FRM-34 tests stay green) |
| `lib/analysis/candles.ts` | `ChartTimeframe`, `CHART_TIMEFRAMES`, `dataTimeframeOf`, `CHART_TIMEFRAME_SEC` |
| `lib/chart/mode.ts`, `useAnalysisParams.ts` | `?tf=W1\|MN` is valid in free mode only. Setup falls back to M15 |
| `FreeChartPanel.tsx` | Asks for D1, starts the request at a week or month start, builds the candles, no gap slots |
| `useSignalBars.ts` | A W1 or MN candle is closed when `barEnd` has passed |
| `TimeframeSelect.tsx` | Takes the list of options. W1 and MN get a dot and the calendar hint |

## Why
- A month has 28 to 31 days. So `barEnd` replaces `tfSec` for closing and live logic. The display uses a nominal 30 days (`CHART_TIMEFRAME_SEC.MN`) only for the status line.
- The known limit from `2026-11-02-formation-w1-from-d1.md` (first W1 candle cut) is fixed for the free chart: the request starts at the week or month start. With "all" (no start) the cut first period is dropped.
- `ChartCore` aligns the running candle to fixed seconds. That does not fit a week or month. So for W1 and MN the live price goes into the last candle in `FreeChartPanel` (`liveCalendarBar`), and the countdown is off.
- The trend path does not exist on W1 and MN. The existing hint `cw.trend.unavailable.hint` already names the reason, so no new key was added.
- Indicator "timeframe" options stop at D1. They are smaller than the chart on W1 and MN, so they read the chart candles.

## Open points
- DEMO check (S3): compare the last three W1 and MN candles with the MT5 terminal. If the broker starts the week on Monday, re-open "variant B" in the formation entry.
