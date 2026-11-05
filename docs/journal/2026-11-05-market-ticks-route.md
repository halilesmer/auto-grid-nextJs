---
date: 2026-11-05
author: Claude
type: feature
status: open
pr: []
features: [ANA-23]
areas: [worker, tests]
---

# Read-only tick route for the backtest comparison

## Request
The backtest-vs-live comparison often fails check K2: same trades and net result, but the entry is one M1 candle off. The suspect is the candle spread, which is only a closing snapshot. Ticks must prove this later.

## Solution
| File | Change |
|---|---|
| `worker_python/src/api/market.py` | New admin route `GET /api/market/{id}/ticks?symbol=&from=&to=` |
| `worker_python/src/utils/mt5_market.py` | `collect_ticks` / `ticks` with `copy_ticks_range` (COPY_TICKS_ALL), `data_query=True` |
| `worker_python/tests/fakes/fake_mt5.py` | `copy_ticks_range`, `set_tick_history` |

The window is 2 hours at most per call (400 if longer). More than 200,000 ticks give 413. The reply has `time_msc`, `bid`, `ask`, `flags`.

## Why
Admin only and read only, as the other diagnostic routes. `data_query` keeps a running bot session untouched.

## Verification
API tests in `worker_python/tests/api/test_market_ticks_api.py` (feature ANA-23).

## Open points
- [ ] Test on the VPS after the next worker update (auto-update is off during the test window).
