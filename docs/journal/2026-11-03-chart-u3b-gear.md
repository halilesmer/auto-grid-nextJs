---
date: 2026-11-03
author: Claude
type: change
status: done
pr: [334]
features: [ANA-03, ANA-05, ANA-06, ANA-15, UI-13, ANA-19]
areas: [frontend, docs]
---

# Remove the gear "Display settings" (U3b)

## Request
Step U3b of "One chart in the system" (`2026-11-01-unified-chart-page.md`). The gear `analysis-settings` (`AnalysisSettingsPanel`) is removed, because every switch in it exists in another place. No switch may be lost.

## Solution
| File | Change |
|---|---|
| `src/components/analysis/AnalysisSettingsPanel.tsx` | Deleted. `useAnalysisPrefsStore` stays (the trend settings use it). |
| `ZoneChartPanel.tsx` | The gear leaves the top bar. The menu "Layers" gets the Setup section: zone band, grid levels, open positions, pending orders, closed trades, fractals (fractal setups only), RSI (14), zone card, and the note on the warnings that cannot be switched off. The legend `chart-key-<pref>` stays and shows the same state. |
| `FreeChartPanel.tsx` | The gear leaves the top bar. |
| i18n | Keys `analysis.settings` and `analysis.settings.hint` removed. `analysis.chart.noData` is still used by the chart and stays. |

## Where each switch is now
| Switch | Mode where it acts | 1440 px | 375 px |
|---|---|---|---|
| showZoneLines, showLevels, showTrades, showOrders, showHistory | Setup | legend and menu | menu (the legend scrolls sideways) and legend |
| showFractals | Setup, fractal setups | legend and menu | same |
| showRsi, showZoneCard | Setup | menu | menu |
| showPauses, showGaps | Setup and Free | menu | menu |
Trades, orders, history, fractals, levels, band, RSI 14 and zone card have no effect in Free mode, so they have no place there.

## Decision on the dialog "Display"
The section "Layers" of the dialog "Display" in Setup mode held the same switches (`modeOverlays`). The owner decided: the section goes in Setup too, so Setup is not the only mode with three places (U2b removed it in Formation and Free). The prop `modeOverlays` of `ChartView` is removed. The test ANA-19 (preview, cancel, hard reload, apply) now uses "Show names" in the status line section. It has a measurable effect (the names in `workspace-indicator-values`). The test checks the storage key `grid-robot-chart-workspaces-v1` instead of `grid-robot-analysis-prefs`.

## Tests
Tests that used the gear now use the menu (`layers-button`, `layers-menu`). Assertions on the effect are unchanged. The mirror test menu/gear became: Pauses and gaps switch from the menu and stay after reload (free and Setup); legend and menu show the same state for the five Setup layers. New: no `analysis-settings` in all three modes; every Setup switch is reachable at 1440 and 375 px; the zone card follows the menu switch at 1440 px (at 375 px the floating card is folded, so only the switch state is checked).
