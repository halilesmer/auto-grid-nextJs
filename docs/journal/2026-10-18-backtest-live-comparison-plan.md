---
date: 2026-10-18
author: Claude
type: plan
status: open
pr: [200, 201, 202]
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
| Modes | 4 symbols use the grid mode. 4 symbols use the fractal mode. 2 setups use the loss gate (ENG-30). |
| Setups | 3 different setups for each symbol, so 24 setups. The owner decided this on 2026-10-19. |
| Lot size | From the balance at the start. Max. 2 % of the balance as worst-case loss for each symbol (the sum of its 3 setups). |
| Tolerance | Strict: the same number of trades for each symbol, the entry in the same M1 candle, the price within ±0.5 spread, the profit within ±5 %. |
| Daily check | Automatic, read-only, one time each day. The check does not start or stop the bot. |
| Period | Monday 2026-10-26 market open to Friday 2026-10-30 market close (broker time). The owner moved the start from 2026-10-19 to 2026-10-26 on 2026-10-19. |

## Plan

| Phase | Content |
|---|---|
| 0 Preparation | Back up the zones of the account. Make sure that no position and no order is open. Set `AUTO_UPDATE_MINUTES=0` on the VPS for the test week. |
| 1 Setups | Check the symbols, the candle data and the backtest support of each setting. Calculate the value table. The project owner approves it. |
| 2 Start | Enter the setups. Save a snapshot of the settings (with `magic`) and of `VERSION`. Start the bot only after approval (`hooks/RULES.md` §3). |
| 3 Test week | Do not change a setting. Record each restart with its time. |
| 4 Data | Stop the bot. Export the deals (`GET /api/history/{id}/deals`). Make sure that the M1 coverage is `complete` for each symbol. Restore the zones and the auto update. |
| 5 Backtest | Use the snapshot settings. Max. 6 setups in one run, so do four runs (2 symbols with 3 setups each). Spread mode `candle`, `closeAtEnd` off. |
| 6 Compare | Pair the trades by `magic`, order and time. Give a cause for each difference. Each logic difference becomes a fix with its own PR. |
| 7 BKT-14 | Develop the report store (API, SQLite table `backtest_reports`, page area "Live-Vergleich"). Done: PR #201 and #202, merged on 2026-10-19 before the test week. |

## Approved values (2026-10-19)

The owner approved these values for the balance of 10 863 USD. The lot sizes are calculated again on the start day. The worst-case loss of a setup is orders x lot x stop-loss distance x money per price unit. For the fractal setups the stop-loss distance is an estimate (3.5 x ATR(14) of the fractal time frame).

| Symbol | Setup | Mode | Key values | Lot |
|---|---|---|---|---|
| XAUUSD | A, B, C | Grid BUY, SELL, BUY | step 3.0, 5.0, 6.0; TP 2.5, 4.0, 5.0; SL 12, 15, 18; 4, 4, 3 orders | 0.01 each |
| EURCHF | A, B, C | Grid BUY, SELL, BUY | step 0.0004, 0.0006, 0.0010; TP 0.0003, 0.0005, 0.0007; SL 0.0020, 0.0025, 0.0040; 4, 4, 3 orders | 0.07, 0.05, 0.04 |
| USDJPY | A, B, C | Grid SELL, BUY, SELL | step 0.10, 0.15, 0.30; TP 0.08, 0.12, 0.25; SL 0.40, 0.50, 0.90; 4, 4, 3 orders | 0.07, 0.05, 0.04 |
| USOUSD | A, B, C | Grid BUY, SELL, BUY | step 0.20, 0.30, 0.50; TP 0.15, 0.25, 0.40; SL 1.00, 1.20, 2.00; 4, 4, 3 orders | 0.17, 0.14, 0.11 |
| EURUSD | A, B, C | Fractal H1 rebound (loss gate 5 USD), M15 breakout, M15 rebound | BUY/SELL orders 1/1, 1/1, 2/1; rr 1.5, 2, 1.5; SL ATR x 1.5 | 0.07, 0.07, 0.10 |
| GBPUSD | A, B, C | Fractal H1 breakout, M15 rebound (SL buffer 0.0003), M15 breakout | orders 1/1, 1/1, 2/1; rr 2, 2, 1.5 | 0.07, 0.14, 0.09 |
| NDX100 | A, B, C | Fractal H1 breakout (loss gate 8 USD), M15 rebound, M15 breakout | orders 1/1, 1/1, 2/1; rr 2, 2, 1.5 | 0.01, 0.02, 0.01 |
| GER40 | A, B, C | Fractal H1 rebound, M15 breakout, M15 rebound | orders 1/1, 1/1, 2/1; rr 2, 1.5, 2 | 0.01, 0.02, 0.01 |

- The price range of each setup is +-5 % of the price on 2026-10-19. Grid setups use 2 levels below and 2 above (3 orders: 2 and 1).
- Worst-case loss for each symbol (sum of its 3 setups) is between 140 and 207 USD. The limit is 217 USD. The total is 1 450 USD, 13.3 % of the balance (limit 16 %).
- Broker names: EightCap calls the Nasdaq index NDX100 and the DAX index GER40. The account type has no commission on these symbols. Swap is on.

## Why

A merge to `main` makes the worker update itself and restart the bot (BOT-03). A restart rebuilds the state and changes the trades. Thus the auto update stays off for the test week. BKT-14 (PR #201, #202) merged before the start, so no merge is necessary during the test week.

Merge freeze: do not merge any PR from Monday 2026-10-26 to Friday 2026-10-30. Each merge to `main` restarts the VPS worker and the bot. Merge this PR before Sunday 2026-10-25.

The tunnel watchdog (VPS-10) and the bot watchdog can also restart the bot. Claude does not disable them, because the self-healing is more important. The daily check finds each restart, and the comparison shows it as the cause "restart".

## Open points

- [x] Phase 0: zones backed up, account cleared (bot stopped, settings emptied, positions and orders closed by the owner).
- [ ] Phase 0: set the auto update to 0 on Sunday 2026-10-25 (`setx AUTO_UPDATE_MINUTES 0` on the VPS, then restart the worker).
- [x] Phase 1: value table approved (2026-10-19). The 24 setups are saved on the account. The bot is off.
- [ ] Phase 1: dry run of the values in the backtest on the week before the start. Calculate the lots again on the start day.
- [ ] Defect found on 2026-10-19: `sanitize_settings` (worker) rounds saved values, for example take-profit 0.0008 became 0.001. The setups use other values. Fix in its own PR, merged before 2026-10-25 or after 2026-10-30.
- [ ] Phase 2: start the bot on Monday 2026-10-26.
- [ ] Phase 3–6: run the test week, the backtest and the comparison.
- [ ] Phase 7: save the report of this week with BKT-14 (merged in PR #201 and #202).
