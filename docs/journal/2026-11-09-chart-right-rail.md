---
date: 2026-11-09
author: Claude
type: feature
status: done
pr: []
features: [UI-22, FRM-37, UI-10]
areas: [frontend, tests, docs]
---

# Chart: right rail replaces the floating card

## Request
Halil removed the floating card from the chart design (canvas board 2, `M5.dc.html`) on 2026-11-09 and drew a vertical rail with two buttons right of the chart. His words: "Bu kartı buradan kaldır, eski yerine getir. Sağ taraftaki yerine gelsin. Orada favoriler de vardı; sağ tarafta iki buton vardı: biri bu kart, biri favoriler." And: "tam bunu tekrar gerçekleştir; şu an sayfada bu eksik." The design is Halil's own and counts as approved.

## Solution
From 1024 px (Tailwind `lg`) the card lives in a rail and a side panel, like the side bar before PR 460. Below 1024 px nothing changes: the floating card with four tabs and the button "Card".

| File | Change |
|---|---|
| `components/chart-page/ChartSideRail.tsx` (new) | The 40 px rail (`chart-rail`) with two buttons: "Card" (`chart-rail-card`) and "Favorites" (`chart-rail-favorites`). The 288 px panel (`chart-panel`) next to it. Card panel: tabs Conditions, Overview, Trades (`chart-card-tab-<id>`). Favorites panel: header with the add button, then the list. |
| `components/chart-page/OneChart.tsx` | `useMediaQuery('(min-width: 1024px)')`: from lg the rail is the `panel` of `ChartPage` and the floating card is not rendered; below lg the reverse. The button "Card" opens the card tab that was open last. The tab contents are shared by both shells. |
| `components/chart-page/ChartPage.tsx` | The chart area ends at `right-10` (rail) and, with an open panel, at `lg:right-82` (rail + panel). The old branch `lg:right-80` for the floating card is gone. |
| `components/chart-page/FloatingCard.tsx` | Phone and tablet only. The lg rules (`lg:left-full`, `--card-right`, price scale measuring of A21.21) are removed. |
| i18n, `hints.ts` | `chart.rail.card`, `chart.rail.favorites`, `chart.rail.label`, `chart.rail.card.hint`, `chart.rail.favorites.hint` (tr, en, de). |
| `e2e/fixtures/card.ts` (new) | `cardRoot(page)` and `openCardTab(page, id)` work with the panel (from lg) and the floating card (below). |

## Why
- The store `useFormationSidebar` keeps one `open` flag and one `tab`. "Favorites" is the tab `favorites`, so the two buttons need no new state. The button "Card" toggles the last card tab.
- The panel pushes the chart aside and never covers it. This is the behavior of the side bar before PR 460 (FRM-37). A21.18 did the same with a 320 px card; A21.21 measured the price scale because the closed card header stood over it. With the rail outside the chart area, neither is needed.
- Rejected: keep the floating card and add the rail. Halil asked to remove the card.

## Test changes
The strict rules stay: the panel does not cover the chart, and the price scale is not covered. Changed assertions (old, then new):

| Test | Old | New |
|---|---|---|
| `chart-one-chart` "Es gibt eine Karte mit vier Reitern" | one `chart-floating-card`, four tabs visible | no floating card, rail with exactly 2 buttons, 3 tabs in `chart-panel`, no tab Favorites, the button Favorites opens its own panel |
| `chart-one-chart` A21.21 "zugeklappte Karte überdeckt die Preisachse nicht" (3 widths) | `card.x + card.width - scale.x <= 0` | 6 cases (3 widths, panel open and closed, long prices): chart area right edge <= panel (open) or rail (closed) left edge; price scale right edge <= chart area right edge; panel right edge <= rail left edge; rail right edge = window edge; no horizontal overflow |
| `chart-one-chart` "Auf H4 …" | `chart-floating-card` contains EURUSD | `chart-panel` contains EURUSD (the panel shows the setup title) |
| `chart-one-chart` "Jeder Reiter zeigt seinen Inhalt" | click tab Favorites | click `chart-rail-favorites` |
| `formation-page` FRM-37 width (3 widths) | chart `width - 320`, card 320 wide, closed chart `width`, closed chart +320 | `width - 328`, panel 288 wide, rail 40 wide, closed chart `width - 40`, closed chart +288; panel left >= chart right, rail left >= panel right |
| `formation-page` FRM-37 20 px font | card right <= 1440 | rail right <= 1440 and panel right <= rail left |
| `formation-page` FRM-37 tabs, status button, reload, arrow keys | tab Favorites and the collapse button of the card | `chart-rail-favorites`, `chart-rail-card`; the arrow keys move between Conditions and Overview |
| `formation-page` FRM-37 status button thresholds | viewport 1260 and 1264 px | viewport 1300 and 1304 px (same chart area of 1260 and 1264 px with the 40 px rail) |
| `formation-page` FRM-23 | top bar width 1388; chart width 728 at 1100 px; card beside the chart | 1348; 720; panel beside the chart |
| `chart-one-page` UI-14 (2 cases) | card right edge = window edge | panel right edge = rail left edge, rail right edge = window edge |
| `chart-page` UI-10 (4 cases) | card height from the floating card; collapse button | 0 when no floating card exists (it reserves no height from lg); rail button closes the panel |
| 12 more specs | `chart-floating-card` | `cardRoot(page)` / `openCardTab()` (`e2e/fixtures/card.ts`): panel from lg, floating card below |

New: `chart-one-chart` "Ab lg gibt es eine rechte Leiste …" and "Der Knopf „Karte“ öffnet den zuletzt gewählten Kartenreiter wieder".
