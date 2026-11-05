---
date: 2026-11-05
author: Claude
type: diagnosis
status: open
pr: [370, 371, 372, 374, 375]
features: [BKT-16, BKT-17, BKT-18, ANA-23]
areas: [frontend, worker, tests]
---

# Backtest checked against real DEMO trades

## Request
Check if the browser backtest gives the same trades as the live bot. Use the real trades of a broker DEMO account. The account has 24 setups (magics 200041 to 200064). This entry records the method, the results of runs 1 to 4, the causes and the open points. Window 4 still runs and is not part of this entry.

## Method
| Item | Value |
|---|---|
| Window 3 | 2026-11-04 07:00 UTC to 2026-11-05 06:29 UTC (end of the window = restart of the worker for an update) |
| Window start | Latest of: deposit on the account, auto update off, first measurement |
| Candles | M1 from the worker, `missing: []` |
| Settings | Spread `candle`, swap on, fill `gap`, path `auto`, start capital 100 000 |
| Live data | Deals archive of the worker (`GET /api/history/{id}/deals`) |
| Code | The app engine (`runJob`, `pairTrades`, `evaluateBtLive`) in Node |
| Rule | Read only. The tests did not change any setting or trade. |

Before the window, the worker had no auto update (`AUTO_UPDATE_MINUTES=0`). An update restart in the window would have changed the settings and the order state.

Pairing (BKT-16): `pairByOrder` pairs a live trade and a backtest trade by side and order level first. Then it uses the smallest time gap (1 h maximum). The rest is paired by order and time.

Criteria for one setup (`evaluateBtLive`):

| ID | Rule |
|---|---|
| K1 | Trade count: \|BT − live\| ≤ max(1; 5 % of live) |
| K2 | Same M1 candle of the entry in at least 90 % of the pairs |
| K3 | Same exit reason (TP or SL) in all pairs |
| K4 | Net BT ≤ net live + max(0.50; 0.5 % of the sum of \|live net\|). The backtest must never be better than live. |

Rating: zero trades on both sides = not rated. Fewer than 5 trades (maximum of live and BT) = too few trades. Otherwise K1 to K4 apply.

Live trades that opened before the window start are excluded. Run 4 adds them as start state (`initialPositions`, `initialFractalDone`).

## Results
Window 3, all 24 setups.

| Run | Engine | Passed (rated setups) |
|---|---|---|
| 1 | Pairing by order and time, strict tolerance | Fails on one setup (XAUUSD): −15.0 % net, 215 of 222 trades paired |
| 2 and 3 | Pairing by level (PR 371), K1 to K4 | 6 of 17 (same rules on the raw values); first report counted 0/0 and few-trade setups as passed |
| 4 | Engine of PR 372 (carry spread, SL slip, start state) | 8 of 18 |
| 4, check run | Run 4 with spread `max(candle, symbol)` | 12 of 18 |

Run 4: 4 setups have too few trades, 2 setups have no trades.

Passed in run 4: 200041, 200042, 200043 (XAUUSD), 200051, 200055, 200060, 200061, 200064.
In the check run these also pass: 200045, 200048, 200052, 200057. Fails remain for 200044, 200046, 200047, 200050, 200054 and 200058.

The check run is valid only for this window. One window cannot show over-fitting.

A long window (2026-11-02 18:22 UTC to 2026-11-05 06:29 UTC) for 6 setups with few trades gave: 1 passed (200049), 1 failed (200063, net 285.20 against 282.45 live), 4 still with too few trades.

## Cause
Each cause is read from candle values. No tick data was used.

| # | Cause | Effect |
|---|---|---|
| 1 | The spread in a candle is smaller than the live spread. The candle holds the value at the end of the candle. | A one-point touch of a level fills in the backtest or not, and live the reverse. One missing fill moves the next trades (chain). Seen on USOUSD and USDJPY. |
| 2 | Spread peaks in the rollover (about 22:00 to 23:00 UTC). On EURCHF the spread was 109 to 194 points. | The live bot fills at the real ask. The backtest uses the candle value and the better `gap` price. About 38 of 42.8 USD of the net difference on one setup. |
| 3 | SL fills worse live than at the level. | The backtest closed an SL at the level. PR 372 adds half the candle spread. |
| 4 | Empty start state. Live positions were open before the window. | Pairs shifted, SL trades missing in the backtest. Also the `max_positions` limit and fractal places differed (cascade on 200054, 200055, 200058). |
| 5 | Pairing by order and time paired trades with a large gap in entry time. | False exit reasons in K3. PR 371 pairs by level first. |
| 6 | Live TP trades earn more than the TP level (slip in the profit direction, about 0.09 USD of 2.50 USD on gold). | A small systematic gap in the net. This is noise, not an error. |

One "no money" cause was ruled out: after the deposit, the bot log shows no "deleted [no money]" line in the window.

## Solution
| PR | Change |
|---|---|
| 370 | Worker fixes of test week 2: margin metrics, 10018 throttle, `market_db` WAL race |
| 371 | Pairing by order level and K1 to K4 evaluation (BKT-16) |
| 372 | Engine without an advantage over live: carry spread, SL slip, start state (BKT-17) |
| 374 | Tick route for the backtest comparison (ANA-23) |
| 375 | Default spread `max` instead of `candle` (BKT-18) |

Details of each change are in the entries `2026-11-05-backtest-live-pairing-by-level.md`, `2026-11-05-backtest-engine-no-optimism.md`, `2026-11-05-backtest-default-spread-max.md` and `2026-11-05-testweek2-bot-fixes.md`.

## Why
- K4 is one-sided. An optimistic backtest is dangerous. A backtest that is worse than live is safe. A symmetric limit would hide the real risk.
- The run 4 check uses a mode that already existed (`SpreadSetting` mode `max`). It needs no engine change. It shows that the spread is the main cause. PR 375 makes this mode the default.
- Rejected: a wider tolerance for gold. The systematic gap (cause 6) is about 0.09 USD of 2.50 USD per TP trade. Decide this after the tick proof.
- Rejected: a start state with pending orders. The bot places its own orders again after the start.

## Verification
- Window 3 runs: script exit code 0, M1 candles complete (`missing: []`), start state from live deals.
- The causes are not checked against ticks. They are read from candle values and from the trade lists.
- Margin: the backtest does not calculate margin. The live margin level is not recorded in the window.
- The account hedging mode is not checked.

## Open points
- [ ] Prove the causes with ticks (ANA-23) after window 4 ends. Window 4 started 2026-11-05 06:29 UTC and runs to about 2026-11-06 06:30 UTC.
- [ ] K2 is too strict for setups with few trades. One pair changes the 90 % rule on 5 to 10 trades. Decide a minimum count or a different rule.
- [ ] Setups with too few trades (200049, 200053, 200056, 200059, 200062, 200063) need a longer window. A window from 2026-10-29 is not usable. The zone registry has no settings history.
- [ ] Save a settings snapshot (hash) at the start of each test run.
- [ ] A zone of the XAUUSD setups is below `min_price`. Check it.
- [ ] Switch auto update on again after window 4 (`AUTO_UPDATE_MINUTES=5`). Check that `GET /api/system/worker/status` shows `enabled: true`.
- [ ] The backtest is still better than live on 200045, 200050, 200052 and 200063 (K4). Check this again with spread `max` as default.

## Lessons
Set the start state of the backtest from the live deals. An empty start gives wrong pairs and wrong counts.

Turn off auto update before a test window. An update restart moves the orders and changes the data.

Rate a setup with fewer than 5 trades as "too few trades". Do not rate it as passed.
