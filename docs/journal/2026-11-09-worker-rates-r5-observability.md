---
date: 2026-11-09
author: Claude
type: feature
status: open
pr: []
features: [ANA-04]
areas: [worker, tests]
---

# Timing logs and heartbeat for slow `/rates` (1109-R5)

## Request
Step R5 of `2026-11-09-worker-rates-speed.md`. Add measurement only. The worker must not change its behavior. The result must show if the `MetaTrader5` call keeps the GIL.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/worker_obs.py` | New. Logger `grid.obs` (stdout). Heartbeat thread and asyncio task. |
| `worker_python/src/utils/market_sync.py` | Log lines `[rates-timing]` for each `copy_rates_range` call, for the wait of `_FETCH_SLOT`, and for the total time of `get_rates`. |
| `worker_python/main.py` | Start the heartbeat in the startup handler. |
| `tests/unit/test_worker_heartbeat.py`, `tests/api/test_market_db_api.py` | Tests with a fake clock and a captured log. |

Log lines (no account number):
- `[rates-timing] copy_rates_range <symbol> <tf> bars=<n> took=<s>`
- `[rates-timing] fetch_slot <symbol> <tf> wait=<s> got=<bool>`
- `[rates-timing] get_rates <symbol> <tf> bars=<n> total=<s>`
- `[heartbeat] thread late X.Xs` and `[heartbeat] loop late X.Xs`

The thread and the task each tick every 250 ms. They log when a tick is more than 1 s late. Set `WORKER_HEARTBEAT=0` to switch it off. The default is on.

## How to read the result
- Thread late and loop late together: the process holds the GIL. The MT5 call blocks all Python code.
- Only loop late: something blocks the event loop. The GIL is free.
- Neither late, but `/api/system/platform` is slow: the cause is outside Python.

## Verification
- Unit and API tests pass (`ANA-04`).
- Measurement on the VPS: not done yet. See open points.

## Open points
- [ ] Merge the PR. Wait for the VPS update.
- [ ] Request a cold D1 range (5 000 days) on a symbol that the terminal has not loaded. Poll `/api/system/platform` in parallel. Read the `[rates-timing]` and `[heartbeat]` lines.
- [ ] Write the result (GIL: yes or no) in this entry in a second PR.

## Follow-up fix (first VPS run)
The first VPS run wrote no `[rates-timing]` lines. `main.py` imports the routers before `console_tee` replaces `sys.stdout`. The `grid.obs` handler kept the old stream, so `worker_console.log` did not get the lines. The handler now writes to the current `sys.stdout`. A test covers it.
