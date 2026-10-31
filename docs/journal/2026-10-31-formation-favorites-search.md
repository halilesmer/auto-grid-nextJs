---
date: 2026-10-31
author: Claude
type: feature
status: done
pr: [257, PRNR]
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
- A product with missing candles or a failed request is marked, and the other products stay correct. An error keeps the old result and is tried again at the next check (30 s).
- Previous close is the second last D1 candle. At the weekend, the change refers to the last session before the last one.
- The strip and side bar sit outside a wrapper that pushes the chart. The details card and the alerts are in the wrapper, so they stay inside the smaller chart area.

## Checks
- Playwright mocked: 10 tests `@FRM-29` in `formation-page.spec.ts`, 5 in `formation-favorites-lib.spec.ts`. API: 7 tests in `test_quotes_api.py`.
- Visual check of the mocked page at 1280 px and 375 px, side bar open and closed.
- DEMO account on the real worker (v0.7.301), Saturday, 10 favorites. All points passed:
  - The side bar opens and closes. Timeframes and formations exist once, camera and bell stay in the top bar.
  - A timeframe click sends no new candle request (63 API calls before and after). A formation click filters the table. A row click opens product, formation and timeframe.
  - 4 of 4 sampled hits agree with the chart and sit at the right edge. Recency was checked by eye, not against candle times.
  - One run takes about 4 s for 40 candle requests. `data-favorites-scan-ms` shows 2026. The page stays usable (observed, not measured).
  - `quotes` runs every 60 s in 61 to 171 ms and overlapped no candle request. Runs with more than 10 favorites are not measured.
  - No product is incomplete at the weekend. `missing` is empty for all 10.
  - `Zuletzt`, `Änd` and the previous close of 2 products agree with the D1 candles.
- Known limit: a second tab shows results only after the searching tab has sent them. A new tab asks for a snapshot when it opens.
- Review findings fixed in the same PR, each with a test that was red first:
  - The favorites list is loaded again every 10 s after a failed first request. The message shows once.
  - The side bar pushes the chart only from 1280 px. Below, it lies under the top bar, so the chart tools stay free. At 1024 px the tools sat under the side bar before.
  - The "prices failed" note belongs to the account. It vanishes when the account changes.
- `quotes` asks up to 200 symbols under the MT5 lock. If a longer list blocks candle requests, ask in blocks.

## Open points
- [x] After a reload the account selector showed no account although `?account=` was in the address. Cause: `/formasyon` loaded the account list once. When this first request failed (for example the worker restarts or the tunnel is slow), nothing asked again, and the selector kept its placeholder. Shown with the mock worker: the first `GET /accounts` aborts, no second request follows. A plain reload with a working worker did not show the defect (4 reloads checked). Fix: the page asks again every 10 s until accounts exist. Test: `@FRM-29` "Scheitert das erste Laden der Konten". This is the most likely cause of the single DEMO observation; the DEMO case itself was not seen again and not checked on the real worker.
- [x] The worker stayed on v0.7.289 for about 12 h. Another entry holds the cause: [auto-update-stale-window-env](2026-10-31-auto-update-stale-window-env.md).
