---
date: 2026-11-18
author: Claude
type: change
status: open
pr: []
features: [FRM-19]
areas: [frontend, formation]
---

# Checklist row hint opens to the left

## Request
The hint "Kural: {id}" of a checklist row opened below the row and covered the text of the next row. Design approved by Halil on 2026-11-18: the hint opens to the left, outside the panel, over the chart. No row may be covered.

## Change
- `Tooltip` (`ui/tooltip.tsx`) has a new `side="left"`: the hint sits left of the anchor, centered vertically, clamped to the viewport. If there is no room on the left (narrow view), it falls back to the bottom position as before. `top` and `bottom` are unchanged.
- `FormationChecklist.tsx`: the row tooltip uses `side="left"`. The mark hints (veto, assumption, secondary source, not applicable) keep their direction. Row width and value alignment are unchanged.
- Test `e2e/mocked/formation-page.spec.ts` (@FRM-19), 1440 px, hover and keyboard focus: the hint box (a) touches no row box, (b) ends at or before the left edge of the row, (c) lies inside the viewport.

## Evidence
Screenshots (mocked data, 1440 px, hover on GAR-03; light theme forced through `localStorage`, `html` class checked): ![light](images/2026-11-18-checklist-tooltip-left-light.png) ![dark](images/2026-11-18-checklist-tooltip-left-dark.png)

Observation: the hint is readable in both themes. It covers the price-axis column of the chart at the height of the row, so it can hide an axis label at that height. In the screenshot it sits between two labels and hides none.

## Open
- Phone width (375 px) is not designed (Halil, 2026-11-17); there the hint falls back to the bottom.
