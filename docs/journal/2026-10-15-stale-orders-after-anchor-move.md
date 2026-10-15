---
date: 2026-10-15
author: Claude
type: defect
status: open
pr: []
features: [ENG-17, ENG-18, ZON-13]
areas: [worker, tests]
---

# Old orders stay after the grid anchor moves

## Request
The DEMO check of ZON-13 ran with a position-anchored setup (`step_by_loss`, `instant_entry`). Some pending orders were not 0.00100 apart. Find the cause. Do not fix it yet.

## Cause
| Item | Value |
|---|---|
| Observation (DEMO, EURUSD, 0.10 lot, grid 10 $, TP 5 $) | Last position 1.12161. Nearest BUY LIMIT 1.12099 (0.00062 below). Other orders 0.00016 to 0.00038 off the grid of the last position. |
| Anchor | `levels._anchor` puts the grid on the last opened position of the side. After a TP and a new entry, the anchor moves. |
| Cleanup | `validation.validate_and_cleanup` keeps an order when it is within 0.4 × grid step of an acceptable level. The order is not moved. |
| Placement | `placement.py` counts an old order within 0.45 × grid step as an occupied level. Thus the engine does not place a new order next to it. Only 1.12262 is new in the reproduction. |
| Result | An order of the old anchor stays when it is at most 0.00040 from a level of the new grid. It then fills before one full step. The previous position is then at about −6.2 $, not −10 $. |

## Verification
`worker_python/tests/unit/test_eng_anchor_stale_orders.py` (FakeMT5) has 3 tests. Position at 1.12299, TP, new entry at 1.12362.

| Test | Result |
|---|---|
| Start state and new entry (BUY) | Passed. |
| BUY orders follow the new anchor | `xfail(strict=True)`. Expected 1.11862 to 1.12262. The engine leaves 1.11799 to 1.12199 and adds 1.12262. Seen red with `--runxfail`. |
| SELL orders follow the new anchor | `xfail(strict=True)`. Expected 1.12336 to 1.12736. The engine keeps 1.12399 (and 1.12799). Seen red with `--runxfail`. |

`pytest tests/unit` returned 571 passed, 1 xfailed before the SELL test was added. The old BUY order at 1.12199 fills at −6.3 $ after the position at 1.12262.
DEMO or VPS: not verified. The live values (nearest order 0.00062 below the last position) come from the worker API.

## Open points
- [ ] Fix BUY and SELL branch (`validation.py` has one copy for each side).
- [ ] Decide the fix with the project owner (for example: cancel orders that are not on the grid of the new anchor, with the position levels kept).
- [ ] Check the backtest engine copy (`frontend_nextjs/src/lib/backtest/engine/`) and the golden test (`hooks/RULES.md` §4.7).
- [ ] Run the ZON-13 DEMO check again after the fix.
