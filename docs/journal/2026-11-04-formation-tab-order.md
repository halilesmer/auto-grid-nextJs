---
date: 2026-11-04
author: Claude
type: fix
status: done
features: [UI-15]
areas: [frontend]
---

# Formation top bar: tab order follows the visual order (A19.2)

## Request
In the two-row grid (`bar2`: phone landscape, and desktop below 91 rem container) the time frames stand in row 2 but were in the DOM before the actions of row 1. Tab went from row 2 back to row 1. The owner approved the fix. No visible change is intended.

## Cause
The visual order differs by layout. Grid: row 1 selectors, actions; row 2 time frames, forms. One line (portrait, and from 91 rem): selectors, time frames, actions, forms. One DOM order cannot match both. CSS `order` and `tabindex` above 0 were not used: `order` does not change the tab order, a positive `tabindex` breaks the page order.

## Solution
`FormationToolbar.tsx`: the hook `useBar2` measures the container `formation-main` and the window (same condition as the variant `bar2` in `globals.css`, with a `ResizeObserver`). In the grid, the actions come before the time frames in the DOM. In all other layouts the old order stays. The grid places each element explicitly, so the picture does not change. Before the first measurement (server render) the old order applies.

## Verification
New e2e tests (`chart-header.spec.ts`, @UI-15): the focusable elements of the bar are in order (row, then x) at 812 x 375, 1440 x 900 (sidebar open and closed), 375 x 812 and 1700 x 900. Red before the change at 812 x 375 and both 1440 x 900 cases (3 failed), green after. `chart-header`, `chart-topbar`, `formation-page`, `chart-one-page` and `tooltips` specs: 227 passed, unchanged.

## Known limits
- The order changes after hydration, when the measurement runs. Both blocks have fixed React keys, so React moves the nodes and does not rebuild them: state and open menus stay. The browser can still drop the focus of a node that moves. This happens only when the layout changes (for example the sidebar toggles between 1496 and 1783 px window width).
- The favorites sidebar and the other modes (Setup, Free) are not changed.
