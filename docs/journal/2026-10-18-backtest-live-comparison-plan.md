---
date: 2026-10-18
author: Claude
type: plan
status: open
pr: [200, 201]
features: [BKT-14, BKT-12, BKT-13, ANA-04, ANA-07]
areas: [ops, frontend, worker, docs]
---

# Compare the backtest with one live demo week

## Request

The project owner wants to know if the backtest gives the same result as the live bot.
Claude makes the setups in the dashboard and lets the bot trade for one week on one DEMO account.
Then Claude runs the backtest for the same week with the same settings and compares each trade.
The app must keep the comparison results, so that the project owner can open them again later (BKT-14).

## Decisions

| Item | Decision |
|---|---|
| Account | Only one account: DEMO account A (the broker's demo server). Claude does not use a second account. |
| Symbols | 8 symbols: XAUUSD, EURUSD, EURCHF, GBPUSD, USDJPY, NAS100, DAX40 (broker name to check), USOUSD. |
| Modes | 4 symbols use the grid mode. 4 symbols use the fractal mode. 2 symbols use the loss gate (ENG-30). |
| Lot size | From the balance at the start. Max. 2 % of the balance as worst-case loss for each symbol. |
| Tolerance | Strict: the same number of trades for each symbol, the entry in the same M1 candle, the price within ±0.5 spread, the profit within ±5 %. |
| Daily check | Automatic, read-only, one time each day. The check does not start or stop the bot. |
| Period | Monday 2026-10-19 market open to Friday 2026-10-23 market close (broker time). |

## Plan

| Phase | Content |
|---|---|
| 0 Preparation | Back up the zones of the account. Make sure that no position and no order is open. Set `AUTO_UPDATE_MINUTES=0` on the VPS for the test week. |
| 1 Setups | Check the symbols, the candle data and the backtest support of each setting. Calculate the value table. The project owner approves it. |
| 2 Start | Enter the setups. Save a snapshot of the settings (with `magic`) and of `VERSION`. Start the bot only after approval (`hooks/RULES.md` §3). |
| 3 Test week | Do not change a setting. Record each restart with its time. |
| 4 Data | Stop the bot. Export the deals (`GET /api/history/{id}/deals`). Make sure that the M1 coverage is `complete` for each symbol. Restore the zones and the auto update. |
| 5 Backtest | Use the snapshot settings. Max. 6 setups in one run, so do two runs (6 + 2). Spread mode `candle`, `closeAtEnd` off. |
| 6 Compare | Pair the trades by `magic`, order and time. Give a cause for each difference. Each logic difference becomes a fix with its own PR. |
| 7 BKT-14 | Develop the report store (API, SQLite table `backtest_reports`, page area "Live-Vergleich"). Done: PR #201, merged on 2026-10-19 before the test week. |

## Why

A merge to `main` makes the worker update itself and restart the bot (BOT-03). A restart rebuilds the state and changes the trades. Thus the auto update stays off for the test week. BKT-14 (PR #201) merged before the start, so no merge is necessary during the test week.

The tunnel watchdog (VPS-10) and the bot watchdog can also restart the bot. Claude does not disable them, because the self-healing is more important. The daily check finds each restart, and the comparison shows it as the cause "restart".

## Open points

- [ ] Phase 0: back up the zones, close nothing, set the auto update to 0.
- [ ] Phase 1: approve the value table.
- [ ] Phase 2: start the bot on Monday 2026-10-19.
- [ ] Phase 3–6: run the test week, the backtest and the comparison.
- [ ] Phase 7: save the report of this week with BKT-14 (merged in PR #201).
