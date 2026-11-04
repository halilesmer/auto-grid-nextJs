---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: [336]
features: [UI-15, UI-12, UI-14, ANA-01]
areas: [frontend, docs]
---

# Stats header and landscape top bar of /chart

## Request
Open points a to c of "Open points after U3" in `2026-11-01-unified-chart-page.md`. Point d (formation search for a past range) is not part of this step. The owner approved the design on 2026-11-04 ("Onay, 66 px yeter").

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/app/chart/page.tsx` | The Statistics view drops the heading "Analiz" and its subtitle (the heading stays for screen readers only, now named like the menu item: `nav.chart`; the key `analysis.title` is gone, also in `FreeChartPanel` and `ZoneChartPanel`). It shows the same top bar as the chart views (`ChartTopBar`, new prop `flat`): account, mode segment (Setup pressed), setup, range, Chart/Statistics. |
| `frontend_nextjs/src/hooks/useChartMode.ts` | A change to Formation or Free also removes `tab=stats`. Setup keeps it. Before, only Formation removed it, so "Free" in Statistics stayed on Statistics. An old link `?mode=free&tab=stats` now also leaves Statistics on a click of "Free" (the early return no longer skips it). |
| `frontend_nextjs/src/app/globals.css` | New variant `short`: height up to 30 rem and width below lg. |
| `frontend_nextjs/src/components/chart-page/ChartTopBar.tsx` | With `short` the bar is a grid of two rows. Row 1: account, mode, target. Row 2: time frames, range, view, tools and the legend switches. Only the legend (last column) scrolls sideways. Dropdown triggers (`aria-haspopup`) and inputs are capped at 28 px. |
| `frontend_nextjs/src/components/formation/FormationToolbar.tsx` | With `short` the selectors and the time frames share one row, the form row stays below. |
| `frontend_nextjs/src/components/analysis/chart/TimeframeSelect.tsx` | Buttons are 24 px high with `short`. |
| `frontend_nextjs/e2e/mocked/chart-header.spec.ts`, `docs/features/features.yaml` | New feature UI-15, 14 tests. The tests for Statistics, the landscape height, the menus and the old link were red before the change. Two assertions changed (both approved on 2026-11-04). `language.spec.ts:50` (UI-05): the heading of the page without account is now `nav.chart` in English instead of `analysis.title`. The other: `chart-one-page.spec.ts` (UI-14, old Statistics link): `chart-mode-formation` count 0 became `aria-pressed=false` plus `chart-mode-setup` pressed plus `stats-tab` visible. The owner approved this on 2026-11-04. |

## Differences from the approved drawing
In the drawing the range sits in row 1. In the code it sits in row 2, next to the time frames, because the range is in the same DOM group as the view and the tools. Row 1 is then account, mode and target. The legend column is narrow at 812 px (about 70 px) and scrolls; the same switches are in the menu "Layers". The heights match the drawing.

## Measured (812 x 375, mock worker)
Bar height before: Formation about 108 px, Setup 123 px, Free 93 px. After: at most 66 px in all three modes (test limit). The app menu stays visible (64 px).

## Follow-up: Formation with result row (PR for UI-15)
The first test did not see two faults in Formation at 812 x 375, because the mock had no hits and no favorites. With favorites the bar was 70 px high: the favorites time frames were 38 px high (no `short` height) and the result row was 31 px. Also the account select was only 82 px wide and cut the account name. Fix, only with `short:` classes: time frames and result row get `short:` classes in `FormationToolbar` (not in the favorites sidebar): `h-7`, `min-h-[26px]`, one line, scrolls sideways; account select `short:min-w-40` (new prop `className`, set only in Formation). Now the bar is 62 px. Cost: the symbol field is a little narrower at 812 px. New tests use mock accounts and the Gartley fixture with favorites. Lesson: a layout test needs the data that fills every row of the bar.

## Follow-up: time frames in row 2 (design A8.2)
After PR 338 the bar was 62 px high and the account name was complete, but the symbol field was only 42 px wide: "XAUUSD" was not readable. Row 2 held only the result row (about 15 % of its width). The owner approved design A8.2 on 2026-11-04: with `short`, the time frames move to the left end of row 2, in front of the forms.

| File | Change |
|---|---|
| `FormationToolbar.tsx` | With `short` the toolbar root is a grid with three columns (`auto`, `minmax(0,1fr)`, `auto`) and two rows. The top bar and the time frame block are `display: contents`, so each element stays once in the DOM. Row 1: selectors (columns 1 and 2) and the tools (column 3). Row 2: time frames (column 1) and forms (columns 2 and 3, scrolls sideways). The border moves to the root. |
| `FormationToolbar.tsx` (wrapper) | The custom time frames node (favorites) sits in a wrapper that is `contents` and, with `short`, a grid item in row 2 with `h-7`. The component `FavoritesTimeframes` is not changed. |

Known limit (done 2026-11-04, see `2026-11-04-formation-tab-order.md`): the tab order followed the DOM (selectors, time frames, tools, forms), so focus jumped from row 2 back to row 1 at 812 px. It now follows the visual order. The favorites sidebar uses the same `FavoritesTimeframes` component; the grid classes sit in the toolbar wrapper so the sidebar does not change.

Below `short` the layout does not change: `display: contents` is the default of the new tool wrapper, so it adds no box.

Measured (812 x 375, mock worker, 10-digit account name): bar 63 px (34 + 28 + 1 border), same with and without favorites. Symbol field 192 px wide. The account name is complete. The page has no horizontal scroll. The tests were red before the change (time frames in row 1) and green after it.

## Lessons
- A scroll container (`overflow-x: auto`) on the bar clips the dropdowns that sit inside it (account list, symbol search). The review found this. The bar now has no overflow; only the legend scrolls. The test opens the account list at 812 x 375 and checks that its lower edge is on top.
- With `auto` grid columns the legend wrapped and row 2 was 47 px high. The legend now has its own scroll column (`minmax(0,1fr)`) and does not wrap.
- BSD `sed` has no `\+` or `\/` shortcuts that GNU `sed` has. Use Python for multi-line class edits.

## Verification
See PR 336.

## Open points
- [ ] d: formation search for a range in the past (owner decision later).
