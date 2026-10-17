---
date: 2026-10-18
author: Claude
type: feature
status: done
pr: []
features: [ANA-03, ANA-11]
areas: [frontend]
---

# Chart legend items switch chart overlays

## Request
On the Analyse page, the user wants to show and hide each item of the chart directly in the legend under the chart. The user also wants the missing-data hatching to be switchable.

## Solution
Each legend item is now a button (`aria-pressed`). Off = faded and struck through; the item stays in the legend, so the user can switch it on again. The legend and the gear panel use the same values in `useAnalysisPrefsStore`, so they are always in sync.

| File | Change |
|---|---|
| `frontend_nextjs/src/store/useAnalysisPrefsStore.ts` | New prefs `showOrders`, `showGaps` (default on). `showTrades` now means positions only. |
| `frontend_nextjs/src/components/chart/ZoneChartPanel.tsx` | `LegendToggle` replaces `LegendItem`; positions and pending orders are separate; RSI has a legend item. |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | Prop `showGaps`; attributes `data-gaps-shown`, `data-lines` for tests. |
| `frontend_nextjs/src/components/analysis/AnalysisSettingsPanel.tsx` | Switches for pending orders and missing data. |
| `docs/analyse-regeln.md` §3, §7 | The hatching can be switched off; the warning box above the chart cannot. |

## Why
- The pref key `showTrades` stays, so the stored choice of each browser stays valid. Only its meaning becomes narrower (positions with TP/SL).
- Entry, exit and "setup unknown" are one switch, because they are one drawing of the same trades.
- The missing-data hatching is switchable on request of the user. The data-quality warning box above the chart stays fixed, so a gap is never hidden completely. The gap slots without price stay in the chart; no candle is made up.

## Verification
- New e2e test `@ANA-03` (legend hides only pending orders, gear follows, choice stays after reload): red against the old code (legend button missing), green after the change.
- `npx tsc --noEmit` → 0 errors; `npm run lint` → 0 problems.
- e2e analysis, trades, backtest and UI-07 tooltip specs → 293 passed.

## Lessons
- A legend that removes switched-off items cannot be a switch: the item must stay visible in its off state.
