---
date: 2026-11-05
author: Claude
type: feature
status: open
pr: []
features: [UI-16, UI-08, UI-07, UI-14]
areas: [frontend]
---

# Movable toolbar groups on the chart page

## Request

Step S6 of plan 1105-A5 (owner, 2026-11-05; decisions A5.8 to A5.8.4 in `2026-11-05-formation-follows-trend.md`). The toolbar of `/chart` becomes four groups. The user moves each group to the top strip, the bottom strip or a free position on the chart. Keyboard and touch must work without drag.

## Solution

| File | Change |
|---|---|
| `lib/chart-workspace/toolbar.ts` | Pure layout logic: `TOOLBAR_GROUPS`, `ToolbarLayout`, `parseToolbarLayout`, `moveGroup`, `placementZone` (auto zone), `placeFree` (ratio to pixels, clamp, `null` when the group does not fit), `toRatio`, `nudgeStep` |
| `store/useChartWorkspaceStore.ts` | New field `toolbarLayout` (one layout per browser, for all charts), saved in the existing key `grid-robot-chart-workspaces-v1`, merged across tabs like `toolbar` |
| `components/chart-workspace/ToolbarDock.tsx` (new) | Renders the top strip, the bottom strip and the free groups. Handle = `DropdownMenu` trigger with pointer drag. Drag ghost shows the group name and the target. Arrow keys move a free group |
| `components/chart-workspace/ChartWorkspace.tsx` | The toolbar region gives the buttons to `ToolbarDock` as four groups. The `--workspace-card` reserve follows the bottom strip; with no bottom strip the reserve is `0px` |
| `components/chart-workspace/SettingsDialog.tsx` | Button "Araç çubuğunu sıfırla" in the footer (only on `/chart`). It acts at once, not on "Apply" |
| `components/chart-page/LayersMenu.tsx` | Below a 30rem container, "Layers" shows only the icon (design A5.8, 375 px). The name stays as `aria-label` |
| `components/formation/FormationToolbar.tsx`, `chart-page/ChartTopBar.tsx` | The header reserve for the toolbar is now 30.5rem (Formation, was 26rem) and 29rem (Setup, Free, was 24.25rem) |
| `i18n/messages/workspace.ts` | `cw.tbGroup.*`, `cw.tbHandle`, `cw.tbMove*`, `cw.tbReset`, `cw.tbDrop*` and their hints (tr/en/de) |

Rules of the layout:

- A group without a stored place is "auto". The auto zone is the top strip when the container `formation-main` is 71rem or wider, else the bottom strip. This is the same as before S6.
- The two strips have fixed positions in CSS (container query). JavaScript measures the container width only to decide which strip the auto groups go into.
- The element with `data-testid="workspace-toolbar"` is the strip of the auto zone. Older tests that measure this element thus measure the same box as before.
- A free group stores `x` and `y` as ratios (0 to 1) of the chart container. The drawing pushes the group inside the chart: 60 px from the left (drawing bar), 5rem from the right (price axis, same as the bottom strip), 8 px from the top and the bottom.
- When a free group does not fit, it shows in the bottom strip. The stored place does not change. When the window becomes wide again, the group goes back to its free place.
- The free group size is measured only while the group is free (`w-max`, no wrap). Thus the decision "fits / does not fit" does not oscillate.
- At `lg` and wider the page header lies on the chart (`ChartPage`, `--chart-top`). Below a 71rem container the top strip and the free area start below the header.
- Menus in a group (Layers, Trend settings, the handle menu) open by the place of the group, not by the window width: up in the bottom strip and in the lower half of the chart (`data-menu="up"` on the group, `group-data-[menu=up]/tb:` in `LayersMenu` and `TrendToggle`).
- A bottom strip in a wide container floats over the chart. The chart does not become smaller there (as before for the card at narrow widths only).
- The drag ghost is a portal into `document.body`. `formation-main` is a container (`container-type`), and a fixed element inside it is positioned relative to the container.
- A drop into the strip where the group already is does not store anything. Thus an "auto" group stays "auto".
- Touch drag starts after 10 px (mouse 5 px), so a tap with a small movement opens the menu.
- "Place on chart" from the menu puts the groups at different heights (12 % steps), so two free groups do not cover each other.

## Why

| Alternative | Reason for rejection |
|---|---|
| Keep one card and switch it with CSS only (as before) | A DOM node cannot move between two strips with CSS. The auto groups must enter the top or the bottom strip |
| Store the free position in pixels | The position is wrong after a resize or on another screen (A5.8.2) |
| Write the fallback to the store when a free group does not fit (as the design mock) | The group then stays in the bottom strip after the window is wide again |
| `motion` drag | Pointer events are sufficient. No new code path for touch is necessary (`touch-action: none` on the handle) |
| Order inside a strip by drop position | Not in the decisions. The strips use the fixed group order. Can come later |

The handle uses the existing `DropdownMenu` (buttons, arrow keys, Escape returns focus). A drag sets a flag that stops the click after the pointer-up, so the menu does not open after a drag.

## Verification

- `npx tsc --noEmit`, `npm run lint`: no errors.
- Lib tests `e2e/mocked/chart-toolbar-groups-lib.spec.ts` (@UI-16): auto zone, ratio, clamp, fallback, parse.
- E2E `e2e/mocked/chart-toolbar-groups.spec.ts` (@UI-16): drag to the bottom strip and reload; keyboard only (menu, arrow keys, focus back on the handle); reset in the settings dialog and in the menu; fallback at 280 px and return at 1440 px; 375 px without horizontal scroll (@UI-08).
- Browser pane, dev server against the worker, DEMO account, read only: mouse drag into the chart and to the bottom strip; Enter and arrow keys in the menu; reload keeps the place; 1600, 800, 375 and 280 px; light and dark. Measured toolbar width in the header: 476 px (Formation), 450 px (Setup).
- Review by the `reviewer` agent: 1 critical, 6 should, 4 optional findings. Fixed: menu direction by group place, header offset at `lg`, ghost portal, stuck click suppression, stacked free groups, `aria-haspopup` without menu role, lost pointer capture, arrow keys with Alt/Ctrl/Meta, store object identity. Not fixed: handle target size and the hydration flash (see open points).
- Not verified: drag with a real touch screen. The handle has `touch-action: none` and uses pointer events; the menu path works without drag.

## Open points

- [ ] Touch drag on a real phone (owner).
- [ ] The handle is 16 × 24 px. WCAG 2.5.8 asks for 24 × 24 px. A wider handle makes the toolbar 32 px wider; the header reserve must then grow again.
- [ ] The store loads in a passive effect. After a reload, moved groups show for one frame in the auto place.

## Lessons

A child component's `useLayoutEffect` runs before the parent's `ref` is attached. Do not read `parentRef.current` in a child layout effect on mount. Use an own anchor element and its `parentElement`.

When the toolbar becomes wider, measure it in all modes and change the header reserve (`FormationToolbar.tsx`, `ChartTopBar.tsx`). UI-14 checks that no header control is under the toolbar.
