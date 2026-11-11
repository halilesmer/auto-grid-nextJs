---
date: 2026-11-11
author: Claude
type: feature
status: open
pr: [PRNUM]
features: [BKT-24]
areas: [worker, tests, docs]
---

# Pending orders at window start (worker endpoint)

## Request
Step 1 (PR-A, worker) of plan 1111-K1, decision 1111-K2. The browser backtest starts with an empty order book. The live account often holds pending orders at the start of the window, and they fill in the first ticks. This is class c2 of the K55 diagnosis. The worker must give these orders on request.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/market_db.py` | Migration 11: tables `live_orders` and `live_order_coverage`, two indexes. Both tables join `_ACCOUNT_ARCHIVE_TABLES`. New `live_order_gaps`, `store_live_orders`, `read_live_orders`. Older migrations stay unchanged. |
| `worker_python/src/utils/market_sync.py` | `get_live_orders`, `order_waits_in` (filter), `live_orders_covered_to` (coverage rule), `_fetch_live_orders` (two `history_orders_get` calls and one `orders_get`). |
| `worker_python/src/api/market.py` | `GET /api/history/{id}/orders?from&to` with `account_access`. 400 if `to <= from` or the span is more than 31 days. |
| `worker_python/tests/fakes/fake_mt5.py` | `history_orders_get` takes `date_from` and `date_to`. `history_range_by` selects `setup` or `done`. `Order` gets time fields. |

## Why
- MT5 does not say if `history_orders_get` filters by setup time or by done time. The worker asks twice (`from - 14 days .. to`, and `from .. to + 14 days`) and merges by ticket. A test runs both meanings. An order that waited longer than the lookback can still be missed. The response shows `lookback_sec`.
- The range form of the filter is: set before `to`, done at or after `from` (or still open), pending type 2-5, not rejected. With `to = from + 1` this is the state at `from`. The frontend must remove orders set in the second after `from`.
- Only finished orders are stored. An open order changes when it fills, so the worker reads it again from `orders_get` on each request.
- Coverage stops at the oldest open order and at the fresh edge (`DEAL_SETTLE_SEC`). A range is then never marked complete while an order that began in it can still finish.
- `position_orders` stays as it is. It holds one lookup row per position. This table holds one row per order.
- The call is not moved to `mt5_reader`. Order history is local in the terminal. The duration is measured on the VPS first.

## Verification
- New tests: `tests/unit/test_live_orders.py` and `tests/api/test_history_orders_api.py` (28 tests). They failed before the code and pass after it.
- Not verified: the call duration and the real MT5 range meaning on the VPS.

## Open points
- [ ] Measure `GET /history/{id}/orders` on the VPS. If it takes more than 2 s, move it to `mt5_reader.run()`.
- [ ] PR-B: frontend (`startState`, `seedOrder`, `initialOrders`), mock worker, lib spec, `docs/analyse-regeln.md`.
- [ ] Acceptance measurement (windows P6+, P7, P8).

## Lessons
- Test the unknown range meaning of an MT5 call with a fake that has a switch for each meaning.
