---
date: 2026-11-02
author: Claude
type: feature
status: done
pr: []
features: [FRM-19, FRM-22, FRM-23, FRM-29, FRM-37]
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
| `FormationToolbar.tsx`, `ChartWorkspace.tsx`, `TrendToggle.tsx` | Container threshold A for the chart tools in the top bar: 1240 → 1300 px. `--chart-tools-right` is removed (the bar no longer covers the chart tools). |
| `FormationDetailsPanel.tsx` | Removed, with the keys `formation.details*` and the hints `formation.details.move/toggle`. |

Top bar width (measured 2026-11-02, de, longest text). The status button has two forms, set by the width of `formation-main`:
- Compact (below 1440 px): arrow, verdict as an icon with its own shape (✓ valid, ✗ invalid, clock forming) and chevron. The content of the top bar ends at 767 px. Side, verdict and counters are in the `aria-label` and in the hint.
- Full (from 1440 px): verdict pill and counters `7/7 · 3/5`. The content ends at 893 px (button up to 186 px).
- Threshold A = 1300 px (chart tools in the top bar, in `FormationToolbar`, `ChartWorkspace`, `TrendToggle`): 767 + 8 + 516 = 1291 px. Reserve stays 528 px (767 + 528 = 1295).
- Threshold B = 1440 px (full button, only in `FormationStatusChip`): 893 + 8 + 516 = 1417 px.
- Result: with the bar closed, the tools are in the top bar from a 1340 px window (before this change: 1280 px); with the bar open they float at the bottom up to a 1628 px window.

## Why
- Variant B, because the card covered candles and the owner wanted the chart to stay uncovered. The chart gets narrower instead.
- Feature FRM-24 (move the card) ends with this choice. Its three drag tests were removed, not weakened: there is no card to drag. The remaining FRM-19/20/22/23/29 tests moved to the new place with the same expectations; only the legend checks open the (i) tooltip first.
- Rejected: keep the push threshold at 1280 px. The owner wants the chart to move at every desktop width; below 1024 px a pushed chart would be too small.
- First version had one wide button and threshold 1440 px: at a 1440 px window the chart tools floated at the bottom. The owner decided "compact button": icons below B, pill and counters from B. The window range 1280–1339 px (bar closed) still has floating tools (before: top bar from 1280 px).
- FRM-37, not FRM-36: FRM-36 is reserved for the divergence line (journal `2026-11-02-formation-wave-pane.md`).
