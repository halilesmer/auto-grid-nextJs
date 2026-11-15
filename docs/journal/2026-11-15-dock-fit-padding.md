---
date: 2026-11-15
author: Claude
type: fix
status: open
pr: []
features: [UI-17]
areas: [chart, dock]
---

# Dock row fit ignored the side padding

## Request
A side finding said that `fitRow` compares the needed width with the row width including the side padding (row 2 has `px-2`), so the last package can pass the right edge and no arrow menu appears.

## Measurement (before the fix)
- Claim as written (560 px, 3 formation buttons): not reproduced. At 520–580 px the row 2 content ends at 525.0 px, inside the content edge (552 px at 560 px), and the arrow menu is visible.
- The defect is real at other widths. Sweep from 640 px down in 4 px steps with the test clock `2026-11-12T16:21:00Z`: at 612 px the last package ends 0.58 px behind the content edge. At 600 px with the clock `2026-11-12T21:30:00Z` the last package ended at 599.77 px against a content edge of 592 px (7.8 px into the padding). At 600 px with `2026-11-12T16:21:00Z` it ended at 604.58 px, past the row edge (600 px), and no button moved into the arrow menu.
- `layoutRow` has the same flaw: it passed `clientWidth` (with padding) to `rowMargins` as the limit. A package at the right end (`pos: {formations: 1}`) at 1440 px ended at 1120.05 px, the row edge being 1112 px and the content edge 1104 px.

## Root cause
Boxes sit inside the padding, but both functions treated the whole row width as free space. The error is the sum of the left and right padding (16 px on row 2).

## Fix
`DockProvider.tsx`: `fitRow` uses `room()` = row width − padding − border for the loop and for the product box deficit. `layoutRow` passes the inner width (client width − padding) to `rowMargins`. The stored position ratio is unchanged (still a fraction of `clientWidth`), so saved layouts keep their place.

## Tests
`e2e/mocked/chart-dock-formation.spec.ts` (@UI-17): content stays inside the content box from 640 px to 560 px (red at 612 px before the fix); a package at the right end stops at the content edge (red before the fix). Neighbour specs `chart-dock`, `chart-dock-lib`, `chart-dock-s4`, `chart-dock-s5`, `chart-header`, `chart-toolbar-groups-lib`: 135 passed.
