---
date: 2026-10-28
author: Claude
type: plan
status: open
pr: []
features: [ENG-01, ENG-32, BKT-14, BKT-12]
areas: [ops, worker, docs]
---

# Plan: repeat the live test week after D1 and D2

## Request

Repeat the test week of `2026-10-18-backtest-live-comparison-plan.md` after the fixes D1 (PR #222) and D2 (PR #225, ENG-32). The result of the first week is in `2026-10-28-backtest-live-comparison-result.md`. Claude prepares the week. The bot start needs the explicit approval of the project owner.

## State on 2026-10-28 (read-only checks)

| Item | Finding | Action before start |
|---|---|---|
| Worker version | v0.7.251 (`/api/system/worker/status`); latest on `main` is v0.7.273. Auto update is off (`AUTO_UPDATE_MINUTES=0` since the first week). | Set `AUTO_UPDATE_MINUTES` back to 5 or update by hand (`POST /api/system/update`, admin), restart the worker, check that the version is v0.7.273 or later. |
| Account | DEMO account 7942034 (EightCap demo server). Registered, password stored. | None. |
| Account type | Not readable through the API. The worker reads `margin_mode` at bot start. | Netting account with 2 or more setups on one symbol: the start check (ENG-01, `netting_conflict`) refuses the start. Read the bot log after the start. A refusal ends the test; the account must be a Hedging account. |
| Settings | The account holds 4 setups (GBPCHF 1, EURUSD 3), not the 24 of the first week. The 24 setups exist in the snapshot of 2026-10-20 and the backup of 2026-10-19 (session notes). | Re-enter the 24 setups from the snapshot (same values, new lots from the balance on the start day), save, compare each field with the snapshot. |
| Open positions | 4 positions stayed open after the first week. | Close them or record them, so that they do not enter the compare. |

## Test

| Item | Value |
|---|---|
| Account | Only DEMO account 7942034. No second account. |
| Symbols and setups | Same as the first week: XAUUSD, EURCHF, USDJPY, USOUSD (grid) and EURUSD, GBPUSD, NDX100, GER40 (fractal), 3 setups each, 24 in total. Values from the approved table in the plan of 2026-10-18. |
| Period | Start: the second of the bot start after approval. End: one week later, set by the project owner. Both as broker time (UTC+3), to the second. |
| Merge freeze | No restart of the worker during the week. Auto update stays off after the update to v0.7.273 or later. |
| Settings | No change during the week. |

## What the week must show

1. D1: all 3 setups of a symbol trade. Pass: each of the 24 magics has at least 1 live trade, or a log line that shows why its price range was not touched. Fail: a setup without trades while the price is inside its range.
2. D2: no permanent lock. Pass: after the session start, rejects with retcode 10018 may appear in the log, but no "Bölge güvenliğe alınıyor" follows, and the zone places orders again in the same session. Check the sessions at about 01:00 and 00:03 broker time, and the Sunday open.
3. No restart: worker uptime covers the full week.

## Evaluation

- Archive the deals (`GET /api/history/{id}/deals`) and check that M1 coverage is `complete` for each symbol.
- Run the backtest with the snapshot settings of the new week, in 4 runs of 2 symbols with 3 setups. Use the exact start and end second (BKT-15). Spread mode `candle`, `closeAtEnd` off, swap on.
- Compare as in the first week and save the report with BKT-14.
- Tolerance, unchanged: same trade count per symbol, entry in the same M1 candle, price within ±0.5 spread, profit within ±5 %.
- Known causes that stay (D3 spread, D4 candle order, D5 rollover spread, D6 stop slippage) are not defects. Count only differences without a known cause.
- Because up to 3 setups now trade at one time, the margin use is higher than in the first week. Record the lowest margin level.

## Open points

- [ ] Update the worker to v0.7.273 or later and check the version.
- [ ] Check the account type (Hedging needed).
- [ ] Enter the 24 setups and calculate the lots from the balance on the start day.
- [ ] Approval of the bot start by the project owner (`hooks/RULES.md` §3).
