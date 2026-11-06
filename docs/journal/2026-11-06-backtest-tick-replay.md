---
date: 2026-11-06
author: Claude
type: feature
status: open
pr: []
features: [BKT-20, BKT-19, ANA-04]
areas: [worker, frontend]
---

# Backtest tick replay for rollover and jump minutes

## Request
The mode `tick` (BKT-19) gives one spread per minute. In the broker rollover (spread 90 to 212 points, Ask frozen) and in price jumps one value per minute does not work: the synthetic Ask is lower than the real Ask, so the engine fills orders that never filled, picks the wrong order type (LIMIT or STOP) and books stop losses that never happened. The analysis measured it on EURCHF (setup 200044: backtest -830 against -298 live). The intra-minute path of a gap (XAUUSD stop loss gap, USOUSD jump) is also invisible in M1 OHLC.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/market_db.py` | Migration 7: table `tick_replay` (zlib JSON blob, prices in whole points), column `tick_spread_coverage.replay`. `plan_tick_spread(replay=True)` fetches ranges again that hold only BKT-19 data. `_replace_segment` merges on several keys. |
| `worker_python/src/utils/market_sync.py` | `replay_minutes` (rule S and rule J, tick budget per day piece), `encode_replay`/`decode_replay`, `tick_replay` parameter through `get_rates`, `replay` response columns. |
| `worker_python/src/api/market.py` | `tick_replay=1` on `/rates` (needs `tick_spread=1`, else 400). `/coverage` shows `replay` per range. |
| `frontend_nextjs/src/lib/backtest/candles/loadRates.ts` | Reads and validates `replay`, converts points to prices, drops minutes outside the loaded range, merges pages. |
| `frontend_nextjs/src/lib/backtest/broker/pathBroker.ts` | `beginReplay`/`endReplay`, `setQuote` (Bid and Ask from the tick), `quoteTriggers`, `hasTarget`, `setBarOhlc`. No stop loss slip in a replay minute. |
| `frontend_nextjs/src/lib/backtest/runner.ts` | Replay branch per minute, bot at most once per second of tick time, `RunModel.tickReplay` (default on), logs `run.tickReplay` and `run.tickReplayMismatch`. |
| i18n | Two log texts and one more sentence in the spread hint (tr/en/de). No new control, no layout change. |

## Why
- **Which minutes:** rule S is `max tick spread >= 3 x median` of the minute means of the day piece (at least 30 minutes). Rollover minutes measured 3.6 to 7.1 times the normal spread, normal minutes stay below 1.4. The ratio `sx/sa` does not work: in the rollover the spread is high for the whole minute (ratio 1.1). A fixed clock window depends on the broker and on summer time. Rule J is a Bid or Ask step between two ticks of at least `4 x median` points (also from the last tick before the minute). It finds the USOUSD jump (12 times) and the XAUUSD gap (6.3 times), which rule S does not. A spread step from the rollover to a normal spread is an Ask step too, so the first minute after a rollover is marked by rule J. This is intended: the Ask really moves there.
- **Stored in the worker, not fetched on request:** `_fetch_tick_piece` already reads all ticks of the day for BKT-19. Writing the marked minutes at the same time costs no extra MT5 call. Budget, `data_query=True`, the semaphore and `busy` stay the same, so the bot session stays untouched. A raw tick route for users would give raw data to everyone. `/ticks` stays admin only. A user gets only the marked minutes through `/rates`, under `account_access`.
- **Engine:** the engine rule for the order type does not change. The bot reads the real Ask through `symbolInfoTick`, so it picks BUY STOP when the real Ask is below the level. A stop loss in a replay minute fills at the first tick that crosses it. The half spread slip stood for the unknown gap inside the minute; a tick shows the gap. The next minute starts with the spread of the last tick (the old carry of the 181 point minute created the false stop loss in setup 200045).
- **Bot cadence:** the live loop sleeps 1.0 s. One bot run per tick would be far more often than live (dozens of ticks per second at an index open).

## Verification
- pytest `tests/unit/test_tick_replay.py` and `tests/api/test_market_tick_replay_api.py`: red first (14 failed, 1 passed), then 15 passed. Two older migration tests now also drop `tick_replay` (needed because a later migration creates it).
- Playwright lib specs `backtest-data-lib` and `backtest-runner-lib` (tag `@BKT-20`): red first (10 failed, 2 passed, the two are regression guards), then the two files pass completely (97 tests).
- Not verified: the worker on the VPS (the worker cannot run on the Mac).

## Open points
- [ ] VPS test (DEMO, read only): first run fetches again the ranges stored by BKT-19. Check the worker log line `tick_replay …` per day (marked minutes, ticks, dropped, ticks of the day) and calibrate the factors 3 and 4 and the 30 000 tick budget.
- [ ] Acceptance: windows 3 and 4, EURCHF included, the sum of absolute net differences with replay is lower than with `tick` alone. EURCHF 200044 and 200045 differ by at most one trade.
- [ ] The median of a day piece uses the minutes of the piece only (no look-back minutes).
- [ ] The dropped minutes per day are only logged, not stored (no column in the coverage).
- [ ] Not covered: minutes where only the trade touches a jump of a few points (setup 200058, 4 second pull-back). It needs a second pass in the run.
- [ ] Next: the session model (`10018 Market closed`) and a new BT-Live run in windows 3 and 4.

## Lessons
- A `sqlite3` connection in a test needs `isolation_level=None` when it mixes DML and `PRAGMA user_version`: an open transaction rolls the pragma back on close.
