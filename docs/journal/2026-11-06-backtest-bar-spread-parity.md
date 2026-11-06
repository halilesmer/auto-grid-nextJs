---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [BKT-04]
areas: [frontend]
---

# Backtest: higher timeframe bars carry the M1 spread

## Request
Compare the browser backtest with the real DEMO trades. A tick analysis showed that the backtest marked a BUY fractal as consumed too early.

## Cause
`TimeframeAggregator` (`candles/bars.ts`) set `spread: 0` on every bar built from M1 data. In MT5 the `spread` field of a bar is the minimum of the M1 spreads inside the bar, and the live bot reads these bars from MT5. The "consumed" check for a BUY fractal is `bar.low + bar.spread × point <= fractal`. With spread 0 the backtest tested the bid, not the ask. The fractal was marked consumed earlier than live.

## Solution
- `BaseBar` has an optional `spread` (points). The aggregator keeps the minimum over the M1 bars of a bar, also for the forming bar.
- `PathBroker.beginCandle` puts the spread of the candle into the forming bar. `runner.ts` passes `rates.s` when it warms the bars.
- The Python bot is unchanged. It gets its bars from MT5, so the spread is already correct there.

## Note
The forming bar uses the spread setting of the run (candle, fixed, max). The warm-up bars use the raw `s` value. With the "candle" mode both are equal.

## Verification
New test in `e2e/mocked/backtest-data-lib.spec.ts` (BKT-04): minimum of the spreads for a closed and a forming bar, and the fractal check stays false when the bar low is above the fractal by the spread.
