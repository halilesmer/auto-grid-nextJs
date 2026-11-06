---
date: 2026-11-06
author: Claude
type: feature
status: open
pr: []
features: [BKT-19, BKT-18, ANA-04]
areas: [worker, frontend]
---

# Backtest spread mode "tick" (minute average from ticks)

## Request
The backtest candle spread is the smallest tick spread of the minute (measured with ticks on a DEMO window), so the `candle` mode is too optimistic. `max(candle, symbol.spread)` is close but uses today's symbol spread, which does not fit past windows. The project owner asked for the most realistic model. The measured best model outside the broker rollover is the time-weighted tick spread per minute (`ttw`).

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/market_db.py` | Migration 6: tables `tick_spread` (`sa`, `sx`, `n` per minute) and `tick_spread_coverage`; helpers for plan, store and read. |
| `worker_python/src/utils/market_sync.py` | `minute_spread_stats` (time-weighted mean, max, count, carry from the last tick before the minute), tick pieces of one broker day, budget of 40 s per call. |
| `worker_python/src/api/market.py` | `tick_spread=1` on `/rates` (M1 only) and `tick_spread` in `/coverage`. |
| `frontend_nextjs/src/lib/backtest/` | `SpreadSetting` mode `tick`; `loadRates` reads `sa`/`sx` and asks again for `budget`/`syncing` (15 times at most); the runner uses `sa`; default `tick`. |
| UI, i18n | One new option in the existing spread select, new hints in tr/en/de, log text `run.tickSpreadFallback`. No new layout. |

## Why
- Own tables, not columns in `rates`: `store_rates` uses `INSERT OR REPLACE`. A rewrite of a candle would erase the tick columns. CSV sources never have ticks. The tick coverage has its own life cycle.
- Computed on request, not on every M1 sync: the chart reads M1 every minute, a day of ticks is 80k to 250k rows. Only the backtest loader asks (`tick_spread=1`). No background backfill. A window is filled when it is requested and is stored.
- Without `sa` the `max` rule applies, not the candle spread. The default is now `tick`. Data without ticks (CSV, M5 and higher, minutes that the broker cannot deliver) must not be more optimistic than the old default.
- Bars of the bot time frames keep the candle spread in `tick` mode. MT5 bars carry the minimum, and the fractal check reads it.
- Rejected: a hard error for `tick` with data other than M1. The default would then break every M5 run; it falls back to `max` with a log line instead.

## Verification
- pytest: whole worker suite, 1011 passed (new file `tests/api/test_market_tick_spread_api.py`, hand-calculated minutes, storage, `syncing`, `busy`, `budget`, migration from version 5). The old CSV migration test now also drops the two new tables.
- Playwright lib specs `backtest-data-lib` and `backtest-runner-lib` (tag `@BKT-19`) were red first (9 failed), then green.
- Not verified: the worker on the VPS (the worker cannot run on the Mac). The assumption that MT5 `tick_volume` is near the tick count (threshold 0.5 for `syncing`) must be checked with real data.

## Open points
- [ ] VPS test (DEMO, read only): first run with `tick`, second run without MT5 calls, `/coverage` shows `tick_spread`. Log the measured tick count against `tick_volume` and the time per day.
- [ ] Acceptance of the analysis: windows 3 and 4, sum of absolute net differences outside EURCHF is not higher than with `max`.
- [ ] In the rollover minutes `tick` makes EURCHF worse (the analysis measured -830 against -298 live). The next step (selective tick replay in rollover and jump minutes) removes this. Until then compare EURCHF with `max` too.
- [ ] `max` and `fixed` still give the higher time frame bars the same spread as the minute (known gap, not in this change).

## Lessons
- A weekend inside a `complete` candle range is split into day pieces too. A piece without candles must not call MT5 and must not be reported as missing.
