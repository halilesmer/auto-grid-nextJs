---
date: 2026-11-08
author: Claude
type: plan
status: open
pr: []
features: [UI-22, UI-14, UI-10, UI-13, UI-15, UI-17, ANA-26, ANA-27, FRM-18, FRM-37, FRM-38, FRM-42]
areas: [frontend, tests, docs]
---

# Plan 1107-A21: one chart without modes

The project owner approved this plan on 2026-11-08. It continues "One chart in the system" (`2026-11-01-unified-chart-page.md`, steps U1 to U3b). U3a put three pages under `/chart` as three modes. This plan removes the modes. The steps are U4-1 to U4-6. Each step runs in its own session and its own PR.

## Request
The page `/chart` shows one chart. The mode switch Formation / Setup / Free goes. All nine timeframes (M1 M5 M15 M30 H1 H4 D1 W1 MN) are always visible. The condition of 2026-11-03 stays: no tool is deleted, only duplicate shells go.

Approved design: https://claude.ai/artifact/8o5LE8S3KAEGtJpQvgaXDG ("Tek Grafik · 08.11.", 5 boards). The owner must give access.

## Current state (2026-11-08)

| Topic | Fact |
|---|---|
| Page | `ChartRoot` (`app/chart/page.tsx`) opens `FormationView`, `ZoneChartPanel` (Setup) or `FreeChartPanel` (Free) by `?mode=`. |
| Free chart | It already has W1 and MN (`calendarBars.ts`) and loads older candles (`useMarketRates.loadOlder`). |
| Formation chart | It draws only when a hit exists (else `formation-empty`). Its candles come from the scan context (`context.view`), not from a request of the chart. |
| Setup layers | They are inside `ZoneChartPanel.tsx` (band, levels, positions, orders, trade markers, fractals, card content). |
| Saved drawings | Three storage keys per symbol: `analysis` + `setup`, `analysis` + `free`, `formation` (`workspaceKey`, `lib/chart-workspace/settings.ts`). |
| Trend confirm (FRM-42) | Only in Formation mode (`useTrendConfirm.ts`). |
| Range default | `DEFAULT_RANGE = last30` in `useAnalysisParams.ts`. `/backtest` uses the same hook. |
| Dock | The package `mode` is one of nine packages (`lib/chart-workspace/dock.ts`). |
| e2e | 29 spec files use a `?mode=` URL, the mode switch or `/formasyon`. They hold 422 tests; 181 tests use it directly. |
| Catalog | 36 entries list affected files in `code:`. |

## Decisions

| Code | Decision |
|---|---|
| 1107-A21.1 | Formation detection runs only on D1, H4, H1 and M15. On other timeframes the formation layer is empty, and the chart shows a short note. |
| 1107-A21.2 | The top bar has one symbol select. The chart draws the setups of that symbol as layers. With more than one setup, the user selects the setup in the tab "Overview" of the floating card. |
| 1107-A21.3 | The switch Chart / Statistics stays. Statistics keeps its own setup select in the top bar. |
| 1107-A21.4 | The formation side bar and the setup card become one floating card with the tabs Conditions, Favorites, Overview and Trades. |
| 1107-A21.5 | Outside the formation timeframes, the past moment control and the image save are disabled. Their hint gives the reason. The alarm stays enabled. |
| Comments | The formation row shows only the formations with a hit on the selected timeframe (no hit: no button, a short note). The setup legend row leaves the top bar; its switches go to the menu "Layers", group "Setup" (band, levels, position, pending order, entry and exit, past trades, fractal). The range default is "All" (chart and Statistics). |
| Old links | `?mode=…` and the redirect `/formasyon` keep working. The page ignores `mode`. |
| 1107-A21.6 | One new storage key for the chart. On the first open, the drawings of the three old keys merge (one copy per id). The indicator settings come from the first key that has data, in the order Free, Setup, Formation. The old keys stay. |
| 1107-A21.7 | Without `tf` the chart opens on H4. |
| 1107-A21.8 | The trend settings use the draft and confirm flow on all timeframes. Formations and the alarm are now always on the same chart. |
| 1107-A21.9 | With a past moment (`?at=`) open, a change to a timeframe without formations removes `at`. The chart shows live data. |
| 1107-A21.10 | On W1 and MN, the trade markers of a setup sit on the period start (`periodStart`). See 1107-A4.1. |
| 1107-A21.11 | A symbol without a setup has an empty setup layer. The tab "Overview" says that the symbol has no setup. The tab "Trades" shows the trades of the selected setup (by magic, as now). |
| Range of `/backtest` | `/backtest` keeps `last30`. The default "All" is a separate constant for the chart and Statistics. |

## Steps

Structure comes before behavior. U4-1, U4-2 and U4-3 touch different files and can run at the same time. U4-4a waits for all three.

| Step | Content | Model | Level |
|---|---|---|---|
| U4-1 | Move the setup layers out of `ZoneChartPanel`. No visible change. | Sonnet | medium |
| U4-2 | Move the formation layer and the card contents out of the formation page. No visible change. | Sonnet | medium |
| U4-3 | URL model: pure functions, lib tests, new catalog entry UI-22. No visible change. | Sonnet | medium |
| U4-4a | Switch: one chart, top bar, nine timeframes, both layers, groups in "Layers", range "All". The side bar and the setup card stay for one step. | Sonnet | high |
| U4-4b | One card: side bar and setup card become Conditions, Favorites, Overview, Trades. | Sonnet | medium |
| U4-5 | Remove the old shells and every trace of `mode`. Clean the catalog. | Sonnet | medium |
| U4-6 | Live check on the DEMO account (read-only), phone check by the owner, sign UI-22. | Sonnet | low |

U4-4a has the level high: it changes 29 spec files and moves the formation drawing onto a long candle series (view alignment, FRM-20 and ANA-27).

### U4-1 Setup layers
| File | Change |
|---|---|
| `hooks/useSetupLayers.ts` (new) | Band, lines, markers, links, notes, fractals, focus, `setupSwitches`, legend list, notices. |
| `components/chart/SetupCardTabs.tsx` (new) | Content of the tabs "Overview" and "Trades". |
| `components/chart/ZoneChartPanel.tsx` | Thin shell. It still calls `useMarketRates`. |

- Do not touch: `useMarketRates`, `candles.ts`, `ChartCore` (files of plan 1107-A4), test ids, i18n.
- Tests: no spec changes. Take screenshots at 1440 px and 375 px before and after (e2e tests do not read the canvas).
- Done when: `precheck.sh` passes, the screenshots are equal, the PR is in auto-merge.

### U4-2 Formation layer
| File | Change |
|---|---|
| `components/formation/FormationLayer.tsx` (new) | The drawing for `renderOverlay` of any `ChartView`. Input: the hit and the `bars` and `points` of the chart. |
| `FormationActions` (new, from `FormationView` and `FormationToolbar`) | Past moment and steps, image save, alarm, status chip. Props `enabled` and `disabledHint`. |
| `FormationForms` (new) | Only the formations with a hit on the selected timeframe; else a note. |
| `FormationChart.tsx`, `FormationView.tsx`, `FormationToolbar.tsx` | Use the new parts. |

- Do not touch: `useFormationScan`, the data files, the visible page.
- Done when: the formation specs pass without change, the screenshots are equal, `precheck.sh` passes, the PR is in auto-merge.

### U4-3 URL model
| File | Change |
|---|---|
| `lib/chart/chartUrl.ts` (new) | `parseChartUrl(params)` gives account, symbol, zone, `tf` (nine values, default H4), form, `at`, range (default "All"), tab. Old links: `mode` is ignored; `zone` without `symbol` gives the symbol of the zone; `tab=stats` gives Statistics. Write rules: a default value leaves the URL, each write removes `mode`, a timeframe without formations removes `form` and `at`. |
| `e2e/mocked/chart-url-lib.spec.ts` (new) | Lib tests, `@UI-22`. Red first. |
| `docs/features/features.yaml` | New entry UI-22 "One chart without modes". |

No component uses the model in this step (same as step S1 of plan 1106-A1).

### U4-4a Switch
Before the start: check `list_sessions`. Sessions of plan 1107-A4 that change `FreeChartPanel`, `ChartCore`, `useMarketRates` or `candles.ts` must be finished.

| File | Change |
|---|---|
| `FreeChartPanel.tsx` → `components/chart-page/OneChart.tsx` (`git mv`) | Symbol select (`FormationSymbolSelect`), nine timeframes with the hit count on formation timeframes and the dot on W1 and MN, formation row (`FormationForms`), `FormationActions`, formation layer on D1/H4/H1/M15 only, setup layers through `useSetupLayers` (the `zone` of the symbol, else its first setup). The side bar (`ChartPanel`) and the setup card (`FloatingCard`, with the setup select in "Overview") stay as they are. |
| `LayersMenu.tsx` | Group "Formation" (formation drawings and a help text). Group "Setup" with the seven switches. |
| `ChartTopBar.tsx` | No `mode` slot and no legend row (`extra`) on the chart. |
| `app/chart/page.tsx`, `hooks/useChartParams.ts` (new) | `ChartRoot` opens `OneChart` or Statistics. The Statistics bar: account, setup select, range, Chart/Statistics. |
| `useTrendConfirm.ts` | Decision 1107-A21.8. |
| `lib/chart-workspace/settings.ts`, `useChartWorkspaceStore` | Storage key merge, decision 1107-A21.6. |
| `next.config.ts`, `lib/formation/alarmNotify.ts` | The redirect and `formationUrl` go to `/chart` without `mode`. The query stays. |
| i18n, `hints.ts` (tr, en, de) | `cw.layers.formation.help`, `cw.layers.setup.help`, `chart.formation.offTf`, `chart.formation.onlyTf`, `chart.formation.noneTf`, `chart.card.setupSelect`, `chart.card.noSetup`, `formation.asof.offTf.hint`, `formation.shot.offTf.hint`. Each new control has a `hint` (UI-07). |

Test changes. The owner approved them with this plan. Only places and names change. No assertion becomes weaker.

| Change | Files |
|---|---|
| Add `tf=M15` to Setup and Free URLs without `tf` (33 lines). | Setup and Free specs |
| Write the 3 tests of the mode defaults again for the UI-22 rule. | `chart-one-page.spec.ts` (2), `chart-workspace.spec.ts` (no W1 button) |
| Replace clicks on `chart-mode-*` with a URL or a symbol select. Tests of the switch itself become UI-22 tests. | 9 files, among them `chart-one-page`, `chart-header`, `tooltips` (UI-07) |
| Replace `chart-key-*` and `chart-legend-toggle` with the switches of `layers-menu`. | `analysis-chart`, `analysis-trades`, `chart-header`, `chart-layers-menu`, `chart-page` |
| Replace the test id `formation-page` with `chart-page`. | 7 files |

New UI-22 tests (red before the switch): no mode switch; nine timeframes at 375 px, 812 × 375 px and 1440 px; on M5 an empty formation layer with a note, disabled past moment and image save with hints, enabled alarm; on H4 the formation drawing and the setup band on the same chart; the formation row shows only formations with a hit; old links open the correct symbol, setup and view; the range default is "All" and `/backtest` keeps `last30`; the storage key merge; decision 1107-A21.9.

Catalog: UI-22 complete. UI-14 gets the note "replaced by UI-22". Route texts and `code:` lists of UI-10, UI-12, UI-13, UI-15, UI-17, UI-18, ANA-01, ANA-03, ANA-05, ANA-16, ANA-26, ANA-27, FRM-18, FRM-23, FRM-25, FRM-35, FRM-38, FRM-45.

Done when: `precheck.sh` passes (it fails when Playwright ran zero tests), no horizontal scroll at 375, 812 × 375, 1024 and 1440 px, screenshots are in the step entry, the reviewer has no finding, the PR is in auto-merge.

### U4-4b One card
| File | Change |
|---|---|
| `components/chart-page/ChartCard.tsx` (new) | `FloatingCard` with four tabs: Conditions (`FormationConditions`, a note without a hit or on another timeframe), Favorites (`FavoritesSidebar` and the add button), Overview (setup select, live values, setup card), Trades (`TradesTable`). |
| `OneChart.tsx` | No side bar and no favorites strip. The status chip opens Conditions. On the phone a button "Card" opens it (board 4). Open state and tab come from `useFormationSidebar` (`grid-robot-formation-sidebar`), so the user setting stays. |
| `FloatingCard.tsx` | Test ids `chart-card-tab-<id>`. |
| i18n, `hints.ts` | `chart.card.conditions`, `chart.card.favorites`, `chart.card.open`, each with `.hint`. |

Tests: `formation-page.spec.ts` (side bar 14, tabs 11, strip 2, favorites about 22 places), `formation-past`, `formation-line-menu`, `chart-header`, `chart-layers`, `chart-page`, `analysis-trades` use the card tabs. The assertions stay. Catalog: FRM-22, FRM-29, FRM-37.

Done when: `precheck.sh` passes, the card is open from 1024 px and closed below (UI-10 rule), the PR is in auto-merge.

### U4-5 Remove the old shells
- Remove: `FormationView.tsx`, the shell of `ZoneChartPanel.tsx`, `AnalysisView`, `ChartModeSegment`, `useChartMode.ts`, `useFormationParams.ts`, `lib/chart/mode.ts` and `ChartPanel.tsx` (when no user remains), the keys `cw.mode.*` with their hints, `analysis.chart.key.toggle`, the strip keys, the dock package `mode` (`DOCK_PACKAGES`, default layout, `SHRINK_ORDER`; a stored `mode` is dropped, lib test).
- Keep `useAnalysisParams` for `/backtest`.
- Move the lib tests of removed code (`timeframeParam` in `analysis-calendar-lib.spec.ts`) to the `chartUrl` tests.
- Done when: `rg` finds no user of the removed names, `precheck.sh` passes, the PR is in auto-merge.

### U4-6 Live check
DEMO account, read-only (`hooks/RULES.md` §3): formation and setup on H4, empty formation layer on M5, W1 and MN, old links, phone at 390 px. The owner checks on the phone. Sign UI-22. Set this entry to `status: done`.

## Why
- The free chart is the base, because it already has all nine timeframes and the older pages. The formation chart only draws around one hit and has no data of its own.
- The steps U4-1 to U4-3 make the parts before the switch. The switch then mostly joins finished parts, so its PR stays reviewable.
- U4-4 has two PRs. One PR with the switch and the card merge would change about 50 places in `formation-page.spec.ts` (136 tests) together with the chart. That is too large to review and to revert (lesson of `2026-11-01-unified-chart-page.md`). Between U4-4a and U4-4b, the side bar and the setup card are visible at the same time. No tool is lost.
- H4 is the default because the design shows H4 and the formation layer is full on the first open.
- The draft and confirm flow applies to all timeframes, because formations and the alarm now always use the same chart and the same trend values.
- The range default "All" does not apply to `/backtest`. The backtest page stays as it is (decision of 2026-11-03).

## Risks

| Risk | Measure |
|---|---|
| The zoom to a formation hit (`priceRange`, `viewKey`) now works on a long candle series. | FRM-20 and ANA-27 tests pass together. Screenshots before and after. |
| A point of the formation is before the loaded range. | The default "All" makes this rare. A test covers a cut drawing. |
| RSI divergence marks use the chart candles. The scan uses the same MT5 candles with a different warm-up length. | Compare the marks in U4-4a. |
| Plan 1107-A4 changes the same data files. | Check the sessions before U4-4a. |
| Full e2e runs are heavy. | `heavy_lock.sh` runs them one at a time, also when U4-1 to U4-3 run at the same time. |

## Open points
- [x] U4-1 setup layers (PR 451)
- [x] U4-2 formation layer (PR 452)
- [x] U4-3 URL model (PR 450)
- [x] U4-4a switch (`2026-11-08-chart-u4-4a-switch.md`)
- [x] U4-4b one card (`2026-11-08-chart-u4-4b-one-card.md`; open point: the open card covers the formation from 1024 px)
- [ ] U4-5 remove the old shells
- [ ] U4-6 live check and signature of UI-22
