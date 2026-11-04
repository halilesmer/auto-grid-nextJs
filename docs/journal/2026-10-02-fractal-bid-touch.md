---
date: 2026-10-02
type: fix
status: open
pr: [97, K5]
features: [ENG-21]
areas: [worker]
---

# Fractal: BUY LIMIT deleted at Bid touch

## Request

Fractal mode "rebound", M1 (DEMO account C): each BUY LIMIT disappeared shortly before the price reached it.

## Cause

| Step | Finding |
|---|---|
| Symptom | About 15 pairs of log lines on one day, and no fill: first a line with `fiyatça geçildi, emir yok`, then a delete line with `siliniyor` and the reason `güncel fraktalla eşleşmiyor`. |
| Root cause | Candles are Bid prices, but a BUY LIMIT fills at the Ask. `_build_desired` marked the lower fractal as "used" when a candle low touched it. The order then matched no fractal, and the bot deleted it. |
| Not affected | Stop orders and SELL LIMIT. MT5 fills them before a candle touches the price. |

## Solution

- "Used" applies only to new orders. An existing order on a reached fractal stays, and MT5 decides about the fill.
- The bot does not change SL/TP of such an order (freeze level near the price). It writes one log line with `fiyatça ulaşıldı` and `MT5'te kalıyor, dolumu broker belirler`.
- Not changed (SELL side; for BUY LIMIT see the follow-up of 2026-11-04): when the bot deletes an order for a different reason (max. positions, changed lot), it does not place it again on a fractal that the candle (Bid) touched.
- The golden scenario `fractal_rebound_opposite` was generated again. Before the fix: a delete one tick before the fill. After the fix: a fill.

Code: `worker_python/src/core/grid_execution/fractal_entry.py`.

## Verification

- New unit test (ENG-21): the BUY LIMIT stays when only the Bid touches the fractal, and it fills when the Ask reaches it. Without the fix, the test fails.
- Live: not verified yet.

## Open points

- [x] Live check (K17, 2026-11-04, DEMO, read-only): see "Follow-up 2026-11-04".
- [x] Decision of the owner (K5, 2026-11-04): "touched" for a new BUY LIMIT starts at the Ask of the candle. See "Follow-up 2026-11-04".
- [ ] VPS test of K5 after the worker update (owner).
- [ ] Backtest aggregator (`candles/bars.ts`) sets `spread: 0` on strategy-timeframe candles, so the Ask branch does not act in real backtest runs yet. Pass the base candle spread through (check MT5 semantics for aggregated candles first).
- [ ] Possible MODIFY near the price: for an existing BUY LIMIT with Bid touch but no Ask touch, `consumed` is now false, so a changed SL/TP (modes `sar`, `opposite_fractal`) may send a MODIFY near the freeze level. Check on the DEMO account; a test with `spread` and `fractal_sl_mode="sar"` is missing.
- [ ] No parity scenario yet reaches the new branch (Bid-low below the level, Ask-low above it): `fractal_rebound_opposite` is unchanged.

## Lessons

- MT5 candles are Bid prices. A BUY order fills at the Ask (Bid + spread). A Bid touch is not a fill for a BUY LIMIT.
- Compare with the order flood of 2026-09-29: there, a different client deleted the orders without a log line. Here, the bot deleted them and wrote a log line.

## Follow-up 2026-11-04

### Live check (K17)

- Source: robot log of the DEMO account through the worker API, GET only, last 2000 lines (2026-11-04 10:09 to 23:10).
- Result: 6 lines with `MT5'te kalıyor` (6 different orders). For none of them a `siliniyor` line follows for the same ticket. 117 other `siliniyor` lines exist, all for other tickets (reasons: `güncel fraktalla eşleşmiyor`, `maksimum pozisyon`).
- Conclusion: no contradiction found. The sample is small (6 cases, one day).

### Ask touch for new BUY LIMIT (K5)

- Owner decision: for a new fractal BUY LIMIT, "touched" starts at the Ask of the candle. Ask is about Bid low + the `spread` of the same candle (points x point size). SELL stays at the Bid.
- Code: `_build_desired` in `fractal_entry.py` and the same check in `frontend_nextjs/src/lib/backtest/engine/fractalEntry.ts` (parity). A candle without a `spread` field counts as spread 0 (old behavior).
- Tests (ENG-21): a later candle with Bid low 96.49 and spread 20 points does not consume the level 96.5 (order is placed); with spread 5 points it does (no order). The first test failed before the change.
- Golden: `fractal_rebound_opposite` regenerated, no change (its candles never separate Bid and Ask touch).
- The candle `spread` is one value per candle, not the spread at the time of the low. The Ask low is an approximation.
