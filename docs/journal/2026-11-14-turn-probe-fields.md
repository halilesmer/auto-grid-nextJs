---
date: 2026-11-14
author: Claude
type: decision
status: open
pr: []
features: [ENG-35, BKT-30]
areas: [worker, frontend]
---

# Turn telemetry gets snap, nsl and z0

## Request
The NFP window diagnosis says 87 % of the remaining backtest difference is "class B". Two explanations compete: (1) the live bot reads the price once at turn start and applies SLTP only to positions it saw at turn start; (2) each zone reads positions and orders fresh. The P8 window must separate them (decision 1114-K56.2). The turn log needs three more measurements. Bot behavior must not change. No extra MT5 call.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/turn_log.py` | `TurnProbe` (`probe`) holds `snap_ms`, `z0_ms`, `nsl` for the running turn. Rows have 7 fields: `start,dur,kind,pre,snap,nsl,z0`. `read_turns` reads 4 or 7 fields; missing = `None`. |
| `worker_python/src/core/loop.py` | `probe.begin()` at turn start (resets all). The `t` row carries the three values. |
| `worker_python/src/core/grid_orchestrator.py` | `probe.mark_snap()` after the price read, `probe.mark_z0()` before the zone loop. |
| `worker_python/src/core/grid_orders.py` | `modify_position_tp_sl` and `modify_pending_order` (the only SLTP/modify gate) call `probe.count_sltp()`. |
| `worker_python/src/api/bot_control.py` | `GET /api/bot/{id}/turns` also returns `snap`, `nsl`, `z0` (ms; null for old rows and for kinds other than `t`). |
| `frontend_nextjs/src/lib/backtest/turnSchedule.ts` | `TelemetryTurns` and `decodeTurns` carry the fields as optional. The backtest does not use them. |

## Why
- `snap` = turn start to end of the price read, `z0` = turn start to start of the zone loop. Both are read from `time.perf_counter()`, so they cost no MT5 call.
- `nsl` counts requests sent to the gate, not confirmed ones. The count shows how much SLTP work a turn does.
- Rejected: a separate telemetry file (a second reader and a second prune for 3 numbers); changing the engine to remove the effect (comes after P8, as its own plan).

## Open
- Read the fields in the P8 window (from 2026-11-15 21:00 UTC) and decide between explanation (1) and (2).
