---
date: 2026-11-09
author: Claude
type: diagnosis
status: partly-done
pr: [475, 477, 489]
features: [ANA-04, UI-22]
areas: [worker]
---

# Slow `/rates`: a cold D1 fetch freezes the worker

## Request
Open point of `2026-11-09-chart-u4-6-live-check.md`: on the DEMO account the H4 candles took 18 to 40 s and M5 and W1 did not load. Measure `GET /api/market/{id}/rates`, find the cause, write down fixes. Diagnosis only: no worker code was changed.

## Result
- **Cause (measured, 5 repeats):** a candle range that the terminal has not loaded yet is read with one blocking MT5 call (`copy_rates_range`). On D1 this costs about 7 ms per candle, so the usual 5 000-day window takes 18 to 35 s. While the call runs, **the whole worker process stands still**: even `/api/system/platform` (no MT5, no database) does not answer. Every other candle request waits for the one fetch slot and gives up after 30 s with the reason `busy` and **no candles**.
- **Not proven:** why the process stands still. The most likely reason is that the `MetaTrader5` C extension keeps the Python GIL during the call. The fix list below has a measurement that settles it (1109-R5).
- **Not reproduced:** the exact H4 time of 18 to 40 s. H4 alone was fast (see table C). The likely cause is that the page asks D1, H4, H1 and M15 together and H4 waited behind a cold D1 (the worker log shows these four requests in one second). Not checked on a cold symbol with the real page.

## Method
Read-only, DEMO account, built-in browser at `localhost:3000`. A small script in the page read the connection from the page store and called the worker with the same header as the app (the key was not printed). Windows are like the app uses: end of the broker day, 5 000 candles back. At the start the worker had been running for 110 s (v0.7.512) and 2 of 4 bots ran, among them the bot of the DEMO account (its metrics came from the bot process). No call failed with a MT5 or account error, so the `data_query` rule (no login on a terminal with a running bot) did not hurt. Other clients (another tab of the same Mac) asked candles for other symbols during the tests, so single numbers carry noise. The 30 s results repeated 5 times.

## Measurements
Times are the full browser round trip (no ngrok-free delay seen: `GET /api/accounts` takes 57 ms). Reply fields: `next_from` was `null` in every row, `live_from` was set, `missing` is named when not empty. Coverage and database: `coverage` takes 100 to 1 100 ms (SQLite, 233 MB, limit 10 GB).

**A. Data in the terminal and the database (USOUSD)**

| Call | First | Repeat | Candles |
|---|---|---|---|
| H4, 5 000 bars | 0.87 s (3 000 candles were new) | 0.12 s | 3 531 |
| M5, 5 000 bars | 0.32 s | 0.11 s | 3 047 |
| D1, 5 000 bars | 0.22 s | 0.10 s | 3 485 |

**B. Data the terminal has not loaded (other symbols, first request)**

| Call | Time | Candles | `missing` |
|---|---|---|---|
| M5 (17 days): EURCHF, GBPUSD, GER40 | 0.38 / 0.36 / 0.25 s | about 3 000 | none |
| H4, 5 000 bars: EURCHF | 4.5 s | 2 507 | `syncing` 245 days |
| D1, 5 000 bars: GER40 | 22.5 s | 3 475 | none |
| D1, 5 000 bars: NDX100 | 18.3 s | 2 166 | `unavailable` (before the history) |
| D1, 5 000 bars: USDJPY | 30.3 s | 3 550 | none |
| D1, 5 000 bars: GBPUSD | 30.2 s | 3 550 | none |
| D1, 5 000 bars: EURJPY (first in a queue) | 31.5 s | 3 550 | none |

**C. Cost grows with the number of D1 candles (USDCHF, one request after the other)**

| Call | Time | Candles |
|---|---|---|
| D1, last 300 days | 1.9 s | 213 |
| D1, 1 200 days before | 5.7 s | 849 |
| D1, 2 000 days before (rest of the history) | 0.9 s | 16, then `unavailable` |
| H4, last 1 000 bars | 1.5 s | 711 |
| H4, 4 000 bars before | 1.5 s | 2 836 |

D1 costs 6 to 9 ms per candle. M5 and H4 did not show this cost (the terminal may build them from lower time frames; not measured).

**D. The worker stands still during a cold D1 fetch**

| While this runs | Probe | Result |
|---|---|---|
| D1 USDJPY (30.3 s) | `GET …/time-check` (MT5) from second 2.5 | 200 after 27 s; `coverage` straight after: 2.4 s |
| D1 GBPUSD (30.2 s) | `GET /api/system/platform` at second 0.1 | 63 ms (before the MT5 call began) |
| same | `GET /api/news/events` (file read) at second 0.2 | 200 after 29 s |
| 3 cold D1 requests | `GET /api/system/platform` | 13 s |

The time-check did not fail with the 15 s lock timeout of `_connected`. So the wait was not on the MT5 lock: the request was not served at all. Live metrics over the WebSocket and the bot watchdog thread live in the same process, so they stop too.

**E. A queue of candle requests**

| Case | Result |
|---|---|
| D1 NDX100 (18.3 s) at second 0, then M5 NDX100 (second 1.5), H4 GBPUSD (2.0), M5 USOUSD (2.5; 0.1 s when alone) | M5 NDX100 17.0 s, H4 GBPUSD 17.8 s, M5 USOUSD 16.0 s: all end 0.2 to 1.6 s after the D1 |
| Three cold D1 at once (EURJPY, GBPJPY, AUDJPY) and M5 USOUSD | 31.5 s, 66.7 s, **65.8 s with `busy` for 5 000 days and 0 candles**, M5 30.1 s |

The third D1 request is the "did not load at all" case: no error, status 200, empty arrays, `missing: busy`. The answer came after 65.8 s and not after 30 s because the process stood still and the 30 s timer ran late.

## Code path (`worker_python/`)
1. `api/market.py` `rates`: `asyncio.to_thread(market_sync.get_rates, …)`.
2. `market_sync.get_rates`: the 30 s tail cache (key = source, symbol, time frame, window) answers only a repeat of the same window.
3. `_get_rates` (`market_sync.py:485`): `db.plan_rates` (SQLite) gives the missing ranges. If there are some, the request takes `_FETCH_SLOT` (a semaphore of 1 for the whole worker, `FETCH_WAIT_SEC = 30`, lines 77 and 497). **A request that only needs the live candle at the right edge also needs the slot**, because the newest range is never stored.
4. The missing ranges are cut by `CHUNK_BARS = 44 640` candles (`market_sync.py:33`, made for one month of M1). A D1 window of 5 000 days is **one** chunk, so the slot is held for the whole fetch.
5. `_fetch_chunk` (line 143) → `mt5_market._connected`: `_MT5_LOCK`, `connect_to_mt5_with_timeout(data_query=True)` (no login when the terminal is already on the account), then `copy_rates_range` for the whole chunk. An empty answer is asked up to 2 more times with 1 s pause (`EMPTY_RETRIES`). Then `copy_rates_from_pos`, `copy_rates_from`, and for holes one probe per hole (`_syncing_holes`).
6. After the fetch: `classify`, `db.store_rates`, `db.read_rates`; the answer has at most `MAX_BARS = 50 000` candles.
7. A request that does not get the slot in 30 s adds `{"reason": "busy"}` for all ranges and still returns 200 (line 498). The frontend has no timeout (`axiosInstance`), so it waits as long as the worker needs, then shows the gap.

Why the old checks did not find this: `2026-11-08-market-sync-false-unavailable.md` and the chunk size look at correctness of the marks, not at how long one MT5 call blocks.

## Causes ranked
1. **Long blocking MT5 call on a cold time frame (measured).** D1 cold: 18 to 35 s for 2 000 to 3 500 candles, proportional to the candle count. Settled by tables B and C.
2. **The call stops the whole process (measured, reason likely the GIL).** Table D. To settle: R5 (a heartbeat thread that logs the delay of the event loop, or `py-spy dump` on the VPS during a cold D1 fetch; if the main thread waits in `copy_rates_range` and all other threads wait for the GIL, it is the GIL).
3. **One fetch slot with a 30 s limit (measured).** Table E: every later request waits for the whole fetch and then gives `busy` with no candles.
4. Cost per call of the connection and database is small (A: 0.1 to 0.4 s). No sign of an account switch cost: the terminal was already on the DEMO account.

## Fix proposals
| Code | Proposal | Effect | Risk |
|---|---|---|---|
| 1109-R1 | Cut cold fetches by time cost, not by `CHUNK_BARS`: per time frame a chunk of about 2 s (D1 about 250 candles, others as measured). Release `_FETCH_SLOT` and `_MT5_LOCK` between the chunks and sleep 50 ms so the GIL is free. | The freeze drops from 30 s to about 2 s at a time. Other requests run between the chunks. The total time of a cold D1 stays 18 to 35 s. | More MT5 round trips. Chunk list and `store_rates` must keep the `complete`/`gap_confirmed` marks right at the chunk borders (the existing tests of ANA-04 cover `classify`). |
| 1109-R1.1 | Return partial results: a request that cannot finish in a budget (for example 8 s) returns the chunks it has, `next_from` for the rest, reason `budget` (the tick spread code already does this). | The page shows candles at once and loads the rest. | The frontend must treat `next_from` of a non-clipped window as "continue"; check `useMarketRates`. |
| 1109-R2 | Frontend: ask D1 with a small first window (for example 500 days), then older pages in the background. W1 and MN need whole weeks and months at the edge only. Open the visible time frame first; formation layers (D1, H4, H1, M15) after it, one after the other. | The first paint does not wait for 13 years of D1. | The formation layer needs enough D1 candles for its search; define the minimum. |
| 1109-R3 | A separate fast lane for the live candle: a request whose database ranges are complete except the newest one does not take `_FETCH_SLOT` for a long fetch (own short slot or the tail cache by symbol and time frame). | A warm chart (0.1 s when alone) no longer waits 16 to 30 s behind a cold fetch. | Two readers on the terminal at once: keep `_MT5_LOCK` for the call itself. |
| 1109-R4 | Warm-up after the start of the worker: low priority, small chunks (R1), D1 and H4 history of the symbols in the zones of each account. | The first open of a symbol is warm. | Load on the terminal of a running bot: only when no `is_account_busy`, with a pause between chunks. |
| 1109-R5 | Observability: log the time of `copy_rates_range` and of the whole request per time frame (`market_sync`), and a heartbeat thread that logs when the event loop is late by more than 1 s. | Settles the GIL question and shows the real H4 case. | Small. |
| 1109-R6 | Longer term: run MT5 reads in their own process (like the bots). | The API never stands still. | Large change; the `data_query` rules and the shared terminal must move with it. Decide after R1 to R5. |

Recommended order: R5 first (cheap, settles the open question), then R1 with R1.1 and R3. R2 is a separate frontend step.

## Side finding (not part of this task)
`GET /api/history/{id}/deals?from=-11163744000` answers 422 (the worker accepts `from >= 0`). The chart sends a negative `from` when the window is "All" with D1 (seen in the worker log). Same kind of fault as the older-page fix in `2026-11-07-chart-older-candles.md`.

## What was changed on the live worker
Nothing but data: the cold fetches filled the market database with D1 (and some H4/M5) candles of the zone symbols and a few more symbols. No settings, no orders, no bot start or stop. The next cold test needs a symbol that the terminal has not loaded; the symbols listed above are warm now.

## Result of the fix work (2026-11-10)
- **R5** was already in `main` (PR 475, 477): `[rates-timing]` lines in `worker_console.log` and the `[heartbeat]` thread and loop task. Nothing new was added.
- **R1, R1.1, R3** (this change, `market_sync.py`):
  - A chunk now has a size per time frame (`CHUNK_BARS_BY_TF`: D1 250, H4 2000, H1 8000, M30 15 000, M15 20 000; M5 and M1 keep `CHUNK_BARS`). Only D1 is measured; the others are estimates.
  - `_FETCH_SLOT` is taken and released for each chunk. Between two chunks the request sleeps 50 ms (was 0.5 s).
  - After `FETCH_BUDGET_SEC` (8 s) the request stops and returns what it has. `next_from` points at the first chunk that was not fetched, and the reply has `"partial": "budget"`. There is **no** `missing` entry for the rest: the frontend (`loadAll`, `loadRates`) loops on `next_from` and adds the `missing` lists of all pages, so such an entry would draw a gap that the next page then fills. No frontend change was needed. A partial reply is not put in the tail cache.
  - A request whose only missing range is one small range at the newest edge (not more than one chunk) does not take `_FETCH_SLOT` (R3). `_MT5_LOCK` still serializes the MT5 call itself.
  - `classify` is unchanged and runs on each chunk as before, so `complete` and `gap_confirmed` stay right at chunk borders (new test with 45-candle chunks over a weekend).
- Tests: five new tests in `tests/api/test_market_db_api.py` (ANA-04).
- **Measure on the VPS:** (1) cold D1 on a symbol the terminal has not loaded: first reply in about 8 s with `partial: budget`, the full load takes about the same total time as before; (2) `GET /api/system/platform` during that fetch should answer within about 2 s (`[heartbeat] thread late` lines in `logs/worker_console.log` should show about 2 s at most); (3) H4/M5 of a warm symbol while a cold D1 runs: no `busy`.
- Still open: R2 (frontend small first window), R4, R6.

## VPS check after PR 489 (2026-11-10)
The check failed: one cold D1 call froze the process for 82 s, and the heartbeat thread was late by the same time. So the GIL is held during the call (1109-R5 is closed). R6 is done in a smaller form: see `2026-11-10-worker-mt5-reader-process.md` (1110-A2).
