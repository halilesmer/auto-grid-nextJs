---
date: 2026-11-09
author: Claude
type: feature
status: open
pr: []
features: [BKT-23]
areas: [worker, backtest]
---

# Worker endpoint for trigger-minute replay

## Request
Step 1 (PR-A, worker) of plan 1109-K57: the backtest must replay the fill and exit minutes of its own trades with real ticks. The worker must give the ticks of single minutes on request.

## Solution
| File | Change |
|---|---|
| `worker_python/src/api/market.py` | New `GET /market/{id}/replay?symbol&start&m`. Access: `account_access` (all roles, own accounts only; a foreign account gives 404). |
| `worker_python/src/utils/market_sync.py` | `parse_replay_minutes` (delta list, limits), `tick_rows_by_minute`, `get_replay_minutes` (2-hour pieces, one `copy_ticks_range` per piece, shared fetch slot, 40 s budget). |
| `worker_python/src/utils/market_db.py` | `store_replay_minutes`: `INSERT OR IGNORE` into `tick_replay` with kind `T`. The schema does not change. |

## Why
- `m` holds minute differences, not absolute times, so the URL stays short for 2 000 minutes. The first difference is relative to `start`.
- `INSERT OR IGNORE`: the existing S/J rows from BKT-20 must never be replaced.
- Minutes without a tick are stored as an empty `T` row only when they are at least 2 days old. The terminal can still load recent history.
- The endpoint is open to users, not only admins (decision K57.6). Ticks are market data and carry no account data. Limits: 2 000 minutes, 3 days span.

## Open points
- PR-B (frontend): multi-pass run, latency `L`, protocol lines, mock worker. Then the acceptance run.
