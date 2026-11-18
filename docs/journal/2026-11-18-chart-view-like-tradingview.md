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
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | The first alignment of a new selection calls `openingView` (not for the backtest, which keeps its last 300 candles). New props `fitOnce` and `onFitted`: each new number fits all candles one time, when the view of that selection is aligned (or at once, when it is already aligned). `writeLastBar` only calls `candles.update()`; `appendedBars` and `viewShowsAll` are removed. The older-page check accepts a range change only while the user drags (left button pressed on the chart and moved 3 px or more), or up to 400 ms after a wheel or swipe step (`GESTURE_WINDOW_MS`); after a swipe it accepts 1 s from `touchend`, for the kinetic scroll (`SWIPE_WINDOW_MS`). A click, a tap and `keydown` do not count. The press and release listeners are on `window` in the capture phase. |
| `frontend_nextjs/src/app/chart/page.tsx`, `src/hooks/useChartContext.ts`, `src/components/chart-page/OneChart.tsx` | A choice in the range picker sets a fit request (a number that always rises, the range, and the scope account, symbol, zone and timeframe). It is active when the bounds of the URL are the bounds of that range (`chartBounds`) and the scope is the same; it ends when the chart reports `onFitted` or when the scope changes. A later opening (timeframe change, reload) then shows the opening view again. |
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | "Ansicht zurücksetzen" (toolbar and zoom row): `openingView` for `/chart`, `fitContent()` for the backtest as before. |
| `frontend_nextjs/src/i18n/messages/workspaceHints.ts` | `cw.fit.hint` (tr, en, de): the old text said "saved in this browser"; it now names the opening view, the backtest case and that nothing is stored. |
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
| `chart-view-like-tradingview.spec.ts` "Aynı aralık ikinci kez …" (new) | | the same range twice, with a zoom between, fits two times (finding of the review, see Verification) |
| `chart-view-like-tradingview.spec.ts` "Son mumdan uzaktaki görünüm …" (new) | | replaces test 2 of PR 584 without the store: a view away from the last candle does not move when the running candle comes |
| `chart-workspace.spec.ts` "Lejant …" (2 tests, ANA-20) | the crosshair at the left edge was on the first candles (opening = all candles) | the chosen range again fits all candles first (`fitChosenRange`), then the same check |
| `formation-page.spec.ts` FRM-20 "ABCD im Aufbau" | `rect[rx="3"]` = no reversal-candle mark | `rect[rx="3"][fill-opacity="0"]`: the mark has no fill; in the opening view the possible zone ahead of the last candle is 16 px wide and also has `rx=3` (measured), but fill-opacity 0.16 |
| 9 drawing specs (`chart-drawing-menu`, `chart-fib-hit`, `chart-fib-settings`, `chart-fib-text-opacity`, `chart-fib-unsaved`, `chart-floating-bar`, `chart-floating-bar-templates`, `chart-scan-scale-tool`, `chart-toolbar`; 28 tests) | the formation of the search was squeezed at the right (all candles) | `hideFormationDrawings(page)` after `chartReady`: in the opening view the 14 px hit area of a formation line lies under the fixed pixels (see Verification and Open points) |
| `e2e/fixtures/chart-older.ts` | `wheel(0, 4000)` zoomed out fully from "all candles" | `zoomOutFully` (40 wheel steps: one step changes the bar spacing by 10 % only, also with a large deltaY); `approachLeftEdge` stops about 25 candles before the first candle, so the view stays on candles |

## Verification
All e2e runs on the Mac under the heavy lock (SYS-11), mocked e2e, 3 Playwright workers.

| Check | Result |
|---|---|
| New tests (a), (b), (c) with `src` of the branch base `85b4fdcf` | 3 of 3 failed at the intended line: (a) `:66` the first candle is in the opening view; (b) `:111` same; (c) `:922` a click and a wider chart requested 1 older page |
| New test "Aynı aralık ikinci kez" with `src` before the review fix (`d64e00b3`) | failed at `:140` (the second choice did not fit) |
| Older-page gesture, temporary log in `check()` (not committed) | during each drag `drag=true age=0`; the wheel and the drag reach the check; the first failure of the ANA-27 tests came from the fixture (one wheel step = 10 %), not from the gesture logic |
| Fixture `approachLeftEdge`, temporary log (not committed) | 100 000 candles: the approach stopped at 57 candles from the first candle; a drag of 6 px at 0.2 px per candle did not move the view. Fixed: zoom in near the edge, drags of 20 px or more |
| Drawing tests, `elementFromPoint` at the pixels of `chart-fib-hit` (temporary spec, not committed) | (468,206) and (610,176): the chart canvas; (657,166) and (705,156): `line#line-hit` of `svg#formation-overlay`, also while the Fib tool is active |
| `scripts/features/precheck.sh` on `d64e00b3` (before the review fixes) | `PRECHECK FEHLER in 2294s (Sperre 0s gewartet) · katalog ok (1s) worker ok (173s) lint ok (26s) tsc ok (2s) e2e FEHLER (2092s) · e2e ran=3945 passed=3917 failed=28 flaky=0 skipped=0`; the 28 failures are the 9 drawing specs above |
| After the review fixes and the drawing-test fix: 16 affected specs (`chart-view-like-tradingview`, `chart-workspace`, `formation-page`, `chart-older-heavy`, the 9 drawing specs, `chart-latest-bar`, `settings-osc-scope`, `tooltips`) | `274 passed`, `2 failed` (UI-27 W1 and MN: the fixture waited for the formation switch, which only D1/H4/H1/M15 have; fixed) |
| `chart-fib-settings.spec.ts`, `chart-scan-scale-tool.spec.ts` after that fix | `12 passed` |
| Full pre-PR check after the fixes | not run again; the affected specs ran as above, CI runs all mocked e2e tests |
| CI run 44392981333 of PR 616, compared with the last three completed `tests.yml` runs on `main` (44341865901, 44322763436, 44317960655; §4.17) | 1 flaky in the PR: ANA-17 `chart-toolbar.spec.ts:137` (first try: `cw.undo` stays disabled after `drawLine`, the horizontal line was not drawn); first try passed in all three `main` runs. Finding of this PR, same cause: `drawLine` clicks a fixed pixel without `chartReady`. Fixed: `drawLine` calls `hideFormationDrawings` |
| Review of the coordinator on `hideFormationDrawings` | a count of the switch at one moment can be 0 before the switch is drawn; the function then did nothing. Fixed: the timeframe of the address decides (D1, H4, H1, M15 or no `tf`: wait for the switch; W1, MN: nothing to do) |
| `chart-toolbar.spec.ts` `--repeat-each=3`; the 9 drawing specs `--repeat-each=2` with the fixed fixture | `33 passed`; `88 passed` |
| `npx tsc --noEmit`, `npx eslint` on the changed files | no output |
| `scripts/features/run.sh check` | `features.yaml ok (284 Features)` |

## Open points
- [ ] PR merged and the run of `tests.yml` on `main` is green.
- [ ] Defect, not changed here (it is a visible change outside the three decisions): a formation line takes the pointer events in its 14 px hit area (`FormationLayer.tsx`, `line-hit`, `pointer-events: stroke`) also while a drawing tool is active. A user who draws on a formation line cannot set the point there. The documented priority (ANA-25: active tool > drawing below > SVG line of the formation) says the tool wins. The defect existed before; it is more frequent now, because the opening view spreads the formation over the chart. Decision for the owner.
- [ ] Observation: with the default right offset of the library (0), the last candle is at the right edge. The possible zone of a forming formation ahead of the last candle is then narrow (measured 16 px on FRM-20). TradingView has a right margin setting; the brief asked for the library default.
- [ ] Observation from the review, not examined: `ChartCore` builds the chart again when `hasNotes` changes (`notes` exists only with a setup zone); the zoom of the user is then lost. Before, the stored zoom hid this.
- [ ] Phone: the swipe window (1 s after `touchend`) is not checked on a real device.

## Lessons
- A decision that replaces an older decision also replaces the tests that encode the older one. List each changed test with the decision it follows.
