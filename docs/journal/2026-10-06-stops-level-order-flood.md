---
date: 2026-10-06
type: defect
status: open
pr: []
features: [ENG-06, ENG-12, BKT-01]
areas: [worker]
---

# Stops level moves TP: bot sends orders again each loop

## Request

Found during backtest step B2.1 (`2026-10-06-backtest-module-plan.md`, gap G1): a parity scenario with `trade_stops_level` > 0 and a small TP. Not fixed in B2.1, because B2.1 records the behavior of the Python bot as it is.

## Cause

- Symptom (scenario `grid_stops_level`, FakeMT5): in each bot loop the bot cancels all pending orders of the zone and sends them again. The first version of the scenario (price steps of 0.02, 3 levels for each side) gave 1,740 cancels and 1,752 orders in 146 ticks, and no fill.
- Condition: `trade_stops_level` × `point` is larger than the TP distance (or the SL distance) of the zone. Example: USOUSD, point 0.001, stops level 50 points (0.05), TP 0.03.
- Root cause:
  1. `safe_send_order` calls `enforce_stops_level` (`src/utils/trade_utils.py`). For a pending order it moves the TP to order price ± stops distance (here 96.93 → 96.95).
  2. `grid_execution/validation.py` (BUY and SELL branch) compares the TP of each pending order with the TP from the settings (order price ± `take_profit`). The moved TP is never equal. Thus the order is not valid and the bot cancels it.
  3. Placement sends the order again with the TP from the settings, and `enforce_stops_level` moves it again. This repeats in each loop.
- Effect on fills: in each loop the bot sends only the desired levels. The level next to the price (the anchor, `levels.py` `_anchor`) gets no new order. When the price moves in small steps, it never reaches an order. Only a price jump over the stops distance in one tick fills an order. Then the TP/SL resync (ENG-08) runs and is correct.
- The same effect is possible for the SL (`enforce_stops_level` also moves the SL).
- The signature in MT5 is the same as the order flood in `2026-09-29-order-flood-external-client.md` (cancels and new orders every few seconds), but the cause is different. ENG-25 (vanished orders) does not stop it, because the bot itself cancels the orders.

## Solution

Not fixed. Possible fix (needs a decision): `validation.py` compares the TP/SL of the order with the value after `enforce_stops_level` for the order price, or it accepts a TP/SL that is not nearer to the order price than the stops distance. The fix changes the golden file `grid_stops_level.json` and the TS port (`frontend_nextjs/src/lib/backtest/engine/validation.ts`) in the same PR.

## Verification

- `worker_python`: `.venv/bin/python -m pytest tests/unit/test_parity_golden.py -q` → 89 passed. The golden file `grid_stops_level.json` records the current behavior (with price steps of 0.07, so that some orders fill).
- Live MT5 not verified: the worker runs only on the VPS. The defect needs a symbol with a stops level larger than the TP or SL distance of a zone.

## Open points

- [ ] Decide the fix and fix `validation.py` with a failing test first (`hooks/RULES.md` §8). Then write the golden file again and port the fix to `validation.ts`.
- [ ] On the VPS: examine the `trade_stops_level` of the symbols in use (`GET /api/market/{id}/time-check` gives it) and compare it with the TP/SL of the zones.

## Lessons

- A parity scenario records the bot as it is. A strange golden file (thousands of cancels) is a finding, not a scenario error. Examine the cause before you change the scenario.
