---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [ANA-07, BKT-16]
areas: [worker, frontend, backtest]
---

# Start state takes SL/TP from the order history

## Request
The BT-Live comparison must not estimate SL/TP of positions that were open at the start of the window. The values must come from the MT5 order history.

## Cause
A tick analysis of the K4 optimism found one cause in the start state. The tool estimated the TP of a position that was open at the window start from the ratio of the setup (ratio 1 for fractal setups). For one GBPUSD fractal position the estimated TP was 1.34967. The live position did not close at that price, but the backtest closed it at the TP and freed a slot. This started a chain of different trades.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/market_db.py` | Migration 7: table `position_orders` (position id, sl, tp). `read_deals` adds `open_sl`/`open_tp` to every deal of a known position. |
| `worker_python/src/utils/market_sync.py` | `get_deals` looks up the opening order with `history_orders_get(position=…)` for entry deals that have no row yet (newest first, at most 200 per request, not when the account is busy). A value of 0 becomes null. |
| `frontend_nextjs/src/lib/backtest/startState.ts` | New pure function `buildStartState`. It takes SL/TP from `open_sl`/`open_tp`. Only a missing value falls back to the old estimate. The number of estimated positions goes into the log as WARN `run.startLevelsEstimated` (i18n tr/en/de). |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | The mock returns `open_sl`/`open_tp` on every deal. |

The comparison tool did not live in the repo before. Only the engine input `RunInput.initialPositions` existed. The tool that built it lives outside the repo, so `buildStartState` is a port of that code with the new source of levels. The engine does not change.

## Why
- The order, not the deal, holds the SL/TP of the request. The deal has no such fields.
- A lookup row exists after the first lookup. A null value means "the order had no value or is not in the history any more". Then the old estimate is the only source, and the log says so.
- The lookup is limited per request, so a first call on a large archive does not block MT5. Later calls continue.
- An MT5 error does not write a row, so the next request tries again.

## Open
- Run the comparison on the DEMO account and check that the position of the example now stays open. The worker change can only be checked on the VPS after the pull.
- Nothing calls `buildStartState` in the UI yet. The outside tool must switch to it.
