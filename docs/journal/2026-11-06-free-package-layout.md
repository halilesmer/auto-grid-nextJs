---
date: 2026-11-06
author: Claude
type: plan
status: open
pr: []
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

- [ ] S2 to S6.
- [ ] Touch drag on a real phone (owner).
