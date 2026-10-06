---
date: 2026-10-02
type: fix
status: open
pr: [97]
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
- Not changed: when the bot deletes an order for a different reason (max. positions, changed lot), it does not place it again on a fractal that the candle (Bid) touched.
- The golden scenario `fractal_rebound_opposite` was generated again. Before the fix: a delete one tick before the fill. After the fix: a fill.

Code: `worker_python/src/core/grid_execution/fractal_entry.py`.

## Verification

- New unit test (ENG-21): the BUY LIMIT stays when only the Bid touches the fractal, and it fills when the Ask reaches it. Without the fix, the test fails.
- Live: not verified yet.

## Open points

- [ ] Live check on the VPS: after a line with `MT5'te kalıyor`, no `siliniyor` line follows for the same order.
- [ ] Decision of the owner: must "touched" for a new BUY LIMIT (for example after a delete for max. positions) start at the Ask, not at the Bid? Now it is the Bid (candle).

## Lessons

- MT5 candles are Bid prices. A BUY order fills at the Ask (Bid + spread). A Bid touch is not a fill for a BUY LIMIT.
- Compare with the order flood of 2026-09-29: there, a different client deleted the orders without a log line. Here, the bot deleted them and wrote a log line.
