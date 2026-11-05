---
date: 2026-11-05
author: Claude
type: fix
status: open
features: [BKT-17]
areas: [frontend]
---

# Backtest engine: no advantage over live

## Request
In window 3 (24 setups) the backtest was better than live for EURCHF, USOUSD and fractal setups. The causes come from candles, not ticks (notes `bt-live-a`, `bt-live-b`, `bt-live-c`). The engine must not calculate better than the broker.

## Changes (engine only, safe defaults, no UI)
| Point | Change | Option |
|---|---|---|
| Spread | The candle spread field is an end value. For fill check and fill price the engine uses `max(spread of this candle, spread of the previous candle)`. If the previous candle was wider, a limit order does not fill by gap at a better price than its order price | `RunModel.carrySpread`, default on |
| SL slippage | An SL fills worse than its level by half the candle spread. TP still fills on its level (live fills there slightly better, so the backtest stays conservative) | `RunModel.slSlippagePoints`, default half spread, `0` = off |
| Start state | Positions that were open at the start (side, volume, price, SL/TP, magic, comment) and fractals that were traded before `from` | `RunInput.initialPositions`, `RunInput.initialFractalDone`, default empty |

A start position with a fractal comment marks its fractal as done through the existing `updateDone`. `initialFractalDone` covers fractals whose position was already closed before `from`.

## Open
- The caller (`runJob`, UI) does not fill the start state yet. A UI field needs a design first. Until then only the comparison tool passes `initialPositions` from the live deals before `from`.
- Re-run window 3 for 200044, 200050 and 200054 with the new defaults to measure the effect. Not done in this change.
- Order of events inside one candle and Ask peaks inside a minute stay unknown without ticks.
