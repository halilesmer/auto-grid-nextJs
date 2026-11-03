---
date: 2026-11-03
author: Claude
type: plan
status: open
pr: []
features: [UI-11, FRM-35, ANA-21]
areas: [frontend, docs]
---

# Shell ChartView with the shared layers (U2a)

## Request
Step U2 of "One chart in the system" (`2026-11-01-unified-chart-page.md`). All chart pages use one shell around `ChartCore`. The shell shows the same layers on each chart. U2 is split in two PRs: U2a (this entry) and U2b (the "Layers" button and the new layers on `/formasyon`).

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-page/ChartView.tsx` | New. Shell around `ChartCore`. It calculates the system RSI(7) and the Wave 5/35 from `signalBars` with `rsi()` and `wave()` of `lib/formation/indicators` (the same calculation as `/formasyon`). It sets the layout of the chart pages (`overlayLayout`, margins) and shows the switches "RSI" and "Wave" first in the dialog "Display". The mode adds its own switches (`modeOverlays`) and its drawing surface (`renderOverlay`). |
| `frontend_nextjs/src/hooks/useSignalBars.ts` | New. The closed candles of the chart (same rule as the trend path: `closedBars`). |
| `frontend_nextjs/src/components/chart-workspace/FreeChartPanel.tsx`, `frontend_nextjs/src/components/chart/ZoneChartPanel.tsx` | Use `ChartView`. `/chart` free and setup now show RSI(7) and Wave 5/35. |
| `frontend_nextjs/src/components/formation/FormationChart.tsx` | Uses `ChartView`. It passes the bars of the formation view and its formation drawing. The RSI and wave series are no longer calculated here. |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | Only `export` of `ChartCoreProps`. `BacktestChart` does not change. |
| `frontend_nextjs/e2e/mocked/chart-layers.spec.ts`, `docs/features/features.yaml` | New feature UI-11 with 4 tests. Red before the change. |

## Why
- The shared layers belong to the shell, not to each page. A page gives data and its own layer.
- The series of `/formasyon` were the calculation of `context.view`. They are causal, so the values for the closed candles are the same as `rsi(bars)` and `wave(bars)`.

## Deviations from the plan
- RSI and wave use the candles of the chart, not the window of the trend hook. The trend hook loads only for D1, H4, H1, M15 and only when the trend is on. RSI and wave must also work on all other time frames and without the trend. Cost: the RSI(7) and the wave start at the left edge of the chart, so the first values differ a little from `/formasyon` and MT5 (RSI settles after some candles, the wave has no value for the first 34 candles).
- The switches "RSI(7)" and "Wave 5/35" have neutral texts (`cw.layerRsi`, `cw.layerWave`). On `/formasyon` the labels in the dialog "Display" change from the legend texts to these. The order is RSI, Wave, then the formation switch.
- On a new `/chart` layout, two RSI panes show (the system RSI(7) and the user RSI(14)). The user EWO and the system wave are similar. U2b may decide about the user defaults.
- `/chart` free and setup keep their default user indicators RSI(14) and EWO. Only `/formasyon` sets `systemRsi` and `systemWave` in the workspace context, as before. Thus the defaults of new layouts and the saved layouts do not change. Two RSI panes (7 and 14) show on a new `/chart` layout. U2b may decide about the defaults.

## Layout below 71 rem

Below 71 rem width of the container `formation-main`, the tool bar floats as a card at the bottom of the chart. With five panes, the lowest pane lay under the card. Its pane buttons (z-index 51) lay above the card (45) and took the click on "Trend" (ANA-21 at 375 px; found with `elementFromPoint`, not a timing problem). A higher z-index for the card would hide the pane buttons of the lowest pane (ANA-20 at 375 px). The coordinator chose to end the panes above the card.

| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | The card writes `--workspace-card` on the workspace root: its height, its distance from the bottom and 8 px. A `ResizeObserver` keeps it current, so it follows 16 px and 20 px fonts. |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | In the overlay layout, the chart surface ends `--workspace-card` above the bottom. From 71 rem (same threshold as the tool bar in `FormationToolbar.tsx`) it ends at the bottom again. |
| `frontend_nextjs/src/components/chart-page/ChartOverlays.tsx`, `frontend_nextjs/src/components/chart-page/FloatingCard.tsx` | The floating card gets `z-[52]`, above the pane buttons (51). The layer of the notices keeps `z-30` (now on the notice block; the wrapper has no z-index). At 375 px the open card lay over pane buttons that took its clicks (UI-10, tab "Trades"). A `z-[52]` on the whole layer covered menus of the top bar (ANA-02), so only the card is lifted. The tests are unchanged. |

This also changes `/formasyon` below 71 rem. The approved design shows it: `Chart-Handy.dc.html` of the artifact "Ein Chart · 03.11." ends the wave pane above the floating tool bar, with a spacer of 58 px. The `BacktestChart` does not set `overlayLayout` and does not change (BKT unchanged). The test `UI-11 schmale Breite` was red without the reserve and green with it.

Price pane at 375 x 812 px (measured, `getBoundingClientRect` of the pane row): 297 px before this change 365 px. The top bar covers the upper part of it (free mode 192 px, setup mode 276 px, because the top bar there is higher). The visible part is about 105 px in free mode and about 21 px in setup mode. This is an old problem of the top bar (see "Open points for S5" in `2026-11-01-unified-chart-page.md`). It is not solved here.

## Changes of existing tests
The coordinator approved the changes on 2026-11-03. The checks stay the same; only the way to find the user pane changes.

| File | Change | Reason |
|---|---|---|
| `frontend_nextjs/e2e/mocked/chart-workspace.spec.ts` (ANA-20, 2 tests) | `openOscillatorChart` checks that the two system panes exist (`data-system-panes` is 3, `data-wave-visible`). `paneHeights` leaves out the two system panes after the price pane. All counts and indices of user panes stay. | `/chart` has two system panes more (UI-11). |
| `frontend_nextjs/e2e/mocked/chart-workspace.spec.ts` (ANA-18, RSI fill) | The canvas row of the user RSI is the row that holds its legend row. Before it was the second row. | The second row is now the system RSI(7). |
| `frontend_nextjs/e2e/mocked/chart-hover.spec.ts` (ANA-22, 2 tests) | New helper `paneBoxOf`: the box of the pane that holds the legend row of the indicator. It replaces `paneBox(page, 1)`. | Same reason. |
| `frontend_nextjs/e2e/mocked/formation-page.spec.ts` (FRM-22, FRM-23 light and dark) | The chart height plus the reserve (`--workspace-card`, read from the workspace root) must equal the page height. Before, the chart height alone had to equal it. | The chart now ends above the tool card below 71 rem (see "Layout below 71 rem"). Approved by the coordinator. |
| `frontend_nextjs/e2e/mocked/analysis-trend.spec.ts` (ANA-21, 375 px) | None. | The cause was the card over the pane buttons, fixed in the code. |

## Verification
| Check | Result |
|---|---|
| `scripts/features/run.sh e2e UI-11` | Red before the change, 7 passed after (the test "narrow width" was also red without the reserve) |
| `scripts/features/run.sh e2e ANA`, `UI`, `FRM`, `BKT` | 184, 133, 1630 and 304 passed |
| `npx tsc --noEmit`, `npm run lint` | No error (2 old lint warnings) |
| Screenshots with the mocked worker, 1440 and 375 px, light and dark: `/chart` free, `/chart` setup, `/formasyon` | Looked at: `/chart` free and `/formasyon` at 375 px, `/chart` setup at 375 px. The others were taken and not looked at one by one. |
| Reviewer | Two passes. The first found the default indicators (fixed). The second found: reserve in the wide mode, `useLayoutEffect`, a weak FRM check, the order of the cards (all fixed). |
| Codex scan | Not done: `weekly_left` was 2 |
| Visual check against the live worker | Open. The coordinator does it after the merge. |

A stale server of an earlier run on the same port served the old build once and gave wrong failures. Use a new `E2E_PORT` after you stop a run.

## Open points
- [ ] Compact top bar (design "Handy"), next step (owner, 2026-11-03). At 375 px only 105 px (free mode) and 21 px (setup mode) of the price pane stay visible.
- [ ] U2b: the button "Layers" next to Trend, one menu for each mode; Broker clock, pauses and gaps on `/formasyon`.
- [ ] U3: merge the pages.
