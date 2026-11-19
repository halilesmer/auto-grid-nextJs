---
date: 2026-11-19
author: Claude
type: fix
status: open
pr: []
features: [ANA-19]
areas: [frontend, chart, tests]
---

# The chart is not built again when the trade notes come

## Decision
1119-A11.1 = B (Halil, 2026-11-19). `ChartCore` must not remove and build the chart again when `notes` appears or goes away.

## Cause
`hasNotes` (`notes !== undefined`) was a dependency of the effect that builds the chart. It was used only to attach the crosshair listener. `notes` exists only with a setup zone (`OneChart`: `zone ? layers.notes : undefined`). When the settings answer comes after the chart, or the user changes to a symbol with or without a zone, `hasNotes` changes and the chart is built again: the zoom is lost and the chart is empty for a moment.

## Measurement
Test `Kurulum bölgesi grafikten sonra gelince …` (ANA-19), mock worker, `/chart` for a symbol with a zone, settings answer held until after the zoom. Counter `data-chart-builds` on the chart element (counts builds of the container).
- Before the fix: 1 build before the answer, 2 after it (red).
- After the fix: see Result.

## Change
The crosshair listener has its own effect. The effect that builds the chart depends on `hasCurves`, `overlayLayout`, `systemSeries` only.

## Other dependencies
Not changed. `hasCurves`, `overlayLayout` and `systemSeries` are set with the chart type and the workspace, not with data that comes late. Not measured further.

## Result
- [ ] Green run after the fix; PR merged; `tests.yml` on `main` green.
