---
date: 2026-10-13
author: Claude
type: diagnosis
status: open
pr: [169, 170]
features: [ZON-21, ENG-31, ZON-13, ZON-14, ZON-16, ENG-29, LOG-07, ANA-08, ANA-14, SYS-06, ACC-11, BOT-07, UPD-07, VPS-01, VPS-02, VPS-06, VPS-07, VPS-08, VPS-09]
areas: [docs, ops]
---

# Read-only sweep of the open manual checks

## Request

- Examine all open manual checks in `docs/features/FEATURES.md` in a fixed sequence.
- Use only read-only checks against the VPS worker and the DEMO test account.
- Do not trade, start or stop a bot, or restart, reboot or update the VPS.
- Sign a result only after the owner approves the evidence.

## Why

Partial evidence does not sign a check. The check stays open, and this entry records the evidence. `run.sh sign` accepts only `bestanden` and `fehlgeschlagen`, so a pass from partial evidence hides the steps that nobody did. The owner approved this rule on 2026-10-13.

## Cause

| Observation | Result |
|---|---|
| Worker access | The worker rejected the seed key in `frontend_nextjs/.env.local` (`HTTP 401`). The browser stored the valid key. The owner replaced the seed key. This explains the rejected key in `2026-10-10-zon-21-readonly-preflight.md` and the `HTTP 401` in `2026-10-11-selectable-spread-guard.md`. After that, `GET /api/system/platform` returned `HTTP 200`. |
| DEMO test account | Not isolated: the bot runs, 50 open positions, 7 pending orders. Each check that adds a zone and starts the bot changes live trading. |
| Worker version | `v0.7.206`, `main` at `361ae673`, 2 bots running, 4 accounts. |
| Scheduled task `AutoGrid-Update` | `GET /api/vps/status` showed state `Running` with `last_run` 2026-10-10 00:11 (VPS local time). The task is on demand only (`setup_vps.ps1`). The cause is not verified. |

## Verification

| # | ID | Result | Evidence |
|---|---|---|---|
| 1 | ZON-21 | Passed, signed later on 2026-10-13 | Not read-only. The owner isolated the DEMO account (see "DEMO isolation"). The owner added an EURUSD M1 rebound BUY setup with lot 0.05 and a limit of 1 $. Then the owner started the bot. After the fill at -0.45 $, the setup had no BUY order. The log showed `Sonraki emir, Bilet <n> en az 1.0 (tutar) zarara geçince konacak.` At -0.65 $ and -0.90 $, the setup had no BUY order. At -1.20 $, the bot placed a BUY LIMIT on the latest fractal again. The owner approved the evidence and the sign-off. `run.sh sign ZON-21 bestanden …` returned `ZON-21: manuell bestanden`, and the checklist shows 143/158. After the check, the bot runs, the setup is active, and the position and the BUY LIMIT stay open. |
| 2 | ENG-31 | Passed, signed later on 2026-10-13, with partial live evidence | Not read-only. See "ENG-31 live check". The owner approved the sign-off with the gaps in that section. This is an exception to "Partial evidence does not sign a check". `run.sh sign ENG-31 bestanden …` returned `ENG-31: manuell bestanden`. The checklist shows 144/158. |
| 3 | ZON-13 | Open, partial evidence | See "Partial evidence". |
| 4 | ZON-14 | Open, needs the owner | No grid setup with `instant_entry` runs. The check adds a zone and waits for a TP. |
| 5 | ZON-16 | Open, partial evidence | See "Partial evidence". |
| 6 | ENG-29 | Closed: no manual tier (`2026-10-13-eng-29-and-update-task-running.md`) | All 4 accounts: `legacy_setup_orders` is `[]` or `null`. No log line `Eski fraktal kurgusu`. No legacy setup orders remain. |
| 7 | LOG-07 | Open, partial evidence | See "Partial evidence". |
| 8 | ANA-08 | Open, needs the owner | The check compares with the deal history in the MT5 terminal. `GET /api/history/{id}/deals` returned 4433 deals for 30 days, `missing: 0`. |
| 9 | ANA-14 | Open, prerequisite missing | No symbol has 2 registered setups with trades. The zone register shows EURUSD magic 200003 with `deleted_at` 25 s after `created_at` (2026-10-02, before this sweep). It has 0 trades. |
| 10 | SYS-06 | Open, needs the owner | The check reboots the VPS and toggles the MT5 Python integration. |
| 11 | ACC-11 | Open, needs the owner | Not read-only. |
| 12 | BOT-07 | Open, needs the owner | Not read-only. |
| 13 | UPD-07 | Open, needs the owner | Not read-only. |
| 14 | VPS-01 | Passed, signed | `GET /api/vps/status` (local route) returned `HTTP 200`, worker reachable, ngrok running, 2 bots. The page `/vps` showed all 6 tiles green. The check step is only "open the page". The "Gestoppt" result applies only to a stopped worker; the e2e test covers it. The owner approved this evidence and the sign-off on 2026-10-13. |
| 15 | VPS-02 | Passed, signed later on 2026-10-13 | Not read-only. The owner did the steps. See `2026-10-13-eng-29-and-update-task-running.md`. |
| 16 | VPS-06 | Open, needs the owner | Not read-only. |
| 17 | VPS-07 | Open, partial evidence | See "Partial evidence". |
| 18 | VPS-08 | Open, needs the owner | Not read-only. |
| 19 | VPS-09 | Open, partial evidence | See "Partial evidence". |

## Partial evidence

| ID | Confirmed (read-only) | Steps that remain |
|---|---|---|
| ZON-13 | USOUSD setup, `step_by_loss: true`, tick value 0.1 per 0.001. BUY 0.02 lot: grid 0.16 $ gave position steps of `+0.080` and TP distance `0.8`. SELL 0.01 lot: grid 0.6 $ gave SELL STOP at 91.804 / 92.404 / 93.004 and TP distance 0.400. | The exact protocol (EURUSD, 0.10 lot, 10 / 5), the preview text in the frontend, and the rule "next position at −10 $". The USOUSD setup is a breakout setup. |
| ZON-16 | EURUSD fractal setup, M1, rebound, `fractal_order_count: 5`. M1 candles from `/api/market/{id}/rates`, fractals from `find_fractals`. The 2 unreached lower fractals had a BUY LIMIT each. Older fractals had no order. The filled upper fractal got no new order. Max. 5 orders for each side. | Direction BUY with count 3, the comparison with the MT5 indicator "Fractals", and a manual delete in MT5. |
| LOG-07 | `?zone_id=a` returned 300 lines with 0 other tags. `?zone_id=a&zone_id=b` kept the file order and equals the last 300 tagged lines of both setups. | A symbol with 2 setups, the symbol card "Sembol logları", and the badge in the "Robot-Log" tab. |
| VPS-07 | Step 1: `elevated: []` and no admin warning on `/vps`. | Step 2: start `start.bat` as administrator, then "Admin-Prozesse beenden". |
| VPS-09 | `GET /api/system/worker/status` and `GET /api/system/worker/log` returned `HTTP 200`. The worker sends ANSI color codes; `VpsOnlinePanel.tsx` removes them with `stripAnsi`. | The Vercel version and "Worker neu starten". |

Safety of the read-only sweep: no trade, bot action, settings save, order, position change or worker restart occurred. The sweep sent `/rates`, `/deals` and `/symbols` only for the account with a running bot, so no terminal changed its account. These routes write to the cache `data/market.sqlite` (ANA-04, ANA-07).

## DEMO isolation

Later on 2026-10-13, the owner did these steps before the trading checks:

1. Stopped the bot. The log showed `[STOP] Bot süreci durduruldu.`, and `GET /api/vps/status` listed only the bot of the other account.
2. Closed all positions and deleted all pending orders in the MT5 terminal of the account. The owner confirmed 0 positions, 0 orders, and equity equal to balance.
3. Deactivated or deleted the old setups. Before the owner added the ZON-21 setup, `GET /api/settings/{id}` showed one inactive setup.

When the bot is stopped, `GET /api/logs/{id}` returns the last metrics file of the bot. The values do not show the current MT5 state. The WebSocket stream sent `LIVE_DATA` with `mt5_connected: False`. The API process was not connected to the terminal of this account, and the stopped bot wrote no metrics. Thus the owner confirmed step 2 in the MT5 terminal.

## ENG-31 live check

The owner used the ZON-21 EURUSD setup. The account had 0 positions and no manual order.

| Step | Owner action | Evidence |
|---|---|---|
| Block | Set the fixed spread limit to 0.000001 and saved. | `metrics.spread_guards` showed `blocked: true` and `reason: high` at a spread of 0.0001. The bot pending orders went from 3 BUY LIMIT orders to 0. The bot placed no new order while the guard blocked. |
| Release | Set the limit to 0.001 and saved. | The `Spread koruması` log line showed `ready` with the limit 0.001. Then the bot placed 3 BUY LIMIT orders again. |
| Unit tests | — | `run.sh unit ENG-31` returned 42 passed. |

| Part of the check | Evidence |
|---|---|
| Valid tick with a confirmed broker time offset | Live: the guard read a spread and showed `high`, not `invalid_tick`. |
| Old, future and single unchanged ticks, account switch, restart | Unit tests only. |
| Manual order and open position stay | Not examined. The account had none. |
| Only the orders of this setup disappear | Not examined. The account had only one active setup. |
| Recovery after 30 seconds below 80% of the limit | Not examined. A change of the guard settings clears the lock (`spread_guard.py`, the latch signature). Thus the release step does not test the recovery timer. |

After the check, the guard stays on with the limit 0.001 (`GET /api/settings/{id}`).

## Open points

- [ ] Run the steps that remain for ZON-13, ZON-16, LOG-07, VPS-07 and VPS-09.
- [ ] Run the checks that need the owner (table "Verification").
- [ ] Prepare a symbol with 2 setups and trades for LOG-07 and ANA-14.
- [ ] Show the worker `detail` when "save all" fails (`mergeAndSaveSettings` in `useSettingsStore.ts`).
- [x] Prepare pending orders of a legacy setup for ENG-29, or close ENG-29 as not testable any more. ENG-29 has no manual tier now. See `2026-10-13-eng-29-and-update-task-running.md`.
- [x] Find why `AutoGrid-Update` shows `Running` since 2026-10-10. See `2026-10-13-eng-29-and-update-task-running.md`.

## Lessons

Isolate the DEMO test account before a trading check. A running bot on that account blocks most manual checks. The worker can reject the seed key in `.env.local`, because the browser stores the current key.

The fractal distance switch (`zone.fractal.nextLossByPips`, "Grenze in Pip" on Forex symbols) keeps the number when it changes the unit. On a Forex symbol with the switch on, 1 is 1 pip. With the switch off, 1 is 1 $. After you save a fractal setup, read `fractal_next_loss_mode` in the settings. In the ZON-21 check, the first save had `pips` instead of `money`. A new setup starts with `money` (`zoneHelpers.ts`), and only the switch sets `pips`. Thus the switch was on before the first save.

In the ENG-31 check, "save all" failed 5 times with the same generic message. At the first failure, a `GET` request returned `HTTP 502` when the auto-updater restarted the worker. The worker log has no record of that save. The next 4 failures were `HTTP 422` in the worker log. On "save all", `mergeAndSaveSettings` (`useSettingsStore.ts`) throws the generic text and drops the worker `detail`. The save of a single setup shows the `detail`. The save passed after the owner typed the limit again with a decimal point. A comma in the number field could send no `max_spread`. Then the worker returns `spread_guard: max_spread must be positive and finite`. This cause is not verified. If a save fails, read the status of `POST /api/settings/{id}` in the worker log. For `HTTP 422`, read the `detail` in the browser network tab.

To test the 30-second recovery, do not change the guard settings. A change clears the lock at once.
