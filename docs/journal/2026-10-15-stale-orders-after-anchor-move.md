---
date: 2026-10-15
author: Claude
type: fix
status: open
pr: [173]
features: [ENG-06, ENG-17, ENG-18, ZON-13]
areas: [worker, tests]
---

# Old orders stay after the grid anchor moves (fixed)

## Request
The DEMO check of ZON-13 ran with a position-anchored setup (`step_by_loss`, `instant_entry`). Some pending orders were not 0.00100 apart. Find the cause. The project owner then asked for the fix.

## Cause
| Item | Value |
|---|---|
| Observation (DEMO, EURUSD, 0.10 lot, grid 10 $, TP 5 $) | Last position 1.12161. Nearest BUY LIMIT 1.12099 (0.00062 below). Other orders 0.00016 to 0.00038 off the grid of the last position. |
| Anchor | `levels._anchor` puts the grid on the last opened position of the side. After a TP and a new entry, the anchor moves. |
| Cleanup | `validation.validate_and_cleanup` keeps an order when it is within 0.4 × grid step of an acceptable level. The order is not moved. |
| Placement | `placement.py` counts an old order within 0.45 × grid step as an occupied level. Thus the engine does not place a new order next to it. Only 1.12262 is new in the reproduction. |
| Result | An order of the old anchor stays when it is at most 0.00040 from a level of the new grid. It then fills before one full step. The previous position is then at about −6.2 $, not −10 $. |

## Solution
| File | Change |
|---|---|
| `worker_python/src/core/grid_execution/levels.py`, `validation.py`, `grid_order_manager.py` | New `level_tolerance`. Validation and the partial-fill top-up use the same value. In position-anchored mode (`step_by_loss` or `instant_entry`), the level tolerance is `min(0.4 × step, max(0.05 × step, point))`. The levels are exact multiples of the step from the last position, so the wide margin only keeps stale orders. The fixed grid keeps 0.4 × step. |
| `frontend_nextjs/src/lib/backtest/engine/validation.ts`, `orderManager.ts` | Same rule (`levelTolerance`), as `hooks/RULES.md` §4.7 requires. |
| `worker_python/tests/parity/golden/instant_entry.json` | Golden updated with `--update-golden`. After each new entry, the engine now cancels the old orders and places the grid again from the new position (for example 97.07: 96.97, 96.87, 96.77, 97.17, 97.27, 97.37). The old file kept 96.91 and 96.81 off the grid. |

## Why
The engine cancels and places about 6 orders after each position change. An off-grid order that fills at 0.62 step breaks the rule "the next position opens at the full step". Rejected: keep the wide tolerance and move orders. A move needs a modify call and a new order state, with more risk than cancel and place.

## Verification
| Check | Result |
|---|---|
| `worker_python/tests/unit/test_eng_anchor_stale_orders.py` (BUY and SELL, FakeMT5) | Red before the fix with `--runxfail`, green after. |
| `pytest tests/unit` | 576 passed. Includes a test that 3 more ticks send nothing, and a test of `level_tolerance` (5 % branch, 1 point floor, fixed grid 0.4). |
| Golden `instant_entry` | Changed on purpose, other golden files unchanged (`--update-golden` rewrote only that file). |
| `npx tsc --noEmit` | No error. |
| `playwright test backtest-grid-parity-lib backtest-runner-lib --project=mocked` | 75 passed. The browser engine gives the new golden. |
| DEMO or VPS | Not verified. Needs the worker update on the VPS. |

Live evidence of the defect before the fix: the position at 1.12097 opened 0.00065 below the previous one (1.12162), at about −6.5 $.

## Open points
- [ ] After the VPS has the fix, watch that no order sits closer than one step to the last position, then run the ZON-13 DEMO check again.
- [ ] Watch the cancel and place churn per position change on the DEMO account. The ENG-25 brake does not count own cancels (`grid_orders.py`, `vanished.py`). A test shows that further ticks send nothing.

## Lessons
A tolerance made for a fixed grid must be checked when the grid hangs on a position. Keep one function for every place that decides "this order belongs to this level" (validation and partial fill). Never keep the check in two copies.
