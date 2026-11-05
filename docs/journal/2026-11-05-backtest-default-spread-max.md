---
date: 2026-11-05
author: Claude
type: decision
status: done
features: [BKT-18]
areas: [frontend]
---

# Backtest: default spread mode is "max"

## Decision
The default spread source of the backtest is now `max` (was `candle`). With the own value at 0, each candle uses max(candle spread, symbol spread). If the symbol spread is missing, the candle spread applies. Saved or chosen settings do not change. No new UI.

## Reason
The comparison of backtest and live (window 3, DEMO account) showed that the M1 candle spread is smaller than the real live spread (USOUSD 32 vs 42 points, USDJPY 11 vs 14). Touches at exact price points then trigger differently. With `max`, 12 of 18 rateable setups passed. With `candle`, 8 of 18 passed.

## Change
- `DEFAULT_RUN_SETTINGS.spreadMode` is `max`.
- `runner.ts`: mode `max` with points 0 takes the symbol spread as the lower limit.
- Hints (tr/en/de) name the default. Test: `backtest-runner-lib.spec.ts` (@BKT-18).
