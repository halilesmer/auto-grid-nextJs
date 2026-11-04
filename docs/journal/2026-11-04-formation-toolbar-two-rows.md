---
date: 2026-11-04
author: Claude
type: fix
status: done
features: [UI-15, UI-14, FRM-23, FRM-37]
areas: [frontend]
---

# Formation top bar: two fixed rows on desktop (A13.7)

## Request
At 1440 x 900 with the favorites sidebar open, the time frames and the tools of the Formation top bar moved to a second line. The bar was then 94 px high (three lines). The owner approved design B on 2026-11-04: a fixed grid with two rows (artifact "Formation-Kopfleiste 1440").

## Cause (measured)
The first guess was `pr-97` (reserve for the tool bar). The guess was only partly right. The e2e measurement (mock worker, bar with a hit and two favorites, widths 1100 to 2300 px, 16 and 20 px font) shows two bands where the bar wraps to three lines:

| Band (width of `formation-main`, 16 px font) | Reason |
|---|---|
| 772 to 916 px (48 to 57 rem), sidebar open | Selectors and tools do not fit in one line. |
| 1156 to about 1400 px (71 to 88 rem) | `pr-97` (388 px reserve) starts at 71 rem. Selectors, time frames, actions and the reserve need about 1400 px. |

Between the bands (972 to 1132 px) the bar is one line, 68 px with the form row. This is why 1440 px with the sidebar (1112 px) looked fine on some screens. A window of 1470 px (a common Mac scale) gives 1142 px and falls in the second band. At 20 px font the bands scale with the font (rem), the bar is 112 px high.

## Solution
| File | Change |
|---|---|
| `globals.css` | New variant `bar2`: the phone landscape rule of `short`, and, from lg, a container `formation-main` from 48 rem to below 91 rem. 91 rem is the highest measured single-line need (88.5 rem at 20 px) plus a margin. |
| `FormationToolbar.tsx` | All `short:` classes are now `bar2:`. The two separators are hidden in the grid (`bar2:hidden`). From 71 rem, row 1 is at least 38 px high and the actions keep a right margin of 24.25 rem for the tool bar (`bar2:@min-[71rem]/formation-main:mr-97`). |
| `FormationView.tsx` | The account select keeps its minimum width in the grid (`bar2:min-w-40`). |
| `chart-header.spec.ts` | New tests: bar at most 70 px at every window width from 1100 to 1900 px, with the sidebar open and closed; at 1440 x 900 the time frames and the forms are in row 2 and the actions in row 1. The old desktop assertion "time frames above the form row" now applies to 375 x 812 only. Red before the change (94 px at 1180 to 1420 px), green after. |
| `formation-page.spec.ts` | FRM-23 and FRM-37 read the bar through `formation-toolbar` (the node `formation-topbar` is `display: contents` in the grid). The 1440 test expects row 1 and the tools in the first 38 px. |

Result (16 px font, measured before the 38 px minimum of row 1 was added): 63 px in the grid, 69 px above 91 rem. From 71 rem, row 1 is 38 px, so the grid is about 67 px there. At 20 px font the bar is 76 px (was 112 px). The e2e test limit is 70 px at 16 px font.

## Changes of behavior to know
- At 1440 px without the sidebar (container 1348 to 1400 px) the bar was one line before. It is now the grid too. The height is about the same, the time frames are in row 2 at the left. The reason: with favorites the single line wrapped at the same width, and one rule for both is simpler.
- The tab order followed the DOM: selectors, time frames (row 2), actions (row 1), forms. Focus jumped from row 2 back to row 1. Done: see `2026-11-04-formation-tab-order.md`.
- Tooltips do not change (`Tooltip` uses the top layer). Phone portrait (375 px) and phone landscape (812 x 375, 63 px) keep their rules: `bar2` has the `short` condition unchanged, and the desktop branch needs a width of at least 64 rem.

## Known limits
- Below 48 rem container (sidebar open, window 1024 to about 1099 px at 16 px font; 1280 to 1369 px at 20 px) the old wrapping stays. Selectors and actions need about 722 px; a grid with fixed rows would clip them there. Not measured. Open point if the owner sees 94 px there.
- The sweep test starts at 1100 px and checks the height at 16 px font with favorites only. It does not see clipping inside the grid.
- The owner saw 94 px at "1440 px". The sweep does not reproduce it at exactly 1112 px (one line). A window of 1470 px (1142 px container) does. The cause of the owner's report is assumed to be the second band, not proven.
- Done (see `2026-11-04-formation-tab-order.md`). Decision for the owner: the tab order jumped between the rows (selectors, row 2 time frames, row 1 actions, row 2 forms). It was a known limit on the phone in landscape. It now applies to desktop windows too. A fix would move the actions in the DOM before the time frames and use `order` in the flex mode.

## Verification
tsc and lint without errors. Playwright (`E2E_PORT=3151`): `chart-header.spec.ts` 24 passed; `chart-one-page`, `chart-topbar`, `chart-workspace`, `chart-page`, `formation-page`, `language`, `tooltips` 205 passed. New tests red before the change (94 px), green after.

## Lessons
- Run `playwright` with an own `E2E_PORT`. `reuseExistingServer` reused the server of a different worktree on port 3100, so the first measurement was not from this build.
- A guess at the cause (the reserve) was only half right. A sweep over the window width found the second band at 48 to 57 rem.
