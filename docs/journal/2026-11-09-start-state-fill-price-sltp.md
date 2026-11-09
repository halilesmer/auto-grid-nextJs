---
date: 2026-11-09
author: Claude
type: fix
status: done
pr: []
features: [BKT-16, ANA-07]
areas: [frontend, backtest]
---

# Start state sets grid SL/TP from the fill price

## Request
Positions that were open at the window start got the SL/TP of the opening order. The live bot moves SL/TP after the fill, so the backtest closed such positions at slightly wrong prices (1106-K54.1).

## Cause
`open_sl`/`open_tp` come from the MT5 order history. They hold the level of the opening order, not the level after the fill. For grid setups the bot sets SL/TP again from the fill price (`grid_order_manager.py`, threshold `> 0.00001`). It does not do this for fractal setups. The backtest engine uses the same formula (`engine/orderManager.ts`). A measurement on 12 grid positions showed that the real level equals fill price ± setting distance in 12 of 12 cases. The shift was 0.03–0.12 on XAUUSD and 0.002–0.018 on USOUSD.

## Solution
`buildStartState` (`frontend_nextjs/src/lib/backtest/startState.ts`) now does this for each grid position that has `open_sl`/`open_tp`:
1. Expected level = fill price ± the setting distance (buy and sell separate), rounded to the symbol digits.
2. If the expected level is at most 0.00001 from `open_x`, `open_x` stays. The bot does not change the position in this case.
3. If it is more than 0.5 × grid step from `open_x`, the setting probably changed since the order. `open_x` stays and the WARN line `run.startLevelsSettingChanged` goes into the log (i18n tr/en/de).
4. Otherwise the expected level is used.

`StartSetup` gets `grid_step` and `sell_grid_step` for the limit in step 3. Without a grid step, or with a distance of 0, the old value stays. Fractal setups and missing `open_x` are unchanged.

## Why
- 0.5 × grid step is the natural limit: a real fill shift is far below one step, and a changed setting is usually larger.
- The function rounds with the symbol digits, as it did before. The engine function `normalizePrice` needs the full symbol info, which the start state does not have.

## Tests
Tagged `@BKT-16` in `e2e/mocked/backtest-live-compare-lib.spec.ts`: buy SL, buy TP, sell, bot threshold, changed setting with note, fractal unchanged, missing `open_x`. The first four new tests failed before the change.

## Open
Check on the next BT-live window that the XAUUSD and USOUSD positions close at the live prices.
