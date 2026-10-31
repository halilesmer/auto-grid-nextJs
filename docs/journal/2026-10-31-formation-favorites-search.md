---
date: 2026-10-31
author: Claude
type: feature
status: open
pr: []
features: [FRM-29]
areas: [worker, frontend, tests]
---

# Favorites side bar and search over favorites on the formation page

## Request
- PR B of two (PR A: FRM-28). Show which formations are formed in which favorite products, per timeframe, in a side bar on `/formasyon`, like TradingView.
- Halil approved the design (fifth version) and the plan on 2026-10-31.

## Solution
| File | Change |
|---|---|
| `src/lib/formation/scan.ts` | `isFormed` (verdict `valid`), `formedHits`, `formedSummary`, `timeframeCount`, `favoriteSymbols`. |
| `src/lib/formation/requests.ts` | `HISTORY_DAYS` and the four candle requests, shared by the single search and the favorites search. |
| `src/store/useFavoritesScanStore.ts`, `FormationScanRunner.tsx` | App-wide search in `layout.tsx`. One product after the other, one tab only (Web Lock), results shared with other tabs by `BroadcastChannel`. |
| `src/hooks/useFavorites.ts` | `useFavoritesLoader` loads the list. Only the runner calls it. `useFavorites` only reads and toggles. |
| `FavoritesSidebar.tsx`, `FormationFavoritesBar.tsx`, `FormationToolbar.tsx`, `formasyon/page.tsx` | Strip with the toggle, side bar, timeframe and formation rows. The toolbar takes the two rows as slots. |
| `worker_python/src/api/market.py`, `mt5_market.py` | `GET /market/{id}/quotes`: last price, previous close, digits. Read only, `data_query`. |
| `e2e/fixtures/*` | Mock route `quotes`, `ratesErrorSymbols`, `quotes`. |

## Why
- A formed pattern is `valid`. `forming` counts only in the single view (`countsAsHit` is unchanged).
- The search runs in the layout, so the later alarm can use the same results. A product counts once per formation, also with more than one candidate.
- The worker fetches MT5 candles one after the other (`_FETCH_SLOT`). Thus the runner loads one product at a time and frees the UI between products.
- `useFavorites` reset the store on mount (PR A). With three users (pill, side bar, runner) this would clear a loaded list. Now one loader sets it.
- A product with missing candles or a failed request is marked, and the other products stay correct. An error keeps the old result and is tried again at the next M15 candle or when the favorites change.
- Previous close is the second last D1 candle. At the weekend, the change refers to the last session before the last one.
- The strip and side bar sit outside a wrapper that pushes the chart. The details card and the alerts are in the wrapper, so they stay inside the smaller chart area.

## Checks
- Playwright mocked: 10 tests `@FRM-29` in `formation-page.spec.ts`, 5 in `formation-favorites-lib.spec.ts`. API: 7 tests in `test_quotes_api.py`.
- Visual check of the mocked page at 1280 px and 375 px, side bar open and closed.
- Not verified: the worker route on a real terminal (runs after the VPS pulls and restarts). Open on DEMO: run time with about 10 favorites, formations against the chart, old `valid` patterns without recency, whether weekend gaps make every product incomplete, quotes and previous close.
- Known limit: a second tab shows results only after the searching tab has sent them. A new tab asks for a snapshot when it opens.
