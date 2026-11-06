---
date: 2026-11-06
author: Claude
type: feature
status: open
pr: [423, 424]
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

## Solution (PR-B, frontend)
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/backtest/candles/loadRates.ts` | Reads and validates `ahi`, `alo`, `g` (whole numbers, `g` at least 1, `alo` not above `ahi`, `ahi` not below the candle high), converts Ask extremes to prices, merges pages. |
| `frontend_nextjs/src/lib/backtest/broker/pathBroker.ts` | `beginCandle(…, quotes)`: Ask marks use `ahi`/`alo`, marks and fill prices snap to the grid, the market Ask is the nearest grid Ask clamped to `alo`…`ahi`. Replay minutes clear it. |
| `frontend_nextjs/src/lib/backtest/runner.ts` | Per minute (tick mode, no replay) builds the quotes; `RunModel.askExtremes` and `RunModel.quoteGrid` (default on); logs `run.quoteGrid` and `run.askExtremesMissing`. |
| i18n, mock worker, docs | Two log texts and a hint sentence (tr/en/de), mock columns, `docs/analyse-regeln.md`. No new control. |

Decisions: the SL slip stays (half spread), but it is rounded to the grid and never better than the grid level. With `g = 1` (forex, gold) only the Ask extremes apply, so results change only slightly there.

## Verification
- pytest `tests/unit/test_quote_grid.py` and `tests/api/test_market_tick_stats_api.py`: red first (14 failed, 3 passed), then green. Whole worker suite: 1062 passed.
- PR-B: `backtest-fill-grid-lib.spec.ts` and the BKT-22 tests in `backtest-data-lib.spec.ts` red first (14 failed, 2 passed), then green; all other `backtest-*-lib` specs stay green without change.
- Not verified: the worker on the VPS (the worker cannot run on the Mac).

## Acceptance run (2026-11-06, VPS, read only)
The run used `origin/main` v0.7.466 and the worker v0.7.465 (not older than v0.7.464). It used the DEMO account, 24 setups (magic 200041 to 200064), M1, tick spread, replay, trade sessions and `buildStartState` in all arms. The tool is the session script `bt8.mjs` (outside the repository). Only GET requests ran.

| Window | UTC |
|---|---|
| P3 | 2026-11-04 07:00:00 to 2026-11-05 06:29:26 |
| P4 | 2026-11-05 06:29:46 to 2026-11-06 06:29:46 |
| P5 | 2026-11-06 06:29:46 to **21:10:00** (cut short: the planned end, 2026-11-07 06:29:46, was in the future) |

Arms: B = both off, D2 = `askExtremes` only, D1 = `quoteGrid` only, D12 = both. The table shows passed/evaluable setups, then unmatched trades (live plus backtest, 24 setups).

| Window | B | D2 | D1 | D12 |
|---|---|---|---|---|
| P3 | 15/18, 10 | 16/18, 10 | 15/18, 9 | 16/18, 8 |
| P4 | 10/14, 28 | 11/14, 25 | 11/14, 22 | 12/14, 22 |
| P5 (short) | 7/12, 24 | 7/12, 22 | 7/12, 25 | 7/12, 22 |

Check of arm B: it gives the results of run 6 again (P3 15/18, P4 10/14). The current default is on, so the old C arm of the run-6 tool now equals D12 (identical in all 48 setup-window pairs).

| # | Criterion (D12 against B) | Result |
|---|---|---|
| 1 | Unmatched trades of 200050 P3, 200050 P4 and 200052 P4, each not above B, sum strictly lower | Passed. 3 / 5, 4 / 7 and 0 / 1. Sum 7 against 13. |
| 2 | 200047 P3 not above B (not a threshold) | 1 against 1. Unchanged, as expected (USDJPY has `g = 1`). Stays with T2.9. |
| 3 | No setup gets a worse K class | Passed. Three setups change from F to ok (200050 P3, 200051 P4, 200052 P4). 200050 P5 stays F (K2 now passes). No setup gets worse. |
| 4 | Fills on the grid 100 percent, USOUSD entry difference median at most 1 point, trade #13 gone | Passed. USOUSD and GER40: all fills outside replay minutes are on the grid of the minute (entries and exits, all three windows). Median entry difference: 6 to 8 points in B, 0 in D1 and D12. Trade #13 (200050 P4) is only in B and D2. |
| 5 | Information: sum of the net differences | P3: B 72.35, D12 77.82. P4: 162.79, 148.40. P5: 99.82, 95.25. |

Limits of the result:
- NDX100 gives **no grid proof**: every checked minute outside replay has `g = 1`. Only "no grid when `g = 1`" is shown there.
- In P3 the sum of the net differences is 5.5 higher in D12 than in B. K4 does not change.
- The proof of the grid compares backtest fills with the grid phase of the minute. It does not compare each live fill.
- The default stays on (`RunModel.quoteGrid` and `RunModel.askExtremes`). No criterion failed.

## Open points
- [x] A/B acceptance run on windows 3, 4 and 5: done, see "Acceptance run".
- [x] VPS: the worker runs v0.7.465 with migration 9. The worker log was not read in this run.
- [ ] Run window 5 for the full day (to 2026-11-07 06:29:46 UTC). The run used the end 21:10 UTC.
- [ ] Measure the start state of #419 (SL/TP from the order history) in a window that starts after 13:51 UTC. Window 5 starts before that time, so its start positions stay estimated.
- [ ] T2.9: setup 200047 in P3 has one extra backtest trade (USDJPY, `g = 1`). The grid does not fix it.
- [ ] A price jump over several grid steps in one tick (USOUSD +16 to +36 points) is not modelled.

## Lessons
- A rollback test that sets `user_version` by `SCHEMA_VERSION - n` breaks with every new migration. Use the fixed number of the migration the test is about.
