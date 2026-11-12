---
date: 2026-11-12
author: Claude
type: fix
status: done
pr: []
features: [ANA-04, BKT-27]
areas: [worker, frontend]
---

# Empty candle ranges with ticks are no longer stored as pauses

## Request
Class D of the BT-to-MT5 diagnosis: a range without candles during trading hours, while ticks exist, was stored as `gap_confirmed`. The range counted as covered and the worker never asked again. A backtest then ran on a data hole without any warning.

## Cause
`classify` makes a leading hole, one `complete` span and a trailing hole. Only holes of a timeframe with a `LOWER_TF` entry were checked against lower-timeframe candles. M1 has no `LOWER_TF` entry, so an M1 hole was never checked. The terminal had not loaded the history yet, MT5 returned no candles, and the worker stored the range as a confirmed pause for good.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/market_sync.py` | Tick probe `_has_bid_tick` (first 50 ticks from the start of the hole). A Bid tick inside the hole proves that M1 candles must exist. A hole that ends at most 7 days back goes to `syncing` (asked again). An older hole with ticks goes to `unavailable` (retried after 24 hours). Holes without a Bid tick (weekends, closed hours) stay `gap_confirmed`. |
| `worker_python/src/utils/market_db.py` | Migration 12 deletes the old `gap_confirmed` rows that did not come from a CSV import. The next request checks them again. The automatic backup runs before the migration. |
| `frontend_nextjs/src/lib/backtest/candles/dataHoles.ts` | `unexplainedHoles` finds ranges without candles in trading hours (at least 30 minutes, not already in `missing`). The run log shows a WARN for each (BKT-27). |
| `frontend_nextjs/src/lib/backtest/candles/loadRates.ts` | A page with `missing` reason `syncing` is requested again up to 3 times, 2 seconds apart. |

## Why
- A tick proves the market was open. Only the Bid flag counts, because M1 candles are built from Bid ticks.
- The 7-day limit stops an old hole that stays empty from keeping the request in `syncing` for ever.
- The alternative, no migration, would leave the old wrong pauses in the database for good.
- The frontend warning exists because some holes cannot be repaired (the terminal never gets the data). The backtest result is still valid, but the log must say why it can differ from MT5.

## Verification
- `pytest worker_python/tests/api/test_market_db_api.py`: five new tests (Bid tick, ask-only tick, tick after the pause, old hole, migration) for ANA-04.
- Playwright logic test `backtest-data-holes-lib.spec.ts` for BKT-27.
- Open: acceptance on the VPS after the update (window P7: unmatched trades 7 to 6; window P6+ stays at 2).
