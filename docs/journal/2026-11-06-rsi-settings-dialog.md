---
date: 2026-11-06
author: Claude
type: feature
status: open
pr: []
features: [UI-19, UI-18]
areas: [frontend]
---

# Tabbed indicator settings dialog (plan 1106-A2, step S2)

## Request
Step S2 of plan 1106-A2: make the indicator settings dialog work like the TradingView dialog, with tabs Inputs, Style and Visibility. The approved design is the canvas "Tek RSI ve Ayarları" (boards `Girdiler`, `Stil`, `Gorunurluk`, `Main`). The tab shell applies to every indicator kind. The formation rules and `RSI_PARAMS` (7 / 80 / 20) stay as they are.

## Solution
| File | Change |
|---|---|
| `lib/chart-workspace/indicators.ts` | new `Source` `hlcc4`; `PlotType`, `RowStyle`, `Visibility`; new fields `plotType`, `precision`, `statusInputs`, `visibility`, `rowStyles`; `minTimeframe` and `maxTimeframe` are gone; `visibleAtInterval()` |
| `lib/chart-workspace/indicatorStyle.ts` | `rowStyle()` resolves a style row (user choice over theme default); `patchRow()` keeps colour, width and pattern of the main line and the MA in the older fields, because the line menu writes the same fields |
| `lib/chart-workspace/indicatorStorage.ts` | `parseIndicators()` moved out of the store; it converts the seconds range of version 2 into unit rules and validates the new fields |
| `store/useChartWorkspaceStore.ts` | storage version 3; `indicatorDefaults` (saved look per kind) |
| `components/chart-workspace/IndicatorDialog.tsx`, `IndicatorTabs.tsx`, `indicatorControls.tsx` | list of kinds and indicators, or the tabbed dialog with the footer (Defaults, Cancel, OK) |
| `components/chart-workspace/runtime.ts` | plot type (line, step line, area, histogram, circles), per-row colour, opacity, width and pattern of the bands, fills, gradients, MA, Bollinger band and fill, divergence; precision; visibility by unit |
| `components/chart-workspace/IndicatorLegend.tsx` | "inputs in status line" shows `RSI 7 Kapanış 53,69`; precision in the value |
| `i18n/messages/indicatorDialog.ts` | all texts and hints in tr, en and de |

## Why
- Changes show on the chart at once (the dialog writes to the document on every change). Cancel puts back the state from when the settings were opened; adding an indicator is a separate step in the list, so a new indicator stays with its default look. This matches TradingView and needs no draft copy of the document.
- Opening settings from the toolbar list needs a choice of indicator, so the list stays as the first step. Adding an indicator opens its settings.
- Row choices are stored as a sparse object (`rowStyles`), so a theme change still moves every colour the user did not choose.
- The visibility bar in the design is shown, but only the two number fields change the range. A draggable two-handle slider is not made.
- Rejected: one flat range in seconds (no TradingView match), a separate draft state for the dialog (double logic).

## Verification
- `tsc`, `eslint` clean.
- New e2e `chart-indicator-dialog.spec.ts` (`@UI-19`); `chart-workspace.spec.ts` changed to the new dialog flow (adding opens the settings, OK keeps, hour range instead of seconds range).

## Open points
- [ ] Manual check by the project owner on `/chart`: tabs, live preview, Cancel, Defaults menu.
