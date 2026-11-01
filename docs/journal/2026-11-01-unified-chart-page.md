---
date: 2026-11-01
author: Claude
type: plan
status: open
pr: [275]
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

## Steps

Each step is one PR. The steps run in sequence because they change the same files. Structure comes before behavior.

| Step | Content | Status |
|---|---|---|
| S0 | Design | Approved on 2026-11-01 |
| S1 | Remove `ChartViewer.tsx` and the code that only it used | Done, PR 275 |
| S2 | `FormationChart` runs on `ChartCore`, with slots instead of flags. A check blocks other `createChart` calls. | Done, see "S2 result" |
| S3 | Extract `ChartPage` and a general `ChartPanel`. `/formasyon` shows no visible change. | Open |
| S4 | `/chart` moves into `ChartPage`. `ChartFrame` and the page title go. | Open |
| S5 | `/backtest` moves into `ChartPage`. Remove `overlayLayout`. | Open |
| S6 | `TrendToggle` moves into `ChartWorkspace`, so all pages have the same buttons. | Open |

## Why
- `FormationChart` and `ChartCore` repeat the chart lifecycle. Two engines drift apart, and each new chart feature needs two implementations.
- `overlayLayout` stays until S5. A single switch of all pages in one PR is too large to review and to revert.
- Slots keep `ChartCore` free of formation logic. A flag for each caller makes the shared code worse with each caller.

## S2 result

| File | Change |
|---|---|
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | New slots: `systemRsi`, `runningBar`, `priceRange`, `marginsFor`, `until`, `overlayLayout`, `surfaceProps`, `renderOverlay`. |
| `frontend_nextjs/src/components/formation/FormationChart.tsx` | Adapter on `ChartCore`. `FormationOverlay` holds the SVG drawings. |
| `frontend_nextjs/eslint.config.mjs` | `createChart` is permitted only in `ChartCore.tsx` and in the two line charts `CurveChart.tsx` and `EquityOverlay.tsx`. |

Keep these two points when the other pages move to the overlay layout:
- Set the margins of the price scale before you add the RSI series. The RSI pane copies these margins when the chart creates it.
- The overlay layout does not set the mono font and the `0.08` margins. When `overlayLayout` goes in S5, remove these options, so that all pages look like `/formasyon`.

The chart of `/formasyon` now stays alive when the candidate or the timeframe changes. Before, the chart was removed and created again. This change had four effects:

| Effect | Solution | Test |
|---|---|---|
| The price scale keeps the range of the old candidate. | `priceRange` sets a new autoscale provider, because the chart recalculates the price scale only then. | Existing FRM-20 tests |
| A timeframe change overwrites the saved zoom when both timeframes have the same number of candles. | A layout effect stops `rememberChartView` when `viewKey` changes. `ChartWorkspace` sets the indicators in its own effect. A child effect runs before each `useEffect` of `ChartCore`. | New, FRM-20 |
| The running candle keeps the high and the low of the old timeframe. | `shownRunning` stores `viewKey`. | New, FRM-31 |
| The drawings keep their position when a setting changes the price scale. | `FormationOverlay` draws again when the appearance changes. | New, FRM-20 |

`surfaceProps` and `renderOverlay` apply only with `overlayLayout`. `overlayLayout` is a temporary flag in shared code. S5 removes it.

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
- [ ] S3 to S6.
- [ ] Do the manual test of MET-02 after S4, because S4 moves the live values into the floating card.
- [ ] Trap for S6: do not use `useTrendPath` on the backtest chart. It loads MT5 candles up to today. In replay, this shows the future, and it does not match CSV data. Calculate the path from the candles of the run, up to the replay cursor. Write a failing test first.
- [ ] Add the feature `UI-10` and its e2e test before S4.
- [ ] `.claude/skills/ui-design/SKILL.md` §8 still names `ChartViewer.tsx`. Rule files change only on request of the project owner (`hooks/RULES.md` §6.6). Ask the owner.

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
