---
date: 2026-11-14
author: Claude
type: decision
status: open
pr: []
features: [ENG-35, BKT-31]
areas: [worker]
---

# Turn telemetry gets nsl0

## Request
Plan 1114-M1 (decision M1.3). `nsl` counts every TP/SL modify of the turn, also those of the zone loop (fractal stops, SAR trail). To measure the SLTP load of the turn head alone, the turn log needs the count at the start of the zone loop. Bot behavior must not change. No extra MT5 call.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/turn_log.py` | `TurnProbe.nsl0` is set by `mark_z0()` to the current `nsl`. Rows have 8 fields: `start,dur,kind,pre,snap,nsl,z0,nsl0`. `read_turns` reads 4, 7 or 8 fields; missing = `None`. |
| `worker_python/src/core/loop.py` | The `t` row carries `probe.nsl0`. |
| `worker_python/src/api/bot_control.py` | `GET /api/bot/{id}/turns` also returns `nsl0`. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | Mock returns `nsl0`. |

## Why
- `z0 - snap` is about `a + nsl0 * c` when the SLTP load dominates. With `nsl` the fit is wrong in turns with fractal zones.
- Frontend decode comes with the next PR (BKT-31 PR-1), so one PR owns `turnSchedule.ts`.

## Open
- Read `nsl0` in the P8 window together with `snap` and `z0` (table H1-H6 in the plan).
