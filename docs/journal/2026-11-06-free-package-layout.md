---
date: 2026-11-06
author: Claude
type: plan
status: open
pr: [397, 401]
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

- [ ] S5 and S6.
- [ ] Touch drag on a real phone (owner).
