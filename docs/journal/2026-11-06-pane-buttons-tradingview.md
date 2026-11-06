---
date: 2026-11-06
author: Claude
type: feature
status: open
pr: []
features: [UI-11]
areas: [frontend]
---

# Pane buttons move to the right edge, TradingView tiles

## Request
The pane buttons (up, down, delete, collapse, maximize) of an oscillator pane move to the far right of the pane header, as on TradingView. The left row (name, values, eye, settings, delete, more) stays where it is. Plan 1106-A3. On 2026-11-06 the owner chose the TradingView tiles for the build; a comment on the design artifact had asked for the left row's style, and the owner decided against it.

## Cause
Not a defect. Measured from the reference screenshot (a WebP, so colours at the edges are blurred; shapes and sizes are reliable):
- tile 34 × 34 px, black fill, 2 px border `#464646`, icon about 16 px
- gap 10 px, group 210 px wide
- tile height equals the height of the left row on the same screenshot (34 px)
- chart background `#2f2f2f`

The first design used 46 px tiles, measured from a smaller screenshot. It was too large against the left row.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/IndicatorLegend.tsx` | Pane buttons are 34 px tiles (`PANE_TILE`), gap 10 px, `ml-auto` at the right of each pane row. A missing arrow leaves an empty 34 px slot so the other tiles do not jump. Collapse uses `ChevronsDownUp` / `ChevronsUpDown`, maximize uses a rounded rectangle (`MaximizeIcon`). The stacks now stretch to the right price scale (`layout.scaleWidth + 10` px); the wrapper covers the chart (`inset-0`). |
| `docs/features/features.yaml` | UI-11 description: the group sits at the right edge, 10 px before the price scale, tiles 34 px as in TradingView. |
| `frontend_nextjs/e2e/mocked/chart-pane-model.spec.ts` | New test `@UI-11`: each group ends in the right part of the chart and its tiles are 34 px high. The order test (`@UI-11 @ANA-20`) is unchanged. |

## Why
- The order of the buttons already matched TradingView, so the order test stays valid.
- Tiles at the same height as the left row keep both rows in one line.
- A right-anchored absolute layer was rejected: the rows sit at different heights per pane, so one layer cannot align with each row. The row stays a flex line that ends with the controls.
- The owner chose TradingView tiles over the left row's style (the artifact comment asked for the left style; the owner then chose "Wie TradingView").

## Verification
- `tsc --noEmit`: passed.
- `eslint` on `IndicatorLegend.tsx`: passed.
- `chart-pane-model.spec.ts` on the changed code: all 6 tests passed, including the new one.
- `chart-layers.spec.ts` on the changed code: 13 of 14 passed. `UI-11 Formation: Legende meldet keine doppelten React-Schlüssel` failed. The same test fails on the unchanged base commit, so it is not caused by this change.
- In the first full UI-11 run, three `chart-layers` tests failed on `analysis-chart` (free and setup modes) and passed in the repeat run. Treated as a timing flake under three parallel workers.
- Not verified: visual match against the screenshot at 375 and 1024 px, and hover behaviour. The mocked e2e checks positions and sizes, not the look.

## Open points
- [ ] Group under about 520 px width: the group (210 px) and the left row (about 280 px) do not fit side by side. Proposal: the group wraps to a second line. Not decided.
- [ ] Colour check against the original screenshot in the app. The reference is a WebP.
- [ ] Left row is 28 px high in the app (24 px buttons plus padding); the tiles are 34 px as measured on the screenshot. Decide whether the row or the tiles should change.
- [ ] Maximized state: light border `#dbdbdb` is a proposal, not in the reference screenshot.
- [ ] `UI-11 Formation` duplicate-key test fails on the base commit. Check it on main.

## Lessons
- Measure proportions against an element in the same screenshot, not against an absolute pixel scale of a different crop.
- Lossy WebP shows colour fringes at edges. Use luminance for edges and bounds, and check colours in the app.
