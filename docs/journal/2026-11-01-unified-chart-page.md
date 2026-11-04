---
date: 2026-11-01
author: Claude
type: plan
status: open
pr: [275, 276, 307, 321, 326, 329, 330, 331, 332, 333, 334]
features: [MET-02, UI-06, FRM-20, ANA-21, UI-10]
areas: [frontend, docs]
---

# One chart page for all chart views

## Request
The user wants one candle chart. It must look the same on all pages and contain all its settings. No chart setting stays above or below the chart. The reference is `/formasyon`: the chart fills the page.

## Current state

| Place | Engine | Layout | Controls outside the chart |
|---|---|---|---|
| `/formasyon` | Own `createChart` in `FormationChart.tsx` | Full page (`overlayLayout`) | None |
| `/chart` free | `ChartCore` | Page with title and card | Account, mode, range, symbol, timeframe |
| `/chart` setup | `ChartCore` | Page with title, card, `ChartFrame` | Same as free, plus setup, legend switches, live stats, zone card, notes |
| `/backtest` | `ChartCore` | Card in the result | Timeframe, replay, speed |

The `Trend` button is missing on `/formasyon` and `/backtest`. Only the two `/chart` panels pass `toolbarActions`. `CurveChart.tsx` is not a candle chart and stays as it is.

## Decisions

| Topic | Decision |
|---|---|
| Engine | `ChartCore` is the only place with `createChart` for candles. |
| Page | A new component `ChartPage` comes from `formasyon/page.tsx`. `/chart` and `/backtest` use it. |
| Top bar | It holds account, symbol, mode, setup, timeframe and range. The second row holds the controls of the page: formations, legend switches or replay. |
| Floating card | `FormationDetailsPanel` becomes general. It holds the zone card, live stats, trades and the backtest figures. |
| Warnings | They float on the chart. The data quality warning stays visible (`docs/analyse-regeln.md` §3, §7). |
| Statistics | The statistics view stays a normal page. A switch in the top bar opens it. |
| Backtest | Input and report stay a normal page. The chart opens as a full page. A switch selects the run for "both paths". |
| System RSI | The RSI(7) of the formations stays, because the detection reads it. |

Approved design (the owner must give access): https://claude.ai/artifact/4mXjBGcm6mby1MNghnMT4x. The table above records its content.

## Decision of 2026-11-03: one page "Chart"

The owner wants exactly one chart and one chart component in the system.

| Topic | Decision |
|---|---|
| Target | One page "Chart" made of Formation and Analysis. The Analysis page goes. The `/backtest` page stays untouched. |
| Steps | S5 and S6b go. New steps: D0 (design), U1 (data source and trend over the range), U2 (shell `ChartView` with the shared layers), U3 (merge the pages). Each step is one PR. |
| Design D0 | Approved: https://claude.ai/artifact/4mXjBGcm6mby1MNghnMT4x, page "Ein Chart · 03.11." |
| Condition | No tool is deleted. All developments stay. Only duplicate shells go, never a function. |

Result of U1: `2026-11-03-chart-u1-trend-range.md`.

U2 is split in two PRs (coordinator, 2026-11-03):

| Step | Content |
|---|---|
| U2a | Shell `ChartView` around `ChartCore`. System RSI(7) and Wave 5/35 on all chart pages. The three shells call `ChartView`. Result: `2026-11-03-chart-u2-chartview.md`. |
| U2b | The button "Layers" next to Trend, one menu for each mode. Broker clock, pauses and gaps on `/formasyon`. |

Order after U2a (owner, 2026-11-03): U2a → compact top bar (design "Handy") → U2b → U3. At 375 x 812 px the price pane is 297 px high after U2a. The top bar covers most of it: about 105 px stay visible in free mode and about 21 px in setup mode. The compact top bar removes this.

## Steps

Each step is one PR. The steps run in sequence because they change the same files. Structure comes before behavior.

| Step | Content | Status |
|---|---|---|
| S0 | Design | Approved on 2026-11-01 |
| S1 | Remove `ChartViewer.tsx` and the code that only it used | Done, PR 275 |
| S2 | `FormationChart` runs on `ChartCore`, with slots instead of flags. A check blocks other `createChart` calls. | Done, PR 276 |
| S3 | Extract `ChartPage` and a general `ChartPanel`. `/formasyon` shows no visible change. | Done, PR 321 |
| S4 | `/chart` moves into `ChartPage`. `ChartFrame` and the page title go. | Done, PR 326 |
| S5 | `/backtest` moves into `ChartPage`. Remove `overlayLayout`. | Dropped (decision of 2026-11-03: `/backtest` stays as it is) |
| S6a | `/formasyon` gets the `Trend` button and the trend line (decision of the owner on 2026-11-02: before S3 to S5). Entry: `2026-11-02-formation-trend-toggle.md`. | Done, PR 307 |
| S6b | `/backtest` gets the `Trend` button. `TrendToggle` moves into `ChartWorkspace`, so all pages have the same buttons. On `/backtest`, the line must stop at the replay cursor. | Dropped (decision of 2026-11-03) |
| U1 | Trend path over the whole range of the chart. Entry: `2026-11-03-chart-u1-trend-range.md`. | Done, PR 329 |
| U2a | Shell `ChartView` with system RSI(7) and Wave 5/35 on each chart. Entry: `2026-11-03-chart-u2-chartview.md`. | Done, PR 330 |
| Top bar | Compact top bar below lg: the bar stands above the chart and covers no candles (UI-12). Entry: `2026-11-03-chart-topbar-compact.md`. | Done, PR 331 |
| U2b | Button "Layers" next to Trend, one menu on each chart. Entry: `2026-11-03-chart-u2b-layers-menu.md`. | Done, PR 332 |
| U3a | The formation page moves to `/chart` as the mode Formation; one menu item "Chart"; redirect `/formasyon`. Entry: `2026-11-03-chart-u3a-one-page.md`. | Done, PR 333 |
| U3b | Remove the gear `analysis-settings`; its switches go to the legend and the menu "Layers". Entry: `2026-11-03-chart-u3b-gear.md`. | Done, PR 334 |

## Why
- `FormationChart` and `ChartCore` repeat the chart lifecycle. Two engines drift apart, and each new chart feature needs two implementations.
- `overlayLayout` stays until S5. A single switch of all pages in one PR is too large to review and to revert.
- Slots keep `ChartCore` free of formation logic. A flag for each caller makes the shared code worse with each caller.

## S4 result

The page `/chart` (free mode and setup mode) now runs in `ChartPage`. The chart fills the page. `ChartFrame` and the page title are gone. The statistics view stays a normal page, with its own heading.

| Part | Content |
|---|---|
| Top bar (`ChartTopBar`) | Account, mode, setup or symbol, time frame, range, the switch Chart/Statistics, license and display settings. The second row holds the legend switches (setup mode only). The row wraps. |
| Floating card (`FloatingCard`) | Setup mode only. Tab "Overview": live values, setup card, notes. Tab "Trades": the trade archive. At 1024 px and above it is open, below it is closed. |
| Notices (`ChartOverlays`) | The broker clock, load errors and the data quality warning float on the chart under the top bar. `ChartOverlays` measures the top bar and sets `--chart-top` on `formation-main`. |
| `ChartCore` | `ChartCore` also reads the crosshair in the overlay layout when `notes` is set, and shows the trade notes under the top bar. |
| `rememberChartView` | It writes `data-visible-range` on the host and on the surface. In the overlay layout it wrote only on the surface, and the tests read the host. |
| `ChartWorkspace` | New optional prop `fullscreenOfPage`: the full screen button shows the whole page (`data-chart-page`). Only `/chart` sets it. |
| `Modal` | In full screen, the dialog uses `z-[100]`. `formation-main` (`z-70`) lies in the same stacking context. |
| `IndicatorRenderer` | The panes of indicators get their own price scale margins (0.08), not the top margin 0.3 of the candle pane. |
| `ChartPage` | New optional prop `testId` (default `formation-page`). `/chart` uses `chart-page`. |

Changes of existing tests (approved by the coordinator):

| File | Change | Reason |
|---|---|---|
| `analysis.spec.ts` (ANA-15) | Settings and license buttons are in `chart-topbar`. Full screen uses the button of the chart tools. The full screen element is `chart-page`. The step "open the settings in full screen" stays. | `ChartFrame` is gone. The full screen now shows the whole chart page with the top bar (`fullscreenOfPage`), so the settings button stays usable. |
| `chart-workspace.spec.ts` (ANA-19, test "Vollbild-Dialog") | The expected full screen element is `chart-page`, not `chart-workspace`. | Same reason. The rest of the test is unchanged. |
| `analysis-trades.spec.ts` (ANA-08 x2, ANA-12) | The tab "Trades" opens first. | The archive is in the card tab. |
| `chart-workspace.spec.ts` (ANA-19 x3) | The zoom uses the mouse wheel (`zoomIn`). | The overlay layout has no `+` button. |
| `chart-toolbar.spec.ts` (ANA-17) | The line height counts from the lower edge of `chart-topbar` (`lineY`). | The chart fills the page, and the top bar lies on it. |

`chart-workspace.spec.ts` test ANA-18 (RSI fill) stays unchanged. It found a defect: the RSI pane took the top margin 0.3 of the candle pane. The fix is in `IndicatorRenderer`. `/formasyon` stays pixel-identical (screenshots at 1440 px and 375 px before and after). The 375 px picture changes by itself from run to run, but the "before" picture equals the second "after" picture.

Decisions of this step (assumptions, to confirm):
- "Notes" in the card are the existing trade notes under the crosshair. They have no tab.
- The display settings button and the license button stay in the top bar. Existing tests find them by name.
- No `+` and `-` zoom buttons in the overlay layout, as in the design.

## Open points for S5
- The legend row at 375 px scrolls sideways. The top bar takes about half of the screen height there. Check the compact design for narrow screens again (artifact board "Handy").

## S2 result

| File | Change |
|---|---|
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | New slots: `systemRsi`, `runningBar`, `priceRange`, `marginsFor`, `until`, `overlayLayout`, `surfaceProps`, `renderOverlay`. |
| `frontend_nextjs/src/components/formation/FormationChart.tsx` | Adapter on `ChartCore`. `FormationOverlay` holds the SVG drawings. |
| `frontend_nextjs/eslint.config.mjs` | `createChart` is permitted only in `ChartCore.tsx` and in the two line charts `CurveChart.tsx` and `EquityOverlay.tsx`. |

Keep these two points when the other pages move to the overlay layout:
- Set the margins of the price scale before you add the RSI series. The RSI pane copies these margins when the chart creates it.
- The overlay layout does not set the mono font and the `0.08` margins. When `overlayLayout` goes in S5, remove these options, so that all pages look like `/formasyon`.

The chart of `/formasyon` now stays alive when the candidate or the timeframe changes. Before, the chart was removed and created again. The chart also waits for a stable width before it restores the view. This change had five effects:

| Effect | Solution | Test |
|---|---|---|
| The price scale keeps the range of the old candidate. | `priceRange` sets a new autoscale provider, because the chart recalculates the price scale only then. | Existing FRM-20 tests |
| A timeframe change overwrites the saved zoom when both timeframes have the same number of candles. | A layout effect stops `rememberChartView` when `viewKey` changes. `ChartWorkspace` sets the indicators in its own effect. A child effect runs before each `useEffect` of `ChartCore`. | New, FRM-20 |
| The running candle keeps the high and the low of the old timeframe. | `shownRunning` stores `viewKey`. | New, FRM-31 |
| The drawings keep their position when a setting changes the price scale. | `FormationOverlay` draws again when the appearance changes. | New, FRM-20 |
| On CI, `data-visible-range` stayed empty. The chart was complete, but no change event came after `rememberChartView` subscribed. | `rememberChartView` writes the attribute when it subscribes. | Failed on CI only, not reproduced on the Mac, also not with 8 workers or a slow CPU |

`surfaceProps` and `renderOverlay` apply only with `overlayLayout`. `overlayLayout` is a temporary flag in shared code. S5 removes it.

## S3 result

| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-page/ChartPage.tsx` | New. Page frame moved from `formasyon/page.tsx`: root `formation-page`, container `@container/formation-main`, `formation-surface`, top bar wrapper (z-index rules), notices, floating card. Slots: `topBar`, `surface`, `notices`, `floating`, `panel`. |
| `frontend_nextjs/src/components/chart-page/ChartPanel.tsx` | New. Strip on the right (`favorites-strip`) and the side panel (`formation-sidebar`). Slots: `strip`, `children`. |
| `frontend_nextjs/src/app/formasyon/page.tsx` | Uses both. State, hooks, texts and handlers stay in the page. |

The classes, `data-testid` values and z-index rules of the frame moved without change. The 1240 px threshold stays in `FormationToolbar.tsx` and `ChartWorkspace.tsx`; it depends on the container `formation-main`, which `ChartPage` renders. The test ids keep their `formation-` names, because the tests of S4 and S5 use the same frame. `features.yaml`: FRM-37 now lists both new files in `code`.

Verification of "no visible change": screenshots of the mocked build before (state of `main`) and after, at 375, 1024, 1280, 1280 with favorites panel, 1440 px, and 375 px with the alarm panel open. The chart canvas is not stable between runs (it differs in 35 to 10000 bytes of the same screenshot from run to run, also with unchanged code). So I took 5 runs after the change. For each of the six sizes, at least one run is byte-identical to the picture before. The picture with the alarm panel is identical in all runs.

## S1 result

| File | Change |
|---|---|
| `frontend_nextjs/src/components/ChartViewer.tsx` | Removed. No file imported it. |
| `frontend_nextjs/src/store/useWebSocketManager.ts` | Removed the `always` option. `ChartViewer` was its only caller. |
| `frontend_nextjs/src/i18n/messages/chart.ts` | Removed the `chart.viewer.*` keys. |
| `frontend_nextjs/src/components/chart/LiveStats.tsx` | Removed the default parameter. Corrected the comment. |
| `docs/features/features.yaml` | MET-02 points to `LiveStats.tsx` and describes what its test checks. UI-06 no longer names a chart file, because its test reads the dashboard only. |
| `docs/features/manual_results.yaml` | Removed the manual pass of MET-02. It applied to the old check on `/formasyon`. |

The MET-02 test opens `/chart` and reads the live values. It did not touch `ChartViewer`, so the test stays unchanged.

## Open points
- [x] S4 is done (PR 326). S5 and S6b are dropped (decision of 2026-11-03).
- [x] Dropped with S5: `overlayLayout` stays, because `/backtest` keeps its shell `BacktestChart`. Rule from S6a, still valid: the place of the chart tools on `/formasyon` depends on the width of the container `formation-main` (threshold 1240 px), not on the viewport.
- [ ] Do the manual test of MET-02 after S4 is merged (the owner does it), because S4 moves the live values into the floating card.
- [x] Dropped with S6b. Keep this trap for a later trend line on `/backtest`: do not use `useTrendPath` on the backtest chart. It loads MT5 candles up to today. In replay, this shows the future, and it does not match CSV data. Calculate the path from the candles of the run, up to the replay cursor. Write a failing test first.
- [x] Add the feature `UI-10` and its e2e test before S4.
- [ ] `.claude/skills/ui-design/SKILL.md` §8 still names `ChartViewer.tsx`. Rule files change only on request of the project owner (`hooks/RULES.md` §6.6). Ask the owner.

## Open points after U3
- [x] (done 2026-11-04, `2026-11-04-chart-header-stats-landscape.md`) The Statistics view of `/chart` still shows the heading "Analiz" (old page name) and its subtitle.
- [x] (done 2026-11-04) The Statistics view has no mode segment Formation/Setup/Free.
- [x] (done 2026-11-04) In landscape on a phone (812 x 375 px) the top bar is about 150 px high.
- [ ] Later decision of the owner: formation search for a range in the past.

## Live check after U3 (2026-11-03, main v0.7.377)
Dev server against the live worker, DEMO account. At 1440 and 375 px: the three modes and Statistics load, there is no horizontal scroll, and no mode shows the gear. `/formasyon?…` redirects to `/chart?…&mode=formation` with all parameters. The menu "Layers" has 6 switches in Formation, 12 in Setup (account without fractal setups) and 5 in Free; at 375 px each switch is in the viewport. The switch "zone card" hides `zone-info` and stores `showZoneCard`. A mode change keeps the account; Free takes the symbol of the setup.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Exit 0 |
| `npx eslint` on the changed source files | Exit 0 |
| `scripts/features/run.sh MET` with `E2E_PORT=3150` | 3 e2e tests passed |
| `scripts/features/run.sh UI-06` with `E2E_PORT=3150` | 1 e2e test passed |
| Reviewer | No critical finding. The catalog corrections above came from this review. |
| Codex scan | No finding. Browser reconnect paths: not verified, the scan ran read-only. |

The first run on port 3100 failed. An unrelated Python process held this port, so Playwright reused it and no WebSocket opened.

S4:

| Check | Result |
|---|---|
| `UI-10` (`chart-page.spec.ts`) | Red before S4 (6 failed), green after (6 passed) |
| `npx tsc --noEmit`, `npm run lint` | Exit 0 |
| `npm run test:e2e` with `E2E_PORT=3170` | 2360 passed, 3 failed (FRM-30, UI-08, ZON-01). The 3 are time-outs under load (run of 27 minutes, other sessions at the same time). Alone, they pass (39 passed). |
| Screenshots of `/chart`, free and setup, 375, 1024, 1440 px | No horizontal overflow |
| `/formasyon` before and after, 1440 px and 375 px | Pixel-identical |
| Reviewer | No critical finding. The "should" findings are fixed. |
| Codex scan | Not done: `weekly_left` was 3 |

S2:

| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npm run lint` | Exit 0 |
| ESLint lock on the old `FormationChart` | Error, as expected |
| 3 new tests | Failed before the fix, passed after the fix |
| 10 chart spec files with `E2E_PORT=3150` | 163 passed |
| Screenshots of `/formasyon` before and after, 1440 px and 375 px | Pixel-identical. 41 pixels differ only in the version number in the header. |
| Reviewer | No critical finding. One finding fixed. |
| Codex scan | 2 findings, both fixed. Browser StrictMode, unmount and a real worker: not verified, the scan ran read-only. |

## Lessons
- A session started from Remote Control cannot start another session. The session that received the approval then does the step itself.
- e2e tests do not read the canvas. The first version of S2 passed 160 tests, but the axis font and the RSI scale had changed. Compare screenshots before and after a chart change.
- A long-lived chart keeps state that a rebuild cleared. When a chart stops being rebuilt, check each ref and listener against a change of the view.
