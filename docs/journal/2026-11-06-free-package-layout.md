---
date: 2026-11-06
author: Claude
type: plan
status: open
pr: [397, 401, 413, 421, 428, 429, 431, 432]
features: [UI-17, UI-16]
areas: [frontend]
---

# Free package layout on the chart page

## Request

The owner wants every control of `/chart` to be a package. The user places each package freely. Plan 1106-A1 was approved on 2026-11-06 with a design artifact. Step S1 is the data model only. No visible change.

## Decisions

| Code | Decision |
|---|---|
| A1.1 | Nine packages: `mode`, `symbol`, `actions`, `timeframes`, `formations`, `view`, `indicators`, `edit`, `window`. The account and the DEMO mark are not a package. They are a fixed item in row 1 (live or demo is a safety mark). |
| A1.2 | Four places: row 1 (header), row 2, bottom bar, and free on the chart. Old `top` becomes row 1, `bottom` stays, `free` stays with the same ratio. |
| A1.3 | A row has one line. Packages sit from the left with no gap. The row never adds a gap. A package in empty space stays there. Its place is a ratio of the row width. A package snaps to a neighbor or to the right end within 14 px. When the row is full, gaps shrink first. Then buttons that do not fit go into the arrow menu (˅) at the right of the package. The selected formation, timeframe, mode and symbol stay in the row. |
| A1.4 | The three modes (Formation, Setup, Free) share one layout. |
| A1.5 | Below 30 rem the fixed phone layout stays. The stored layout is kept. |

Rules from the owner:

- Between packages a thin vertical line shows. A package in a row has no frame. A package dropped on the chart floats as a card.
- A drop is soft. The package slides to its place. When there is no room, or the user presses Esc, the package returns with an animation. The real app uses `motion` v13 (`layout`, `layoutId`) in S2.
- The shrink order is: formations, timeframes, actions, indicators, view, edit, window, mode, symbol.

## Steps

| Step | Content |
|---|---|
| S1 | Data model: `lib/chart-workspace/dock.ts`, `dockLayout` in the store, migration from `toolbarLayout`, lib tests (@UI-17). No visible change. |
| S2 | Slot infrastructure (`DockProvider`, `DockRow`, `DockPackage`), the four tool groups, the arrow menu, the animation. First task: check that `layoutId` survives a portal. If not, do a manual FLIP. |
| S3 | Formation packages (timeframes, formations). The `bar2` grid becomes two flexible rows. |
| S4 | Mode, symbol and actions packages. Setup and Free. |
| S5 | Phone and landscape phone. |
| S6 | Close: catalog update, journal, DEMO browser check, owner approval. |

Each step has its own session and PR. The worker does not change. No order is sent.

## Solution (S1)

| File | Change |
|---|---|
| `lib/chart-workspace/dock.ts` (new) | Pure functions: `defaultDockLayout`, `parseDockLayout` (repair), `migrateToolbarLayout`, `moveToRow`, `moveToFree`, `packPackage`, `rowMargins`, `dropPosition`, `SHRINK_ORDER` |
| `store/useChartWorkspaceStore.ts` | New field `dockLayout` in the same storage key. Merged across tabs like `toolbarLayout`. Without a stored `dockLayout` the store migrates from `toolbarLayout`. The UI does not read it yet |
| `e2e/mocked/chart-dock-lib.spec.ts` (new) | Lib tests (@UI-17) |
| `docs/features/features.yaml` | New entry UI-17 |

## Solution (S2)

The four tool groups (view, indicators, edit, window) are now real packages.

| Part | Change |
|---|---|
| `components/chart-workspace/dock/DockProvider.tsx` | Page-level provider. It holds the slot registry (row 1, bottom bar, chart), places each package box in the stored order, fits rows, and runs drag, drop, keyboard and the soft animation |
| `dock/DockRow.tsx` | Empty region for one row. Row 1 sits at the end of the header (`FormationToolbar`, `ChartTopBar`). It is hidden when it has no package. While a drag runs, it shows as a drop place |
| `dock/DockPackage.tsx` | Handle (drag, menu), the buttons, and the overflow arrow. The content is a React portal into a box that is created once |
| `dock/DockOverflow.tsx` | Arrow menu (˅). It draws the package content a second time and shows only the buttons that are hidden in the row. So a button in the menu is the same component: same action, same tooltip |
| `dock/DockSurface.tsx` | Replaces `ToolbarDock`. It draws the bottom bar and the free-drop hint, and it measures the phone width (below 30 rem the fixed default layout stays) |
| `lib/chart-workspace/dock.ts` | New `isDefaultDockLayout` |
| Store | New `resetDockLayout`. It clears `dockLayout` and the old `toolbarLayout` together. The UI does not read `toolbarLayout` any more |
| Header | The absolute strip over the header and the 24.25 rem / 26 rem / `pr-97` reserves are removed. In the `bar2` grid the selectors use column 1 only and row 1 of the dock uses column 2 |

### Result of the `layoutId` check

The task was to check first if `layoutId` of `motion` v13 survives a move between two portal targets. I did not run a browser experiment. The `motion` documentation (Context7) says that `layoutId` links two components when one unmounts and the other mounts in the same commit. That is not our case. A package box is never rebuilt: it is created once and the provider moves the DOM node between rows with `insertBefore`. This keeps state, focus and open menus, and the tab order equals the visible order. A moved node gives `layout` and `layoutId` nothing to measure, so the slide uses a manual FLIP (measure, place, close the difference) with the Web Animations API, as in the design draft. `useReducedMotion` of `motion` switches the animation off. CSS transitions have a `prefers-reduced-motion` rule.

### Defaults and rules

- The default place of the four groups is now the bottom bar at all widths (the design draft shows this). Before, they sat in the header from 71 rem. Row 1 is empty by default and hidden.
- Packages keep one line. If the row is full, gaps shrink first (`rowMargins`), then buttons go into the arrow menu in the `SHRINK_ORDER`. Each package keeps its first button and every button with `data-keep`. The fit always starts from the natural width, so a row does not flicker.
- On a phone (container below 30 rem, decision A1.5) the fixed default layout shows: the row wraps, there is no arrow menu, handles are hidden, and the stored layout is kept. The arrow menu is for rows wider than that.
- Free packages stop above the bottom bar (R2-05): the lower limit of the free area is the top of the bar, which is also the lower limit of the chart (`--workspace-card`).
- A package in a row has no frame. A thin line shows between packages (CSS `::before` on the box, 1 px). A package on the chart is a card.
- Drop on empty space stores `pos` (ratio of the row width). Within 14 px of a neighbor, or of the right end, it snaps (`dropPosition`).
- Drop with no room, or Esc: the ghost flies back and the package takes its old place.
- Keyboard on the handle: Left/Right order, Shift+Left/Right shift in the free space, Up/Down row 1 and bottom bar, Esc cancels a drag. The handle menu has row 1, bottom bar, drop on chart, left, right, close the gap, reset. There is no row 2 yet (S3).

### Lessons

- The chart host element gets its `ref` after the layout effects of its children. A child that reads `host.current` in a layout effect gets `null`. Use `useEffect`, and never let a package without a home lose its DOM node (it falls back to the bottom bar).
- The box of a package includes the separator line. Measure positions on the box (`[data-dock-wrap]`), not on the inner group.

## Solution (S3)

- Row 2 is a real `DockRow` (`row2`). `DockPlace`, `DockRowZone` and `DockAction` have `row2`. The handle menu has "Move to row 2". Up and Down walk row 1, row 2 and the bottom bar.
- Row 2 exists only in the Formation header. `DockProvider` knows this with `row2On` (the row registers itself). Without it, packages stored in row 2 are drawn in the bottom bar. The stored layout does not change. Setup and Free have no `timeframes` or `formations` package until S4.
- `timeframes` and `formations` are `DockPackage`. The content is the same buttons, or the favorites views (FRM-29). The selected button carries `data-keep`, so it never goes into the arrow menu. `SHRINK_ORDER` hides formations first, then timeframes. The favorites views are one child each. They cannot split, so the box shrinks (`data-shrink`, CSS `flex: 0 1 auto`) and the view scrolls inside.
- `FormationToolbar` no longer has the `bar2` grid. Row 1: selectors, actions, `DockRow row1`. Row 2: `DockRow row2` (hidden when empty, visible while dragging). Each element is in the DOM once, in the visible order. `useBar2` is gone. `ChartPage` measures the header height, so `--chart-top` follows the height of row 2.
- Phone (container below 30 rem, decision A1.5): the old fixed order stays (timeframes next to actions, the formations strip below). It is rendered without packages when `dock.phone` is true.

## Solution (S4)

- Row 1 is one `DockRow` in all three modes. The default order is `mode`, `symbol`, `account`, `actions`. The account and the DEMO mark are `DockAnchor`: a fixed item with no handle. It is not in the arrow menu and it holds a place in the row order (`registerAccount` in `DockProvider`). Arrow keys and the drop target count it as a neighbor.
- `mode`: `ChartModeSegment` is a package with one button per mode. The selected mode has `data-keep`. `symbol`: the symbol field in Formation and Free, the setup select in Setup. `actions` in Formation: the as-of steps, the picture menu, the alarm menu and the status chip.
- Decision 1106-A4.1: in Setup and Free the `actions` package holds the date range (Zeitraum), the Chart/Statistik tabs and the tool buttons (license note). Zeitraum and Chart/Statistik have `data-keep`. The sentence "formations and actions are not shown in Setup and Free" applies to the Formation action buttons only. A fixed group in row 2 would be a second anchor and would keep row 2 open in Setup and Free.
- Setup and Free have row 2 (`DockRow row2`). The `timeframes` package holds `TimeframeSelect` there. Row 2 is hidden when no package is in it. With the default layout the timeframe select moves from row 1 to row 2 in these modes.
- The Statistik view has no `DockProvider` (flat bar). It keeps the old bar, so the Chart tab stays visible.
- Below 30 rem the old fixed phone layout stays. `FormationToolbar` takes `mode`, `symbol` and `account` props instead of `children`. On the dock path the wrapper `formation-selectors` holds the `DockRow`, so the tests that measure row 1 use the same id.
- Decision 1106-A4.2: at 812 x 375 the row is 796 px wide. The content is 960 px: mode 190, product 221, account 156, date range 222, Chart/Statistik 171. The shrink order is followed: the mode package keeps only the selected button and the arrow. The test `812 × 375 … höchstens 66 px` now checks: height at most 66 px, the selected mode is visible, the arrow menu holds exactly the other two modes in order, and a click on `formation` changes the URL. The Formation branch is unchanged.

- Decision 1106-A4.3: row 1 must not wrap and must not change height with width. Measured row 1 height at 1440 px and at 720 px: Formation 38 and 38, Setup 46 and 46, Free 46 and 46. The 46 px in Setup and Free comes from the Chart/Statistik tabs (36 px) and the date range button (32 px), not from wrapping. The old limit of 40 px was a wrong guess. The test `(h)` checks `h720 toBe h1440` for each mode.
- Decision 1106-A4.4: at 812 x 375 the legend of Setup stays in the same line as row 2 (fixed tail, scrolls sideways), as the old grid did. Row 1 (31 px) and row 2 with the legend (33 px) keep the bar under 66 px. The package box test uses `toBeLessThanOrEqual` (a box can only get shorter when long buttons go into the arrow menu; inner wrapping would make it longer).

- Decision 1106-A4.10 to A4.15: in Setup and Free the date range and the Chart/Statistik tabs lose `data-keep`. They go into the arrow menu in this order: tools, Chart/Statistik, date range last. The date range shows no dates below 75 rem container width (label stays). The mode package shrinks only after that. The product box is `w-44` in all three modes. Chart/Statistik tabs are 28 px high (`h-7`) from 30 rem up, also in the Statistik view, so row 1 is 38 px in every mode and width. Measured at 1024 px: the tabs need 213 px, 5 px too many (row 961 px, available 956 px), so they sit in the arrow menu (Halil, 2026-11-06, "A4.15.1 menu"). At 1176 px the tabs stay in the row (free space about 100 px).
- Root cause 1106-A4.16.2: a closing dropdown panel kept taking pointer events for the 320 ms exit animation and covered the list below it. Fix: `MenuPanel` in `dropdown-menu.tsx` sets `pointer-events-none` as soon as the panel is not present (`useIsPresent`). Measured: `elementFromPoint` does not return the panel from 0 ms after Escape; focus returns to the trigger.
- Root cause 1106-A4.16.1: the title bar overlaps the chart and Setup/Free now have a second title row. The ANA-17 drag started inside the title bar. The test now starts below the bar and checks the start point with `elementFromPoint`.

- Root cause 1106-A4.11 / A4.17.1: in Setup the setup select (`ZoneSelect`, `sm:w-56 sm:flex-none`, 224 px) was wider than its product box (176 px) and covered the account anchor, including the DEMO mark. Fix: in the docked title bar the select fills the product box (long names end with an ellipsis). In Formation the account anchor had extra padding and its content was 4 px wider than the box; the padding is gone. The new boundary test checks every visible child of every row 1 box (five widths, three modes) and that nothing covers the left edge of the account anchor. It failed in 5 of 5 widths before the fix.

### Changed tests

| Test | Old | New | Why |
|---|---|---|---|
| `chart-header` 812 × 375 Setup / Free | `chart-mode-formation` visible | selected mode visible, arrow menu = other two modes (`toEqual`), click switches to Formation | A4.2: row is 796 px, content 960 px |
| `chart-header` "Querformat-Leiste" | `display: grid` on the bar | height at most 66 px (short), not grid (other sizes) | the dock bar has no grid |
| `chart-dock-formation` default | row 1 hidden | row 1 order `['mode','symbol','account','actions']` | row 1 holds the new items |
| `chart-dock-formation` "Frei: no row 2" | row 2 packages fall to the bottom bar | row 2 exists in Free | S4 gives Setup and Free a row 2 |
| `chart-dock` keyboard | Up from bottom goes to row 1 | Up goes to row 2, then row 1 | row 2 exists in Setup and Free |
| `chart-toolbar-groups` default | row 1 hidden | row 1 order `toEqual` | as above |
| `chart-toolbar-groups` keyboard | 2 x Down reaches "drop on chart" | 3 x Down | the handle menu has "row 2" in Free |

## Solution (S5)

Phone (portrait, container below 30 rem) and landscape phone. The fixed phone layout of S2 to S4 stays. This step measures it, closes four defects and adds the tests (`chart-dock-s5.spec.ts`, @UI-17, phone tests also @UI-08).

### Measurement (before any change)

Sizes: 375 x 812, 280 x 640, 667 x 375, 740 x 360, 812 x 375, 844 x 390, 932 x 430. Modes: Formation, Setup, Free. At every size there was no horizontal scroll and the account anchor was free. At 667 x 375 and above the bar is at most 66 px high. No defect showed in these numbers. The defects below came from the new tests.

### Defects found and fixes

| Defect | Cause | Fix |
|---|---|---|
| Date range panel is 490 px high and goes below the window at every landscape size (bottom at 592 px, window 360 to 430 px) | The panel has a fixed height. Nothing limits it to the free space | `DropdownMenu` has a new opt-in prop `fitHeight`. The panel gets `max-height` = free space and scrolls inside. Only `DateRangePicker` sets it. A first version for all menus broke the layers menu tests (UI-13, UI-14), so it is opt-in |
| Row 1 is 1.7 px too wide at 667 x 375 Formation | The fit loop measured with `offsetWidth` and `clientWidth` (whole numbers). Then, with every package at its smallest, the sum was still larger than the row | Fractional measure (`getBoundingClientRect`). Then plan decision 1106-A5.3: the product box is the last shrink step |
| The handle touch area is 16 x 24 px | The handle is `w-4` | On a coarse pointer a pseudo-element makes the area 24 x 24 px (8 px to the left, not over a neighbor). The visible size is the same |
| Free mode: product field wider than a narrowed product box | `sm:w-44` without a maximum | `sm:max-w-full` |

### Smallest widths at 667 x 375 Formation (plan 1106-A5.1.1)

Row 1 inner width 611.00 px. Packages already at their smallest (selected button plus arrow): mode 127.69, product 205 (box 176 plus handle and line), account anchor 185, actions 89 (one button plus arrow). Sum 606.69 px plus 3 gaps of 2 px = 612.69 px. The overflow is 1.69 px. The shrink order is correct. The sum of the smallest widths is larger than the row. The account anchor is not a package and does not change. Decision 1106-A5.3: the fit code lowers the width of the product box by the deficit, with a floor of 144 px (`w-36`). At 667 x 375 the box is then 174.31 px. When the row gets wider, the box is 176 px again.

### Touch (CDP `Input.dispatchTouchEvent`, 812 x 375)

A tap on a handle opens the handle menu and does not start a drag. A move below 10 px does not start a drag. A drag moves the package and the place stays after a reload. During the drag the page does not scroll, the viewport scale stays 1, and no touch or pointer event reaches the chart. The handle has `touch-action: none`.

### Clearance of the touch area

The touch rectangle of every handle (default layout) does not cross an interactive element of another package, and does not cross an element of its own package. Smallest free space to the nearest left neighbor, in px:

| Mode | 667 x 375 | 740 x 360 | 812 x 375 |
|---|---|---|---|
| Formation | 5 | 5 | 5 |
| Setup | 7 | 5 | 7 |
| Free | 7 | 7 | 5 |

### Lessons

- A test must read the box that really scrolls. The first date range test measured the inner content (490 px), not the outer panel.
- A shared component change (menu height) must be opt-in. The full e2e run found two menus that it broke.
- `offsetWidth` rounds. Use `getBoundingClientRect` when a sum of boxes is compared to a row.

## Solution (S6, closing)

S6 changes no behavior. It closes the catalog, the journal and the browser check.

### Steps and pull requests

| Step | PR | Content |
|---|---|---|
| S1 | 397 | Data model `dock.ts`, migration from `toolbarLayout` |
| S2 | 401 | Slots, arrow menu, soft drop (FLIP), tool groups as packages |
| S3 | 413 | Row 2, time frame and formation packages |
| S4 | 421 | Mode, product, account anchor and actions; Setup and Free |
| S5 | 428 | Phone and landscape phone, touch area, last shrink step of the product box |
| S6 | this PR | Catalog (UI-16, UI-17), journal, browser check on the DEMO account |

### Lessons

- Measure widths with fractions (`getBoundingClientRect`). `offsetWidth` rounds, and a sum of boxes that is 1.7 px too wide still overflows the row.
- A change to a shared component must be opt-in. `DropdownMenu` got `fitHeight` for the date range only. The first version for all menus broke the layers menu tests.
- A timeout under load is not a red test. Run the test again alone before you change code. Change code only when the test fails alone (the FRM-47 flake is such a case and is still open).
- Touch tests need CDP (`Input.dispatchTouchEvent`). Mouse events in Playwright do not set `pointerType: touch`, so the drag threshold and `touch-action` are not tested.

### Open points

- Done 2026-11-07: the owner tested on a real phone. Result: passed.
- The owner may still object to the compact date range (no dates below 75 rem).
- Done 2026-11-07: UI-17 is signed as passed (`manual_results.yaml`).

### Dead code removed

After S6, no application code called some parts of the old UI-16 zone model. They are removed. No behavior changes.

- `toolbar.ts`: `isAutoLayout`, `moveGroup`, `placementZone` and the `ToolbarZone` type. Only a unit test used them. `GroupPlacement` stays, because `ToolbarLayout` uses it.
- `useChartWorkspaceStore.ts`: `setToolbarLayout`. Nothing called it.
- `workspace.ts`: the key `cw.tbAnchor` (tr, en, de). Nothing used it.
- The first test in `chart-toolbar-groups-lib.spec.ts` and the `moveGroup` lines of the second test tested only the removed code.
- Kept: the `toolbarLayout` field, `parseToolbarLayout`, `placeFree`, `toRatio`, `nudgeStep`, `TOOLBAR_GROUPS` and the `cw.tbGroup.*` keys (they are still used).

## Defect 1106-A5.16 (phone mode only measured with a chart)

### Symptom

At 375 x 812 on `/chart` (Free mode) the header showed the package layout while the candles loaded: four handles, and the account anchor from x 304 to 444 in a 375 px window. The DEMO mark was not visible. When the candles arrived, the layout changed to the phone layout.

### Root cause

`dock.phone` was measured only in `DockSurface`. `DockSurface` exists only while `ChartWorkspace` is mounted. Without a chart (loading, error) `DockProvider` kept its start value "wide". The mocked e2e worker returns candles at once, so no test saw it.

### Fix

`DockProvider` measures the phone mode itself. A layout effect (keyed on the row and chart registration) finds the `formation-main` container from the first registered row, or from the chart surface, measures it and observes it with a `ResizeObserver`. Row 1 is in the header, so it exists without a chart. The layout effect runs before the first paint. The second measurement in `DockSurface` and `setPhone` in the dock API are removed: there is one source.

### Test

`chart-dock-s5.spec.ts`, @UI-17 @UI-08: at 375 x 812 in Formation, Setup and Free, the candle request is held, then released, and answered with 500 in a second run. With no chart: 0 handles, no arrow menu, no horizontal scroll, the account selector is inside the window and not covered. A frame counter shows that no frame drew a handle. A mode switch Formation, Free, Setup, Formation by the mode buttons is checked the same way. Before the fix 7 of these tests failed (5 handles, expected 0). After the fix all pass.

### Notes

- Server rendering: the packages and the account anchor are React portals into boxes that exist only in the browser (`DockAnchor` draws nothing on the server). Read from the code, not measured: the server HTML has no handles.
- The account selector in the phone layout has no `dock-account` test id (only the anchor in the package layout has it). The test uses the combobox.

## Risks

- The header gap was tuned at many window widths (UI-14, UI-15, FRM-23, FRM-38). The groups move into the row. These measures change. Do not relax tests. Each PR says what changed and why.
- The tool group buttons depend on the state of `ChartWorkspace`. With a portal the state and open menus must stay. Each row draws its slots in the stored order, so the tab order equals the visible order.
- The height of row 2 changes the top reserve of the chart. `ChartPage` measures it. Check at 1176, 1304, 1520 and 1820 px in S3.
- The arrow menu measures again at each resize. Measure the natural button width and reserve the arrow place first. Otherwise a button fits and does not fit in turn, and the row flickers.
- A package that changes row is rebuilt by React in a portal. `layoutId` must stay the same. S2 verifies this first.
- Rule UI-07: each button has a tooltip. A button in the menu keeps its tooltip.
- Touch drag on a real phone is not verified (open point of UI-16). S5 tests it.

## Verification

- S1: `npx tsc --noEmit`, `npm run lint`, lib tests `chart-dock-lib.spec.ts`.

## Open points

- [x] S6 (this section).
- [x] Touch drag on a real phone (owner, 2026-11-07, passed). UI-17 signed.
