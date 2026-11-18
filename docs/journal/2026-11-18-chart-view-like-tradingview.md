---
date: 2026-11-18
author: Claude
type: decision
status: open
pr: []
features: [ANA-19, ANA-27, FRM-20]
areas: [frontend, chart, tests]
---

# Chart view like TradingView: latest candles at open, no stored zoom, no automatic older pages

## Request
Halil gave three decisions on 2026-11-18. The rule for all three: "Trading View nasıl yapıyorsa biz de öyle yapalım." (Do it as TradingView does it.) Decision pages: https://claude.ai/artifact/XE2E2q94nGPeCfmQN92ytE, https://claude.ai/artifact/VHA9QKB9H7mj6NBEHVHN9i, https://claude.ai/artifact/SVzyWRJdx3Up6A69qawhoD.

| Code | Decision | What changes on `/chart` |
|---|---|---|
| 1118-A5.1 = B | The zoom (visible time range) is not stored. Each opening shows the latest candles at the default bar spacing of the library. | Opening, a change of symbol or timeframe, and a reload show the latest candles (lightweight-charts `barSpacing` 6 px, default right offset, scrolled to the last candle). "Ansicht zurücksetzen" goes back to this view. A range in the top bar (also the same range again, for example "Tümü") fits its candles one time; it is not a mode. This decision replaces the decision of 2026-10-31 (journal `2026-10-31-chart-default-view`: "the chart opens with all candles, the zoom is stored for each product"). |
| 1118-A2.1 = B | When all candles are in the view and a new live candle comes, the chart does not fit again. | The library default applies (`shiftVisibleRangeOnNewBar`): when the last candle is in the view, the view moves by one candle and the bar spacing stays. The refit of PR 584 (`fitContent()` in `writeLastBar`) is removed. |
| 1118-A3.1 = C | Older pages load only by a drag or scroll of the user. | A click alone and automatic range changes (new candle, fit, `setData`, new width) do not load a page, also shortly after a click. A drag to the right that brings the view to 50 candles from the first candle loads as before. |

TradingView sources (charting library documentation, saving and loading, https://tradingview.com/charting-library-docs/latest/saving_loading/): "the visible time range is not included in the chart layout"; the chart is set to "always display the most recent data".

## Cause of the old behavior
- `restoreChartView` and `rememberChartView` (`runtime.ts`) stored the zoom of the user in the chart document (`visibleTime`) and restored it at the next opening. Without a stored zoom, the chart fitted all candles.
- `writeLastBar` (`ChartCore.tsx`, PR 584) fitted all candles again when a new candle came and the view showed all candles.
- The older-page check (`ChartCore.tsx`) accepted each range change in the 1.5 s after an input event. `pointerdown` and `touchstart` counted as input. So a click, then an automatic range change, requested a page of 20 000 candles (journal `2026-11-17-chart-older-page-dock-scan-findings` §3, 40 of 40).

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/runtime.ts` | `restoreChartView` and `rememberChartView` are removed. New `openingView(chart)` = `timeScale().resetTimeScale()` (default bar spacing and right offset of the options; the chart sets neither, so the library defaults apply). New `publishVisibleRange(chart, hosts)` writes `data-visible-range` for tests and stores nothing. |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | The first alignment of a new selection calls `openingView` (not for the backtest, which keeps its last 300 candles). New props `fitOnce` and `onFitted`: each new number fits all candles one time, when the view of that selection is aligned (or at once, when it is already aligned). `writeLastBar` only calls `candles.update()`; `appendedBars` and `viewShowsAll` are removed. The older-page check accepts a range change only while the user drags with a pressed button, or up to 400 ms after a wheel or swipe step (`GESTURE_WINDOW_MS`); after a swipe the time starts again at `touchend`, for the kinetic scroll. `pointerdown`, `touchstart` and `keydown` do not count. |
| `frontend_nextjs/src/app/chart/page.tsx`, `src/hooks/useChartContext.ts`, `src/components/chart-page/OneChart.tsx` | A choice in the range picker sets a fit request (`seq`, range). It is active when the bounds of the URL are the bounds of that range (`chartBounds`), and it ends when the chart reports `onFitted`. A later opening (timeframe change, reload) then shows the opening view again. |
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | "Ansicht zurücksetzen" (toolbar and zoom row): `openingView` for `/chart`, `fitContent()` for the backtest as before. |
| `frontend_nextjs/src/store/useChartWorkspaceStore.ts` | `visibleTime` and `VisibleTime` are removed. The parser does not take the field over; it goes away at the next write of the document. |
| `docs/features/features.yaml` | ANA-19, ANA-27, FRM-20: description, `pruefung`, `erwartet`. |

`/formasyon` redirects to `/chart` (`next.config.ts`); `FormationChart.tsx` has no caller. The backtest chart keeps its view (`workspaceView === 'backtest'`) and its reset.

## Changed tests (requirement change, not a relaxed test)

| Test | Before (decision) | Now (decision) |
|---|---|---|
| `chart-running-bar-fit.spec.ts` (3 tests, PR 584) | removed. Test 1 and 3: "all stays all" when the running or live candle comes (1116-A28.1). Test 2: a stored zoom stays. | Replaced by `chart-view-like-tradingview.spec.ts` (1118-A5.1, 1118-A2.1). |
| `chart-view-like-tradingview.spec.ts` (new) | | (a) opening: last candle in the view, first candle not (1000 candles), default spacing; the late running candle keeps the width; zoom not stored; reset = opening view; reload, also with an old `visibleTime`, = opening view. (b) the same range again fits 600 candles one time; a new live candle moves the view by one candle, no refit. |
| `chart-workspace.spec.ts` "Zurückgesetzte Darstellung … gespeichert" | look and zoom stored per symbol (2026-10-31) | look stored; zoom not stored, symbol change and reload show the opening view (1118-A5.1) |
| `chart-workspace.spec.ts` "Mit mehr als 2000 Kerzen zeigt der Chart alle Kerzen" | opening = all candles | the chosen range fits 2100 candles one time (1118-A5.1) |
| `chart-workspace.spec.ts` "Mit mehr Kerzen, als die Breite fasst, löscht „Ansicht zurücksetzen“ den Zoom" | removed: no stored zoom to delete | covered by (a) |
| `chart-workspace.spec.ts` "Neue Kerze und Größenänderung … ein eigener Zoom überlebt den Zeitrahmenwechsel" | zoom survives a timeframe change | nothing stored; after the change the view is the opening view (1118-A5.1) |
| `chart-workspace.spec.ts` ANA-27 "Tıklama ve kendiliğinden …" (new) | | (c) "Tümü" fits, a click and a wider chart load nothing, a drag to the right loads one page (1118-A3.1) |
| `e2e/fixtures/chart-older.ts` `openNearLeftEdge` | stored zoom at the left edge | wheel out and drag until the chart requests the page (no stored zoom since 1118-A5.1) |
| `chart-older-heavy.spec.ts` (ANA-27, 100 000 candles) | 90 s | 150 s: the way to the left edge is about 20 drags now |
| `formation-page.spec.ts` FRM-20 (4 tests) | all candles at open, zoom stored per product and after reload | latest candles at open = reset view; zoom neither after a timeframe change nor after a reload (1118-A5.1); "formation click keeps the view" unchanged |
| `settings-osc-scope.spec.ts` (USR-17) | used `visibleTime` as a non-indicator field | uses `drawings` (the field is gone) |

## Verification
(filled below)

## Open points
- [ ] PR merged and the run of `tests.yml` on `main` is green.

## Lessons
- A decision that replaces an older decision also replaces the tests that encode the older one. List each changed test with the decision it follows.
