---
date: 2026-11-06
author: Claude
type: decision
status: open
pr: []
features: [UI-18, UI-11]
areas: [frontend]
---

# One RSI on /chart (plan 1106-A2, step S1)

## Request
/chart showed two RSIs: the system RSI(7) pane (no settings) and the user RSI(14). Free and setup mode did not declare `WorkspaceContext.systemRsi`, so `ChartWorkspace` added RSI(14) and EWO by default (open point in `2026-11-03-chart-u2-chartview.md`). The RSI scale was fixed to 0–100, so the pane had much empty space. Decision of the project owner: one RSI only, with TradingView-like settings.

## Solution
Design: https://claude.ai/artifact/35TMPfFuWY68Rh5jRTi7iH (canvas `Main.dc.html`; tabs Girdiler/Stil/Gorunurluk for S2).

| File | Change |
|---|---|
| `lib/chart-workspace/indicators.ts` | `SYSTEM_RSI_ID = 'system-rsi'`, `systemRsiIndicator()` (7, close, no smoothing, 80/50/20, no background, gradients on) |
| `lib/chart-workspace/paneOrder.ts` | `rsi` leaves `SYSTEM_PANE_IDS`; its pane stays first in the default order |
| `components/chart-workspace/runtime.ts` | RSI scale = lower..upper band with pixel margins (32 above, 10 below), pane `scaleMargins` 0, same provider on all series of the group; `buildSystem` only for Wave |
| `components/chart-workspace/ChartWorkspace.tsx` | default document and in-memory migration add the system RSI; delete = layer off; "delete all" keeps it |
| `store/useChartWorkspaceStore.ts` | storage version 2: `initial-RSI` dropped, old `overlays.rsi`, `systemPanes.rsi`, `paneOrder` `'rsi'` move to the new indicator |
| `ChartView`, `ChartCore`, `FormationChart` | no system RSI input; the formation drawings read the series of the indicator and hide when length ≠ 7, source ≠ close or timeframe ≠ chart |
| `useAnalysisPrefsStore`, `ZoneChartPanel`, `app/chart/page.tsx` | switch "RSI (14)" and `showRsi` removed (`BacktestChart` keeps `showRsi={false}` on `ChartCore`) |

## Why
- A2.5: the formation scanner always uses `RSI_PARAMS` (7, close, 80/20, rule of Bora). The pane setting changes only the RSI the user sees.
- A2.6: no volume source and no VWMA, because the candles have no volume.
- A2.7: merging EWO and Wave 5/35 is not part of this plan. Wave stays a system pane.
- The delete menu item reuses the existing text "hide layer" (`cw.legend.hideLayer`), not a new "close layer" text.
- The pane shows the values of the chart candles, including the running candle. The old pane used the closed candles only.

## Open
S2: tabbed settings dialog (Girdiler/Stil/Gorunurluk), Defaults menu (reset, save as default), Cancel/OK with live preview, new fields (separate visibility, color and line style per line/MA/band, fill colors, Bollinger and divergence rows, plot type, precision, inputs in the status line, source (H+L+C+C)/4, visibility by minute/hour range and day), legend text "RSI 7 Kapanış 53,69", tr/en/de and hints.
