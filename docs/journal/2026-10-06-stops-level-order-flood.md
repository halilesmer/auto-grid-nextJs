---
date: 2026-10-06
type: defect
status: done
pr: [115, 123]
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

Fixed on 2026-10-07. `validation.py` now compares the TP/SL of a pending order with the value that `enforce_stops_level` gives for the order price.

| File | Change |
|---|---|
| `worker_python/src/core/grid_execution/validation.py` | New method `OrderValidator._as_sent`: it sends the expected TP/SL through `enforce_stops_level` (same request as placement). BUY and SELL branch use the result. |
| `frontend_nextjs/src/lib/backtest/engine/validation.ts` | Same change in the TS port (`enforceStopsLevel`). |
| `worker_python/tests/unit/test_eng_grid_tick.py` | `test_vom_stops_level_verschobener_tp_bleibt_stehen`: `xfail` removed. New: `test_vom_stops_level_verschobener_sl_bleibt_stehen` (BUY, SELL), `test_tp_aenderung_bei_stops_level_setzt_orders_neu`. |
| `docs/features/features.yaml` | ENG-06: `bekannter_fehler` removed. |
| `worker_python/tests/parity/golden/grid_stops_level.json` | New golden file (`--update-golden`). No other golden file changed. |
| `frontend_nextjs/e2e/mocked/backtest-grid-parity-lib.spec.ts` | Guard of `grid_stops_level`: the first order fills and is not cancelled; 23 cancels, 34 fills. |

## Why

- Option A (selected): use the same function as the send path. There is no second copy of the stops rule. A changed TP in the settings or a changed stops level of the broker still makes the order not valid, and the bot sets it again one time.
- Option B (rejected): accept each TP/SL that is not nearer to the order price than the stops distance. If the user makes the TP larger, the old order stays with the old TP. Also, this needs a second stops rule next to `enforce_stops_level`.

## Verification

- `pytest tests/unit/test_eng_grid_tick.py`: 23 passed. The former xfail test passes. New tests (ENG-06): moved SL stays (BUY and SELL), and a TP change in the settings sets the orders again when a stops level applies. Without the fix in `validation.py`, the 3 "stays" tests fail.
- `pytest tests/unit/test_parity_golden.py --update-golden`: 86 passed. Only `grid_stops_level.json` changed. Scenario result: cancels 131 → 23, fills 19 → 34.
- `npx playwright test --project=mocked --grep @BKT-02`: 40 passed (TS port gives the same events as the new golden file).
- `npx tsc --noEmit` and `npm run lint`: no errors.
- Live MT5 (2026-10-07, worker v0.7.170, read-only): `GET /api/market/{id}/time-check` for each symbol of the 4 accounts on the VPS (USOUSD, EURUSD, XTIUSD; 2 brokers, all DEMO). `trade_stops_level` is 0 for all symbols. Thus no zone can trigger the defect now. The behavior with a stops level > 0 is verified only with FakeMT5.

## Open points

- [x] Decide the fix. Then fix `validation.py` and the items in "Solution".
- [x] On the VPS, examine the `trade_stops_level` of the symbols in use. `GET /api/market/{id}/time-check` gives it. Compare it with the TP and SL of the zones. If a symbol has a stops level larger than a TP or SL distance, make sure that the bot does not cancel and set the orders again in each loop.

## Lessons

A parity scenario records the bot as it is. A strange golden file (thousands of cancels) is a finding, not a scenario error. Examine the cause before you change the scenario.

If the send path changes a value of a request (TP, SL, price, volume), the validation must use the same function to get the expected value. Do not compare with the value from the settings.
