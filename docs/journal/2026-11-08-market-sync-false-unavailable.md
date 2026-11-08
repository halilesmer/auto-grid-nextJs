---
date: 2026-11-08
author: Claude
type: fix
status: done
pr: []
features: [ANA-04, ANA-26]
areas: [worker]
---

# Empty MT5 answer was stored as "unavailable"

## Request
Twice on 2026-11-07 the worker marked a candle range as `unavailable` although MT5 had the data (M1 of March 2026; D1 of 2026-10-30 to 2026-11-06, while H1 existed for the same days). Find the cause and fix it. See `2026-11-07-chart-older-candles.md`, "Lesson: stale `unavailable` mark".

## Cause
Found by reading the code path and reproduced with `FakeMT5`. It was not measured on the VPS.
- `market_sync._fetch_chunk` asked `copy_rates_range` once. In MT5, an empty answer without an error is also what the terminal gives while it still loads or builds the history of a time frame. The code did not tell this apart from "MT5 has no candles".
- `classify` then wrote the state from that one empty answer:
  - range longer than 4 days (`MAX_PAUSE_SEC`), or no candle before it: `unavailable`. The range is not asked again for 24 hours (`UNAVAILABLE_RETRY_SEC`). This is the D1 case (8 days).
  - range of 4 days or shorter with a candle before it: `gap_confirmed`. A confirmed gap is never asked again. This is worse than `unavailable`. It is the same fault; only the length of the range decides.
- The same applies to a leading or trailing hole in a partial answer.
- A wrong mark means a hole in the chart, wrong W1 and MN candles (built from D1, ANA-26) and missing data in a backtest.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/market_sync.py` | An empty answer is asked again up to `EMPTY_RETRIES` (2) times after `symbol_select` and a pause of `EMPTY_RETRY_PAUSE_SEC` (1 s), inside the same request. |
| `worker_python/src/utils/market_sync.py` | `_syncing_holes`: for each range that is not `complete`, one cheap probe (`copy_rates_from`, 1 candle) in the next lower time frame (`LOWER_TF`: D1→H1, H4→H1, H1→M15, M30/M15→M5, M5→M1). If that time frame has a candle in the range, the higher time frame is not loaded yet. The range is not stored (no `unavailable`, no `gap_confirmed`). The answer lists it in `missing` with the reason `syncing`. The next request asks MT5 again. |
| `worker_python/src/utils/market_sync.py` | An answer with a `syncing` range is not kept in the 30-second tail cache. |
| `worker_python/tests/api/test_market_db_api.py` | Three tests (ANA-04): empty then full answer in one request; D1 empty while H1 has candles (`syncing`, then complete without waiting 24 hours); D1 empty and H1 empty stays `unavailable`. The first two were red before the fix. |
| `docs/features/features.yaml` | ANA-04 text names the repeat and the `syncing` reason. |

## Why
- Chosen: repeat on empty answer, and a lower-time-frame check before a mark is written. Both prevent a wrong mark. A short retry time for `unavailable` alone was rejected: the 4-day `gap_confirmed` mark is never retried, and every real hole (before the start of the history) would be asked again every few minutes.
- The probe costs one MT5 call per hole. It reads one candle, whatever the length of the hole (a hole back to 1970 is safe).
- The retry costs about 2 seconds once per real empty range (for example, a page before the start of the history). The result is then stored as before.
- The frontend is not changed. `syncing` shows in the data-quality banner with the existing text for unknown reasons.

## Not covered
- M1 has no lower time frame. A terminal that needs more than the retry time to load M1 can still give a wrong `unavailable` (24-hour retry). It is not a gap, so it recovers.
- A hole in the middle of a returned answer stays inside a `complete` range (`classify` does not check it). It is not part of this fix.
- Not tested on the real terminal. Check on the VPS after the merge: ask D1 for a range that was `unavailable` before, then `GET /api/market/{id}/coverage`.
