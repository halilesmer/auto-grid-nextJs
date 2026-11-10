---
date: 2026-11-10
author: Claude
type: fix
status: open
pr: [492]
features: [ANA-04]
areas: [worker]
---

# MT5 history reads move to reader processes

## Request
After PR 489 (1109-R1, R1.1, R3) the VPS check of `2026-11-09-worker-rates-speed.md` failed. Find the root cause of the freeze and remove the freeze from the API process. Plan code 1110-A2.

## Cause
Measurement on the VPS (worker v0.7.533, DEMO account, read-only):
- Cold D1 request from 1990 on a symbol that the terminal did not load: the first reply took 45.6 s (one symbol) and 91 s (another symbol). It had 0 candles, `partial: budget` and a `next_from` in 1990. The target was about 8 s. The second request returned the full history in 6.5 s.
- Worker log: `copy_rates_range … D1 bars=1 took=82.09s`, at the same time `[heartbeat] thread late 82.1s` and `loop late 84.3s`. `GET /api/system/platform` waited 74 to 89 s. One of the parallel requests for a warm H4 chart got `missing: busy`.

Root cause:
- **The `MetaTrader5` C extension keeps the Python GIL during the call.** Proof: the heartbeat thread only waits on `stop.wait(1)` and does no other work. It was late by 82 s. A Python thread can be that late only if it cannot get the GIL. So the 1109-R5 question is closed.
- **The budget cannot stop one call.** `FETCH_BUDGET_SEC` is checked only between two chunks. The first chunk (1990) made the terminal load the history of the symbol. That took 82 s in one call. The cost occurs one time for each symbol.
- **`busy` has the same cause.** The warm H4 request needed more than the newest chunk, so it waited for `_FETCH_SLOT` (30 s). The 82 s call held the slot.
- **Not measured:** if a short and new range on a cold symbol is fast. The fix does not depend on this.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/mt5_reader.py` (new) | Two lanes of reader subprocesses (`python -m src.utils.mt5_reader`), started when first needed: `long` (2 readers) and `fast` (1 reader, for the newest chunk of a warm chart). Each reader connects back to the API process on localhost with a random key per start and makes its own MT5 connection (data query mode). The API process waits with `conn.poll(timeout)`, which releases the GIL. When the time is over: `ReaderTimeout`. The job continues in the reader (the terminal gets warm). If the same job comes again, the pool selects that reader and returns the late result, so a chunk that is longer than the budget does not start again on each request. A job longer than 300 s without a reply kills the reader (the process tree, because on Windows the venv `python.exe` is a launcher), and the next call starts a new one. A start that fails is not tried again for 10 s. The output of a reader goes to `logs/mt5-reader-<lane>-<n>.log`. Without `MetaTrader5` (Mac, tests) the job runs in-process. `MT5_READER=inline\|process` forces a mode. |
| `worker_python/src/utils/market_sync.py` | Candle chunks (`_fetch_chunk`), tick pieces and replay-minute pieces go through `mt5_reader.run()`. Each candle chunk waits at most the rest of the 8 s budget. If the first chunk times out, the reply has `missing` with reason `syncing` for the range, `partial: budget`, and `next_from` is never equal to `from` (the chart stops on this and the backtest loader fails on it). Nothing is stored or cached. A timeout after the first chunk works like before (`next_from`). The first chunk waits at least 2 s, also when the wait for `_FETCH_SLOT` used the budget. `_FETCH_SLOT` allows 2 long fetches at the same time. The fast lane also runs in a reader (its probes of a lower time frame can load a cold history), and only when coverage before the missing newest chunk is in the database. A short first access of a cold symbol goes to the long lane. Each fetch checks the account again at its end: if the shared terminal changed to a different account during a long call, the result is not stored. |
| `worker_python/tests/unit/test_mt5_reader.py`, `tests/fakes/reader_jobs.py` | Real child processes: result and error transfer, timeout with a free GIL, the second reader is free while the first one is busy, kill after the hard limit. |
| `worker_python/tests/api/test_market_db_api.py` | First chunk timeout gives `syncing` without storage. A later timeout gives `next_from`. A cold short request does not take the fast lane. The busy test now holds all slots. |
| `worker_python/tests/conftest.py` | Tests use `MT5_READER=inline` (the fake broker is in the test process). |
| `frontend_nextjs/src/components/analysis/DataQualityBanner.tsx`, `src/i18n/messages/analysis.ts` | The reason `syncing` has a text (tr/en/de). Before, it showed "unknown reason". |

## Why
- A thread, a smaller chunk or a budget cannot stop a C call that keeps the GIL. Only a different process can do this.
- One reader per account was rejected: it is more processes for no gain. MT5 connects per terminal, and the reader reconnects for each job with the existing data query rules.
- Warm-up with a short new range first (instead of a process) was rejected as the only fix: it was not measured, and if the terminal loads the full history anyway, the freeze stays.
- The `_MT5_LOCK` is a lock in one process. It does not order MT5 calls between the readers, the API process and the bots. Bots and the API process already connect in parallel to the same terminal, so this is not new. The account check at the end of each fetch prevents wrong data in the database.
- Trade-off: when two cold symbols keep both long readers busy (up to 300 s), other long requests get `syncing` and not candles. A warm chart is not affected, because it uses the fast lane.
- Deals, quotes and the time check stay in the API process. Deals do not load chart history. Quotes (`copy_rates_from_pos` D1) and the time check (M1, 7 days) can also freeze on a cold symbol. This is an open point.

## Measure on the VPS
1. Cold D1 on a symbol that the terminal did not load: the first reply comes in about 8 s, with `syncing` and `partial: budget`. A reload after the terminal finished returns the history.
2. During that fetch, `GET /api/system/platform` answers in 2 s or less. `logs/worker_console.log` shows no `[heartbeat] … late` line above about 2 s, and it shows `[mt5-reader] … timeout after … (job keeps running)`. The `[rates-timing] copy_rates_range` lines are now in `logs/mt5-reader-*.log`.
3. A warm H4 or M5 chart during a cold D1 fetch: no `busy`.
4. Check that the `python -m src.utils.mt5_reader` processes (at most 3) do not stay after a worker restart (they stop when the API process closes the connection, at the latest when their current MT5 call ends).

## Result on the VPS (v0.7.534)
Same test as before: a cold D1 request from 1990 on a symbol that was not in the database, and in parallel 6 platform requests and 6 warm EURUSD H4 requests, 3 s apart.
- Cold D1: first reply in 8.6 s, 0 candles, `syncing`, `partial: budget`. A reload after the terminal finished returned 5371 candles in 6.9 s. Measurement 1 passed.
- Platform: 0.6 to 0.85 s during the cold fetch. Measurement 2 passed.
- Warm H4: no `busy`, the candles came from the database. But each request took 8.0 s (before the fix: 0.7 to 1.2 s). Measurement 3 passed only partly.
- Worker log: `mt5-reader-fast-1 rates_chunk timeout after 7.3s (job keeps running)`, then `mt5-reader-fast-1 late job done after 87.0s`. After the cold load, H4 took 0.06 s.

Cause (plan code 1110-A3):
- **The terminal puts the calls of all processes in a queue.** The newest chunk of the warm chart needs 0.00 s, but in the fast reader it waited 87 s behind the cold D1 load of the long reader. The reader processes remove the GIL problem, but not the queue in the terminal.
- **The fast lane waited the full budget twice.** The first chunk waited the rest of the 8 s budget. Each next request waited the full budget in `Reader._drain()` for the job that was still running.

Fix (1110-A3):
- `market_sync.py`: the fast lane waits at most `FAST_WAIT_SEC` (2 s) for its chunk.
- `mt5_reader.py`: `run(..., lane="fast")` does not wait for an earlier job that is still running (`wait_busy=False`). It raises `ReaderTimeout` at once, so the reply comes from the database with `syncing` for the newest chunk.
- Tests: `test_schnellspur_wartet_nicht_auf_den_alten_job` (real child process), and `test_kalter_kurzer_erstzugriff_nimmt_nicht_den_schnellweg` checks the fast lane wait.
- Trade-off: during a cold load, the newest candle of a warm chart can be up to one refresh old. Before, the chart waited 8 s for the same data.

Measure on the VPS after the fix: during a cold D1 fetch, the first warm H4 request takes 2 s or less, and the next ones take less than 1 s.

## Open points
- The measurements above (project owner).
- Quotes and time check on a cold symbol (see Why).
- Frontend: the chart does not ask a `syncing` range again by itself. The 60 s refresh only loads the newest chunk. After a cold first open, the user must open the chart again (1109-R2 can fix this).
