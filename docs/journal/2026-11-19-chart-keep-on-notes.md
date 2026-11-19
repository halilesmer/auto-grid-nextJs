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
- After the fix: the held-answer test is green (1 build before and after the answer).
- Natural flow (answer not held, mock worker, 5 page loads each for a symbol with a zone and one without, `data-chart-builds` after 2.5 s): before the fix 10 of 10 loads = 1 build; after the fix 10 of 10 = 1 build. "Before" is the fixed file with `hasNotes` put back into the dependencies of the build effect, not the old commit.
- Meaning: on a fresh load the mock gives the zones before the chart is built, so the defect does not show. It shows when the zones come after the chart (slow settings answer, real VPS) or when the symbol changes between a symbol with a zone and one without. Not measured on the real VPS; the symbol change without a reload is not measured either.
- First measurement run (pid 10030) died on purpose: the temporary spec did not use the `worker` fixture, so every test waited 2 minutes for a chart that never came; I stopped it with `TaskStop`. The lock stayed about 24 minutes after that until a waiting run broke it as stale (lock child processes of a stopped task outlive it). Run again with the fixture.

## Change
The crosshair listener has its own effect. The effect that builds the chart depends on `hasCurves`, `overlayLayout`, `systemSeries` only.

## Other dependencies
Not changed. `hasCurves`, `overlayLayout` and `systemSeries` are set with the chart type and the workspace, not with data that comes late. Not measured further.

## Result
- [x] Green run after the fix: ANA-19, FRM-20 and hover tests 75 of 75; `precheck.sh` OK (4012 of 4012, no flaky test).
- [ ] PR merged and `tests.yml` on `main` green.
