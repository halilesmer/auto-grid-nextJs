---
date: 2026-10-06
type: defect
status: open
pr: []
features: [ENG-06, ENG-12, BKT-01]
areas: [worker]
---

# Stops level TP shift causes order flood

## Request

- Found during backtest step B2.1 (`2026-10-06-backtest-module-plan.md`, gap G1).
- The parity scenario has a `trade_stops_level` > 0 and a small TP.
- B2.1 records the Python bot as it is. Thus B2.1 does not fix the defect.

## Cause

- Symptom (scenario `grid_stops_level`, FakeMT5): in each bot loop, the bot cancels all pending orders of the zone and sends them again.
- The first version of the scenario had price steps of 0.02 and 3 levels for each side. It gave 1,740 cancels, 1,752 new orders and no fill in 146 ticks.
- Condition: `trade_stops_level` × `point` is larger than the TP distance (or the SL distance) of the zone. Example: point 0.001, stops level 50 points (0.05), TP 0.03.
- Root cause:
  1. `safe_send_order` calls `enforce_stops_level` (`src/utils/trade_utils.py`). For a pending order, it moves the TP to the order price ± the stops distance (here 96.93 → 96.95).
  2. `grid_execution/validation.py` (BUY and SELL branch) compares the TP of each pending order with the TP from the settings. The moved TP is never equal. Thus the order is not valid, and the bot cancels it.
  3. Placement sends the order again with the TP from the settings. `enforce_stops_level` moves it again. This occurs again in each loop.
- Effect on fills:
  - In each loop, the bot sends only the desired levels.
  - The level next to the price (the anchor, `_anchor` in `levels.py`) gets no new order. Thus the nearest order is approx. half a grid step or more from the price.
  - When the price moves in small steps, it never gets to an order. Only a price move of approx. half a grid step (plus the spread) in one tick fills an order.
  - After a fill, the TP/SL resync (ENG-08) operates correctly.
- The same effect is possible for the SL, because `enforce_stops_level` also moves the SL.
- In MT5, the signature is the same as the order flood in `2026-09-29-order-flood-external-client.md`: cancels and new orders every few seconds. But the cause is different.
- ENG-25 (vanished orders) does not stop the flood, because the bot itself cancels the orders.

## Solution

Not fixed. The fix needs a decision. Possible fix:

- `validation.py` compares the TP/SL of the order with the value that `enforce_stops_level` gives for the order price.
- Or `validation.py` accepts a TP/SL that is not nearer to the order price than the stops distance.

A fix changes these items in the same PR:

- the xfail test `test_vom_stops_level_verschobener_tp_bleibt_stehen` (`tests/unit/test_eng_grid_tick.py`) and `bekannter_fehler` of ENG-06: remove both,
- the golden file `grid_stops_level.json`,
- the TS port (`frontend_nextjs/src/lib/backtest/engine/validation.ts`),
- the guard test of `grid_stops_level` in `frontend_nextjs/e2e/mocked/backtest-grid-parity-lib.spec.ts`.

## Verification

- `tests/unit/test_eng_grid_tick.py::test_vom_stops_level_verschobener_tp_bleibt_stehen` (ENG-06, `xfail(strict=True)`): with `--runxfail` it fails, because all 6 orders have new tickets after the second loop at the same price.
- `tests/unit/test_parity_golden.py`: the golden file `grid_stops_level.json` records the current behavior. It uses price steps of 0.07, so that some orders fill.
- Live MT5: not verified. The worker runs only on the VPS. The defect needs a symbol with a stops level larger than the TP or SL distance of a zone.

## Open points

- [ ] Decide the fix. Then fix `validation.py` and the items in "Solution".
- [ ] On the VPS, examine the `trade_stops_level` of the symbols in use. `GET /api/market/{id}/time-check` gives it. Compare it with the TP and SL of the zones.

## Lessons

A parity scenario records the bot as it is. A strange golden file (thousands of cancels) is a finding, not a scenario error. Examine the cause before you change the scenario.
