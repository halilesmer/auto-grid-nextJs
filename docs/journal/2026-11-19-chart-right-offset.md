---
date: 2026-11-19
author: Claude
type: change
status: done
pr: []
features: [ANA-19, FRM-20]
areas: [frontend, chart, tests]
---

# Gap of 10 candles right of the last candle on /chart

## Request
Halil, 2026-11-19, 1119-A1.1: "B: 10 mum". Since PR 616 the last candle touches the right edge (library default `rightOffset` 0). The possible zone of a forming formation is then narrow (16 px on FRM-20). TradingView has a setting for the right margin; its default count was not found in a source, 10 is the decision of Halil.

## Solution
| Place | Change |
|---|---|
| `runtime.ts` `openingView` | Writes `timeScale.rightOffset = RIGHT_GAP_BARS` (10), then `resetTimeScale()`. The opening, a change of symbol or timeframe, a reload and "Ansicht zurücksetzen" show the gap. |
| `runtime.ts` `fitWithGap` | A range in the top bar (for example "Tümü") writes the same option, then `fitContent()`. Library source (`fitContent`): without `rightOffsetPixels` the option `rightOffset` is added to the fitted range, so all candles fit and the gap stays on the right. This is the TradingView behaviour (range fits, empty space remains). |
| `ChartCore.tsx`, `ChartWorkspace.tsx` | Backtest keeps its own range (`setVisibleLogicalRange`, "Ansicht zurücksetzen" = `fitContent`) with `rightOffset` 0 (`setRightGap(chart, 0)`): unchanged. |
| New live candle | `shiftVisibleRangeOnNewBar` (library default) moves the view by one candle; the gap stays 10. |
| `LatestBarButton.tsx` | No change: it already reads `options().rightOffset`. |
| `publishVisibleRange` | Also writes `data-visible-logical` (from,to as candle index) for tests. |

Only `/chart` (workspace modes) is affected. `CurveChart` and `EquityOverlay` are separate charts and unchanged.

## Verification
See the PR for the test list and results.
