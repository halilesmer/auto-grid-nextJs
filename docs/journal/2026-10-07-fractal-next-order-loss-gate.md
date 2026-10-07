---
date: 2026-10-07
type: feature
status: done
pr: []
features: [ENG-30, ZON-21]
areas: [worker, frontend]
---

# Fractal: next order only after loss threshold

## Request
In fractal entry mode, the bot must set the next fractal order only when the open position is at a loss of X. X = 0 means no limit. A switch selects the unit: amount (account currency) or pips (price distance).

## Solution
Per direction (BUY and SELL separately), the engine finds the most recently opened position of the zone. If `fractal_next_loss` > 0 and this position is not at least X in loss, the engine puts no new orders for that direction and removes the pending orders of that direction (same as the position limit). Without a position of that direction, there is no limit.

- money: position profit ≤ −X.
- pips: BUY entry − Bid ≥ X; SELL Ask − entry ≥ X.

Example (XAUUSD, 0.01 lot, X = 1 $): BUY opens at 2650. The next BUY order comes only when this position is at −1 $ (about 2649). When a new BUY opens, the new position is the reference.

| File | Change |
|---|---|
| `worker_python/src/core/grid_execution/config.py` | `fractal_next_loss`, `fractal_next_loss_mode` (money/pips) |
| `worker_python/src/core/grid_execution/fractal_entry.py` | `_loss_gate_open()` per direction in `_manage_orders` |
| `frontend_nextjs/src/components/zone/ZoneFractalFields.tsx` | Field + switch "Limit in pips"; tooltips with number examples |

## Why
The user selected "last position per direction" as reference (other options: total zone loss, every open position). Pending orders of a blocked direction are removed, so that a fill cannot open a position before the threshold.
