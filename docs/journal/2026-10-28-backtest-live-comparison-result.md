---
date: 2026-10-28
author: Claude
type: diagnosis
status: open
pr: []
features: [BKT-14, BKT-12, ENG-05]
areas: [frontend, worker]
---

# Backtest and live week do not agree

## Request

Run phase 5 and 6 of the plan in `2026-10-18-backtest-live-comparison-plan.md`: backtest the test week with the snapshot settings, compare each trade with the live deals, give a cause for each difference and save the report with BKT-14.

## Solution

| Item | Value |
|---|---|
| Period | 2026-10-20 08:51:57 to 2026-10-28 09:33:18 (broker time, UTC+3) |
| Input | Settings snapshot of 2026-10-20, 24 setups, magic 200013–200036 |
| Run settings | M1 candles from MT5, spread mode `candle`, `closeAtEnd` off, swap on, commission 0 (the deals of the week have no commission), fill `gap`, path `auto` |
| Runs | 4 groups of 2 symbols with 3 setups. Claude ran the app engine (`runJob`, `buildSymbolRows`) in Node with the exact start and end second, because the page only accepts whole days. |
| Live data | `GET /api/history/{id}/deals`, archive without gaps, M1 coverage complete |
| Report | Saved with BKT-14 ("Testwoche 20.–28.10.2026 (24 Setups, Phase 6)"), shown in "Canlı karşılaştırma" |

Result: 0 of 8 symbols pass the tolerance.

| Symbol | Live trades | Backtest trades | Live net | Backtest net | Pairs without deviation |
|---|---|---|---|---|---|
| XAUUSD | 95 | 1444 | +9.56 | −228.66 | 21 of 95 |
| EURCHF | 170 | 299 | −646.69 | −745.51 | 79 of 166 |
| USDJPY | 108 | 234 | +19.14 | −139.06 | 71 of 107 |
| USOUSD | 526 | 862 | −293.29 | −691.60 | 35 of 504 |
| EURUSD | 2 | 101 | +11.83 | −108.28 | 2 of 2 |
| GBPUSD | 2 | 113 | +12.64 | −358.94 | 0 of 2 |
| NDX100 | 7 | 90 | −10.95 | −319.46 | 3 of 7 |
| GER40 | 14 | 93 | −133.88 | −78.71 | 13 of 14 |

## Cause

Each difference has one cause. The order is by effect.

| # | Difference | Cause class | Evidence |
|---|---|---|---|
| D1 | Live traded only setup A of each symbol. Setups B and C (16 setups) have 0 live trades; the backtest gives them 1 187 trades. | Logic difference | `get_active_zone` (`grid_zone_selector.py`) returns the first active zone whose range contains the price. All 3 setups of a symbol cover the price, so B and C never become active. The backtest runs each setup alone. |
| D2 | Setup A stopped for the rest of the week: EURUSD and GBPUSD on 2026-10-21 about 01:03, XAUUSD on 2026-10-21 01:00, USDJPY on 2026-10-26 about 00:03 (broker time). | Logic difference | Bot log: 3 order rejects with retcode 10018 "Market closed" at the session start, then "Bölge güvenliğe alınıyor". The bot sends orders while the market is closed and then locks the zone until a restart. The backtest has no rejects. |
| D3 | Entry and exit price of grid pairs differ by more than 0.5 spread (median 0.06 to 0.9 spread, single fills up to 26 spreads). | Spread | Live fills at the real bid/ask with slippage; the backtest fills at the level. The largest values occur at session start and on news candles. |
| D4 | Entry candle differs for 23 % (XAUUSD) to 38 % (USOUSD) of the grid pairs; USOUSD has 22 live trades without a partner. | Candle resolution | Order of high and low inside one M1 candle is unknown. Live re-places the order window each loop ("Pencere Kaydı"), so one fill can move to the next candle. Not checked trade by trade. |
| D5 | EURCHF has 4 live trades without a partner at 00:12–01:04 broker time. | Spread | The rollover spread is wider than the candle spread of the backtest. |
| D6 | Fractal pairs NDX100 (4 of 7) and GBPUSD (1 of 2): entry price differs by 1.3 to 5.4 spreads. | Spread | Stop orders fill with slippage after a gap. Trade count and candle agree. |

Not found: restart (worker uptime covers the full week), missing data (archive and M1 complete), unsupported setting (no warning from the run).

If only setup A and the time before D2 count, the count, the entry candle and the profit agree well for the fractal symbols (GER40 13 of 14 pairs, EURUSD 2 of 2) and for EURCHF and USDJPY setup A until the lock.

## Open points

Each logic difference is a separate fix task. They are listed here and not fixed.

- [ ] Fix D1: decide if more than one setup of a symbol can be active at the same time. Then change the bot (`grid_zone_selector.py`, `grid_orchestrator.py`) or make the backtest model "first matching setup only".
- [ ] Fix D2: do not count retcode 10018 "Market closed" as a failed order; do not send orders while the session is closed; do not lock the zone for the rest of the run.
- [ ] Repeat the test week after D1 and D2.
- [ ] Small UI defect: the saved report list shows the worker version as "vv0.7.251".
- [ ] The page accepts only whole days for the period. A live comparison needs the exact start and end second.

## Lessons

- Read the bot log for reject and lock messages before the trade-by-trade compare. Two log lines explained most of the difference.
- One week with 3 setups on one symbol did not test 3 setups: the bot activates one setup for each symbol.
