---
date: 2026-11-03
author: Claude
type: plan
status: open
pr: [332]
features: [UI-13, UI-11, FRM-35, ANA-19]
areas: [frontend, docs]
---

# Button "Layers" with one menu on each chart (U2b)

## Request
Step U2b of "One chart in the system" (`2026-11-01-unified-chart-page.md`). One button "Layers" next to Trend on each chart (`/chart` free and setup, `/formasyon`). The menu is the same in each mode. The shared layers stand on top, the layers of the mode below them. Approved design: "One chart, 03.11." of the design artifact (boards Chart-Formation, Chart-Setup, Chart-Frei, Chart-Handy).

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-page/LayersMenu.tsx` | New. Dropdown "Layers" with the shared switches (trend path, RSI(7), Wave 5/35, pauses, data gaps) and the section of the mode (`modeTitle`, `children`). The switches write to the same stores as before (`useAnalysisPrefsStore`, overlays of the chart workspace), so saved settings stay valid. Below 71 rem the menu opens upward (the tool card is at the bottom). |
| `frontend_nextjs/src/components/chart-page/ChartView.tsx` | Shows the button after the mode buttons (`toolbarActions`). It reads `showPauses` and `showGaps` itself, so every chart has them. New props: `timeframe`, `modeLayers`, `modeTitle`. |
| `frontend_nextjs/src/components/formation/FormationChart.tsx` | The chart data now holds pauses and data gaps (from the candle spacing and `gapBefore`). The formation drawing switch moves into the mode section. |
| `frontend_nextjs/src/app/formasyon/page.tsx` | Shows the broker clock badge (`broker-clock`), as `/chart` does. |
| `frontend_nextjs/src/components/chart/ZoneChartPanel.tsx` | The mode section of the setup mode holds RSI 14 (`showRsi`). |
| `frontend_nextjs/src/components/chart/ZoneChartPanel.tsx`, `frontend_nextjs/src/components/chart-workspace/FreeChartPanel.tsx` | The legend chips for pauses, data gaps and RSI leave the setup bar (the bar keeps zone, levels, positions, orders, entries/exits, fractals). The dialog "Display" loses its section "Layers" on free and formation; in setup mode it keeps `AnalysisSettingsPanel inline` (preview until "Apply"). |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | New attributes `data-rsi-visible` and `data-pauses-shown` (tests). |
| `frontend_nextjs/src/app/globals.css` | TradingView logo on the chart pages: below lg it moves to the bottom of the lowest pane and is smaller, so it does not cover the legend row (pane about 43 px high at 375 px). |
| `frontend_nextjs/e2e/mocked/chart-layers-menu.spec.ts`, `docs/features/features.yaml` | New feature UI-13 with 18 tests. |

## Deviations from the plan
- RSI 14 (`showRsi`) is a switch of the setup mode, not of the shared section. It is the user indicator of the setup legend, and it has no other place in the menu. The design shows five shared layers only.

## Review findings (fixed)
- On `/formasyon` the chart data now holds blank slots for data gaps. The drawing overlay mapped time to x with the index of the candles only, so drawings behind a gap moved left. It now uses the index of the chart points.
- The data gaps on `/formasyon` come from the real missing ranges of the series (`TimeframeView.missing`, new), not from the candle spacing: a gap longer than a market pause would look like a pause. `formationChartData` (`lib/formation/chartData.ts`) builds the chart data; unit tests in `formation-chart-data-lib.spec.ts`. The mock worker cannot place a missing range in the fixture period (the request window is the current time), so there is no e2e test with a gap on the page.
- The switch RSI(7) now also hides the drawings of the RSI pane on `/formasyon`.

## Changes of existing tests
The coordinator approved them on 2026-11-03. The checks stay the same; only the place changes. Conditions: ANA-19 keeps both checks (preview visible on the chart, cancel restores) and a test compares menu and gear.

| File | Change | Reason |
|---|---|---|
| `chart-layers.spec.ts` (UI-11) | The switches `RSI`/`Wave` are in the menu `Layers` (`#layer-rsi`, `#layer-wave`) instead of the dialog. The test for user indicators no longer clicks "Apply" (the menu has no apply step). | The dialog section is gone. |
| `formation-page.spec.ts` (FRM-35) | Same: `#layer-wave` in the menu. | Same. |
| `analysis-chart.spec.ts` (ANA-11) | Pauses and gaps switch in the menu. The checks `data-gaps-shown`, `data-gap-areas` and the data quality notice stay. New: `data-pauses-shown` (was only the legend chip). The line "legend contains no-data key" goes with the chip. | The chips are gone from the setup bar. |
| `chart-workspace.spec.ts` (ANA-19) | Setup mode, switch "Levels" in the dialog section. Checks: preview visible at the chart (`data-lines` falls) before "Apply" with the saved value unchanged, "Cancel" restores, hard reload without apply restores, "Apply" then reload keeps it off. | Free mode has no switch in the dialog any more. `data-lines` also counts the zone band lines, so the test compares with the start value. |
| `chart-layers-menu.spec.ts` (UI-13, new) | Menu and gear `analysis-settings` show the same state for pauses and gaps, in both directions. | Two places for the same value (the gear goes in U3). |

## Open points
- [ ] U3: remove the gear `analysis-settings` as the artboard shows (top bar without gear). ANA-03 and `analysis-trades` then move to legend chips or the menu `Layers`. Pauses and gaps are in two places until then (menu and gear).
- [ ] U3: merge the pages.
