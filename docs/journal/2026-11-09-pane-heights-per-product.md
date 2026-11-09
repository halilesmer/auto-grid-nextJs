---
date: 2026-11-09
author: Claude
type: fix
status: done
pr: []
features: [UI-24]
areas: [frontend]
---

# Oscillator pane heights stay per product

## Request
Halil made the RSI and EWO panes smaller with the separator and reloaded the page. The panes came back with the default height. The height must stay per product.

## Result
- **Cause:** `IndicatorRenderer.applyPaneParts` (`runtime.ts`) set every open oscillator pane to half the price pane on each pane rebuild. The chart document had no field for the height, and lightweight-charts sends no event when the user drags a separator.
- **Fix:** the chart document has `paneHeights` (part of the price pane, keyed by pane id). After each pointer release, `ChartWorkspace` asks the renderer to measure the panes (`measurePaneParts`). The renderer compares with the last layout, so a click without a drag saves nothing. Collapsed and maximized panes are not measured. On the next layout, `applyPaneParts` uses the saved part; panes without a saved part keep the default.
- **Test:** `e2e/mocked/chart-pane-heights.spec.ts` (@UI-24): drag, reload, same height; another symbol keeps the default height.

## Lesson
lightweight-charts 5.2 changes the pane stretch factors by itself when the user drags a separator, and has no subscribe call for it. Read `getStretchFactor()` after the pointer release.
