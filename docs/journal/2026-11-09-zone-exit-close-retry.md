---
date: 2026-11-09
author: Claude
type: fix
status: open
pr: []
features: [ENG-10]
areas: [worker]
---

# Zone exit: rejected position close is retried

## Request
The user asked for a search for critical program errors. The search read the order path of the engine and the access layer of the API.

## Cause
At a zone exit with scope "Tüm İşlemler", `handle_zone_exit` sent a market order for each position and did not read the result. If MT5 refused one close (requote 10004, market closed 10018, wrong filling mode), the position stayed open. The log said "kapatıldı" for it. The zone went to AUTO_CLEAR, and the engine did not try again unless the price entered the zone and left it again.
A temporary test with the fake broker showed it: one refused `order_check`, six more engine rounds, the position was still open.

## Solution
| File | Change |
|---|---|
| `worker_python/src/core/grid_order_manager.py` | `_close_zone_positions` returns closed and failed counts. A failed close goes into `state.exit_close_pending`. `retry_exit_closes` tries again. |
| `worker_python/src/core/grid_orchestrator.py` | Calls `retry_exit_closes` in each round. |
| `worker_python/src/core/state.py` | New field `exit_close_pending` (zone magic → target side, next try). |
| `worker_python/tests/unit/test_eng_zone_exit.py` | Two tests: the retry closes the position; a restarted zone drops the retry. |

The retry waits 10 s, or 60 s after retcode 10018. It stops when the positions are closed, when the zone is deleted, or when the zone is no longer AUTO_CLEAR (the user restarted it).

## Why
The retry is keyed by zone magic and does not depend on the price. The user selected "close all at exit" as a protection; the exit occurred, thus the close must complete also when the price comes back. Alternative rejected: keep the zone "entered" and let the exit check run again. That retries only while the price is outside the zone and writes the exit log in each round.

## Open points
- The pending retry is in memory only. A bot restart drops it (a restart also deletes the ui_state file, so the zone starts again).
- Not tested on the VPS. A real refusal is hard to cause on DEMO.
- Found in the same search, not fixed: `POST /api/ui-state` writes the ui_state file without an atomic replace while the bot writes the same file; `process_partial_fills_and_tpsl` matches "processed" levels by side and price only, not by zone magic.
