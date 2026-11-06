---
date: 2026-11-06
author: Claude
type: feature
status: open
pr: []
features: [BKT-22, BKT-19, BKT-20]
areas: [worker, frontend]
---

# Backtest fill price: quote grid and real Ask extremes

## Request
The BT-live run 6 left 24 unmatched trades. Ten of them are fill price or spread problems. Outside the replay minutes the backtest fills a stop order at the exact level, but live the order fills at the first tick past the level (USOUSD: typically +9 points). The take profit and stop loss then sit at a fixed distance from a different fill price. The synthetic Ask `Bid + minute mean spread` also made a false fill at the round level 90.4, because at the minute high the real spread is the minute minimum.

## Measurements (DEMO account, read only)
- **Ticks sit on a price grid, and the phase changes every day.** USOUSD steps in 10 points (Ask residue 6 on 2026-11-04, 9 on 2026-11-05, 2 on 2026-11-06 in the deal prices). NDX100 steps in 25 points, GER40 in 50. Forex and gold step in 1 point (no grid).
- **Every live fill is a real tick price.** USOUSD entries, take profits and stop losses all fall on the grid of the day: buys on the Ask grid, sells on the Bid grid. A take profit of a long position fills at the first Bid past the level (about +8 points better than the level).
- **The M1 field `spread` is the minute minimum** (99.7 to 100 percent of the minutes). So `Bid + smin` is no good at the low: it would trigger BUY LIMIT and SELL TP at an Ask that never existed. The worker stores the real Ask high and low of the minute instead.

## Solution (PR-A, worker)
| File | Change |
|---|---|
| `worker_python/src/utils/market_db.py` | Migration 9: `tick_spread.ahi/alo/g`, `tick_spread_coverage.stats`. `TICK_STATS_VERSION`. `plan_tick_spread` fetches ranges again whose `stats` is lower. `store_tick_spread` writes named columns and accepts rows with or without the three new values. `read_rates` and the coverage summary carry them. |
| `worker_python/src/utils/market_sync.py` | `quote_grid` (largest candidate that divides 99 percent of the Bid and Ask steps, at least 50 steps), `minute_quote_extremes` (Ask high and low in whole points, grid of the minute, 1 if the phase changes). `minute_spread_stats` does not change. `/rates` gets the columns `ahi`, `alo`, `g`. |
| tests | `test_quote_grid.py`, `test_market_tick_stats_api.py`. Two older rollback tests drop the new columns (`test_market_tick_replay_api.py`) and use a fixed `user_version=3` (`test_csv_import_api.py`). |

The frontend part (PR-B) uses the new columns for D2 (Ask extremes) and D1 (grid fill).

## Verification
- pytest `tests/unit/test_quote_grid.py` and `tests/api/test_market_tick_stats_api.py`: red first (14 failed, 3 passed), then green. Whole worker suite: 1062 passed.
- Not verified: the worker on the VPS (the worker cannot run on the Mac).

## Open points
- [ ] PR-B (frontend): use `ahi`/`alo`/`g` in the run, and the A/B acceptance run on windows 3, 4 and 5.
- [ ] VPS: the first run fetches again all tick ranges stored by BKT-19 and BKT-20 (once). Check the worker log.
- [ ] A price jump over several grid steps in one tick (USOUSD +16 to +36 points) is not modelled.

## Lessons
- A rollback test that sets `user_version` by `SCHEMA_VERSION - n` breaks with every new migration. Use the fixed number of the migration the test is about.
