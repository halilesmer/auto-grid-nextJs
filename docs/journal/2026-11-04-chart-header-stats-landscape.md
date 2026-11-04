---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: []
features: [UI-15, UI-12, UI-14, ANA-01]
areas: [frontend, docs]
---

# Stats header and landscape top bar of /chart

## Request
Open points a to c of "Open points after U3" in `2026-11-01-unified-chart-page.md`. Point d (formation search for a past range) is not part of this step. The owner approved the design on 2026-11-04 ("Onay, 66 px yeter").

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/app/chart/page.tsx` | The Statistics view drops the heading "Analiz" and its subtitle (the heading stays for screen readers only). It shows the same top bar as the chart views (`ChartTopBar`, new prop `flat`): account, mode segment (Setup pressed), setup, range, Chart/Statistics. |
| `frontend_nextjs/src/hooks/useChartMode.ts` | A change to Formation or Free also removes `tab=stats`. Setup keeps it. Before, only Formation removed it, so "Free" in Statistics stayed on Statistics. An old link `?mode=free&tab=stats` now also leaves Statistics on a click of "Free" (the early return no longer skips it). |
| `frontend_nextjs/src/app/globals.css` | New variant `short`: height up to 30 rem and width below lg. |
| `frontend_nextjs/src/components/chart-page/ChartTopBar.tsx` | With `short` the bar is a grid of two rows. Row 1: account, mode, target. Row 2: time frames, range, view, tools and the legend switches. Only the legend (last column) scrolls sideways. Dropdown triggers (`aria-haspopup`) and inputs are capped at 28 px. |
| `frontend_nextjs/src/components/formation/FormationToolbar.tsx` | With `short` the selectors and the time frames share one row, the form row stays below. |
| `frontend_nextjs/src/components/analysis/chart/TimeframeSelect.tsx` | Buttons are 24 px high with `short`. |
| `frontend_nextjs/e2e/mocked/chart-header.spec.ts`, `docs/features/features.yaml` | New feature UI-15, 14 tests. The tests for Statistics, the landscape height, the menus and the old link were red before the change. One assertion changed: `chart-one-page.spec.ts` (UI-14, old Statistics link): `chart-mode-formation` count 0 became `aria-pressed=false` plus `chart-mode-setup` pressed plus `stats-tab` visible. The owner approved this on 2026-11-04. |

## Differences from the approved drawing
In the drawing the range sits in row 1. In the code it sits in row 2, next to the time frames, because the range is in the same DOM group as the view and the tools. Row 1 is then account, mode and target. The legend column is narrow at 812 px (about 70 px) and scrolls; the same switches are in the menu "Layers". The heights match the drawing.

## Measured (812 x 375, mock worker)
Bar height before: Formation about 108 px, Setup 123 px, Free 93 px. After: at most 66 px in all three modes (test limit). The app menu stays visible (64 px).

## Lessons
- A scroll container (`overflow-x: auto`) on the bar clips the dropdowns that sit inside it (account list, symbol search). The review found this. The bar now has no overflow; only the legend scrolls. The test opens the account list at 812 x 375 and checks that its lower edge is on top.
- With `auto` grid columns the legend wrapped and row 2 was 47 px high. The legend now has its own scroll column (`minmax(0,1fr)`) and does not wrap.
- BSD `sed` has no `\+` or `\/` shortcuts that GNU `sed` has. Use Python for multi-line class edits.

## Verification
See the PR.

## Open points
- [ ] d: formation search for a range in the past (owner decision later).
