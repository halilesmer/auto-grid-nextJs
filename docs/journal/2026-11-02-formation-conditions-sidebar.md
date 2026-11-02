---
date: 2026-11-02
author: Claude
type: feature
status: done
pr: []
features: [FRM-19, FRM-22, FRM-23, FRM-29, FRM-36]
areas: [frontend]
---

# Conditions move into the right side bar on /formasyon

## Request
On `/formasyon` the draggable conditions card (candidates and checklist, `FormationDetailsPanel.tsx`) covered the newest candles. The owner chose variant B of three designs (design canvas, artboards "B zu" and "B offen"): the conditions become a tab in the right side bar next to the favorites. His words: when the side bar opens, the chart page must stretch to the left, so the tab must not cover the chart.

## Solution
| File | Change |
|---|---|
| `src/app/formasyon/page.tsx` | One side bar with two tabs. The strip on the far right has two icons (bookmark, `ListChecks`). From `lg` (1024 px) the open bar always pushes the chart: `formation-main` is 40 + 288 px narrower. Below `lg` the bar covers the chart. `formation-main` has `z-70` from `lg`, so the menus of the top bar (alarm, picture) stay above the bar. |
| `src/hooks/useFormationSidebar.ts` | Open/closed and the tab live in `localStorage` (`grid-robot-formation-sidebar`). First visit: open on "Bedingungen" from `lg`, closed below. A click on the icon of the active tab closes the bar. |
| `src/components/formation/FormationSidebarTabs.tsx`, `FormationConditions.tsx`, `FormationStatusChip.tsx` | New: tab row, tab content, status button in the top bar (direction, verdict, `7/7 · 3/5`, chevron). The button is disabled without a candidate. |
| `src/components/formation/CandidateList.tsx`, `FormationChecklist.tsx` | Candidates are a toggle ("Kauf · gültig"). The checklist has no repeated title, counters with bar, collapsible groups, one line per rule (icon, text, ID and value on the right). The legend is in an (i) tooltip. |
| `src/components/formation/FavoritesSidebar.tsx` | The favorites tab has no own header. The "add product" button moved into the tab row. |
| `FormationToolbar.tsx`, `ChartWorkspace.tsx`, `TrendToggle.tsx` | Container threshold for the chart tools in the top bar: 1240 → 1440 px. `--chart-tools-right` is removed (the bar no longer covers the chart tools). |
| `FormationDetailsPanel.tsx` | Removed, with the keys `formation.details*` and the hints `formation.details.move/toggle`. |

Top bar width (measured, de): the content now ends at 893 px (before 704 px) because of the status button (up to 186 px). 893 + 8 + 516 = 1417 px, so the threshold is 1440 px and the reserve stays 528 px. Result: with the bar open the chart tools always float at the bottom (up to a 1768 px window); with the bar closed they are in the top bar from a 1480 px window.

## Why
- Variant B, because the card covered candles and the owner wanted the chart to stay uncovered. The chart gets narrower instead.
- Feature FRM-24 (move the card) ends with this choice. Its three drag tests were removed, not weakened: there is no card to drag. The remaining FRM-19/20/22/23/29 tests moved to the new place with the same expectations; only the legend checks open the (i) tooltip first.
- Rejected: keep the push threshold at 1280 px. The owner wants the chart to move at every desktop width; below 1024 px a pushed chart would be too small.
- Rejected: a smaller status button. The owner asked for direction, verdict and counters; the wider threshold is the price. At a 1440 px window with the bar closed the chart tools now float at the bottom (before: top bar).
