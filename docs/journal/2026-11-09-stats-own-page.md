---
date: 2026-11-09
author: Claude
type: feature
status: done
pr: [478]
features: [UI-23, UI-22, UI-15]
areas: [frontend]
---

# Statistics move to their own page

## Request
The project owner asked to remove the "Chart | Statistics" tabs from the top bar of `/chart` and to put "Statistics" into the main menu (plan 1109-A2, approved 2026-11-09).

## Solution
Statistics are now the page `/stats`. The menu item "Statistics" stands between "Chart" and "Backtest".

| File | Change |
|---|---|
| `frontend_nextjs/src/app/stats/page.tsx` | New page: flat top bar (account, setup, range) and `StatsTab`. |
| `frontend_nextjs/src/app/chart/page.tsx` | Only the chart. No tabs, no statistics branch. |
| `frontend_nextjs/src/hooks/useChartContext.ts` | New hook: shared state of `/chart` and `/stats` (account, zones, broker clock, range). |
| `frontend_nextjs/src/lib/chart/chartUrl.ts`, `useChartParams.ts` | `tab` is not in the URL model. Read ignores it, an old `tab=` leaves the address at once. |
| `frontend_nextjs/src/components/chart-page/ChartTopBar.tsx` | The `view` slot is removed. |
| `frontend_nextjs/next.config.ts` | Redirect `/chart?…&tab=stats` to `/stats` (the query stays). |
| `frontend_nextjs/src/components/layout/AppNav.tsx`, i18n | Menu item `nav.stats` with hint. Unused `analysis.tab.*` keys removed. |
| `AppNav.tsx`, `ToolsNav.tsx`, `news/NewsButton.tsx` | From lg to xl: menu links 10 px side padding (was 12 px), the news button shows only its icon. |

## Why
- A separate route keeps `/chart` a pure chart workspace. The statistics page has a normal page layout (sticky menu, no floating menu offset).
- The route name is English like the other routes (`/chart`, `/backtest`).
- A redirect in `next.config.ts` keeps old bookmarks and alarm links working, as for `/formasyon`.
- When the user changes pages through the menu, the account stays (store). The range goes back to the default "All". The menu links carry no query.

## Verification
See the PR: tsc, lint, the changed e2e specs and `precheck.sh`.

## Lessons
- The width of the news button changes with the clock (countdown text such as "USD 19 h 45 min"). A layout measurement at one time of day is not a worst case. At 1024 px the admin menu overlapped in tr/de only when the countdown was long.
- A `has` query redirect passes the query on, also the matched key. Remove such keys in the URL model, else they stay in the address when the page writes nothing.
