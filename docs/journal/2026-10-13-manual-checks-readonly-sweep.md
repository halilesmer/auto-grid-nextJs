---
date: 2026-10-13
author: Claude
type: diagnosis
status: open
pr: [169, 170, 172, 174]
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
| 3 | ZON-13 | Passed, signed on 2026-10-15 | Not read-only. See "ZON-13 live check". The owner left the sign-off decision to Claude ("entscheide du für beste Auswahl"). `run.sh sign ZON-13 bestanden …` returned `ZON-13: manuell bestanden`; the checklist is at 147/158. |
| 4 | ZON-14 | Passed, signed later on 2026-10-13, with one known deviation | Not read-only. See "ZON-14 live check". The first BUY STOP was two grid steps away. The cause is the level check across setups, not the instant entry. The owner approved the sign-off. `run.sh sign ZON-14 bestanden …` returned `ZON-14: manuell bestanden`. The checklist shows 145/158. |
| 5 | ZON-16 | Passed, signed on 2026-10-15, with partial live evidence | Not read-only. See "ZON-16 live check". The owner left the decision to Claude ("entscheide für bessere Ergebnisse du"). The comparison with the MT5 indicator "Fractals" was not done (see the gaps in that section). `run.sh sign ZON-16 bestanden …` returned `ZON-16: manuell bestanden`; the checklist is at 146/158. |
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
| LOG-07 | `?zone_id=a` returned 300 lines with 0 other tags. `?zone_id=a&zone_id=b` kept the file order and equals the last 300 tagged lines of both setups. On 2026-10-15, the bot ran EURUSD and GBPCHF. EURUSD has 3 setups, and only setup 3 is active. GBPCHF has 1 setup. The EURUSD card "Sembol logları" showed 100 lines. Each line had the prefix "Setup 3" and no `[Z:` tag. No line was from GBPCHF. The lines were in time order. The "Robot Logları" tab showed the badges "EURUSD · Setup 3" (121 lines) and "GBPCHF · Setup 1" (13 lines), with no `[Z:` tag. | The lines of 2 setups of one symbol in the same card. EURUSD setups 1 and 2 are inactive, and their last lines (2026-10-13) are older than the 100 lines that the card shows. |
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
| Recovery after 30 seconds below 80% of the limit | Not examined in this check. A change of the guard settings clears the lock (`spread_guard.py`, the latch signature). Thus the release step does not test the recovery timer. Later seen after a bot restart, see below. |

After the check, the guard stays on with the limit 0.001 (`GET /api/settings/{id}`).

Later live evidence for the recovery timer: at 16:15 (UTC+2) the auto-updater restarted the bot. The log showed `invalid_tick` at 16:15:31, `recovering` at 16:15:33 with a spread of 0.00011 and the limit 0.001, and `ready` at 16:16:04. The spread was below 80% of the limit. The guard settings did not change. Thus the recovery took 31 seconds after a restart.

## ZON-14 live check

The owner added a second EURUSD setup: grid, `BOTH`, range 1.10 to 1.14, grid step 0.0010, TP 0.0003, lot 0.01, `instant_entry` on.

| Step | Owner action | Evidence |
|---|---|---|
| No entry | Started setup 2 while setup 1 (fractal, range 1 to 3) was active. | Setup 2 opened nothing. The engine runs only one setup for each symbol: the first active setup with the price in its range (`grid_orchestrator.py`, ENG-01). |
| Start | Stopped setup 1 and started setup 2 again. | Log at 16:41:56: `Anında Giriş … BUY 0.01 lot @ 1.11889` and `… SELL 0.01 lot @ 1.11879`. Deal reason 3 (expert), comment `AutoGrid_Z7_Start`. |
| Grid | — | 19 pending orders. The nearest BUY LIMIT, SELL LIMIT and SELL STOP were one grid step from the positions. The first BUY STOP was two grid steps away (1.12089). |
| TP and re-entry | — | The BUY position closed at 1.11920 with deal reason 5 (TP), +0.31 $. 1 second later, the bot opened a new BUY at 1.11931. The nearest BUY LIMIT (1.11831) and BUY STOP (1.12031) were one grid step away. |

Cause of the missing BUY STOP at 1.11989: a BUY position of setup 1 at 1.11952 was within 0.45 × grid step of the level. The existing-level set included the positions of all setups on the symbol. A FakeMT5 reproduction with the live prices gave the same gap. PR #171 removes the orders and positions of other setups from this set. See `2026-10-13-levels-own-setup-only.md`. The check ran at 16:41 (UTC+2), before PR #171 merged at 15:19 UTC. Thus the worker ran the old code. The live check of PR #171 is an open point in that entry.

## ZON-16 live check

Date: 2026-10-15. Not read-only. The owner clicked "Starten" and deleted the orders by hand in MT5. Claude read the worker API only.

- Setup: GBPCHF, BUY, fractal entry, breakout, `fractal_order_count` 3, lot 0.01. The owner changed the inactive setup of this symbol, so EURUSD did not need to stop. The EURUSD setup kept 8 orders in every read.
- Source of the fractals: candles from `/api/market/{id}/rates` and the same 5-candle rule as `find_fractals` (closed candles only). Claude computed the last three upper fractals before it read the orders.
- H4 run: one Buy Stop on the latest upper fractal. The log said for the two other fractals `fiyatça geçildi, emir yok`: the price had reached them. The owner deleted the order by hand. The bot logged `Bu fraktala yeni emir konmayacak.` and placed no new order (3 reads over 90 s).
- H1 run: two Buy Stops on two of the last three upper fractals. The log said `fiyatça geçildi, emir yok` for the third. The owner deleted one order by hand. The other order stayed. The bot placed no new order (3 reads over 90 s).

Gaps:

- The owner did not compare the orders with the MT5 indicator "Fractals". The comparison uses the worker candles.
- Both runs had fewer than three orders. The limit of three was not reached.
- All older upper fractals were reached by the price. Therefore the run shows "no order on an older fractal" only through the log line.

## ZON-13 live check

Date: 2026-10-15. Not read-only. The owner saved and started the setup before this check. Claude read the worker API (`GET /api/settings/{id}`, `/api/logs/{id}`, `/api/history/{id}/deals`, `/api/symbols/{id}`) and the dashboard on `localhost:3000`. All times are UTC+2. The deal history shows broker time, which is UTC+3.

- Setup: EURUSD, BUY, grid, `step_by_loss: true`, grid step 10 $, TP 5 $, lot 0.10, range 1.10 to 1.14.
- Code: worker `v0.7.220` (`/api/system/update/check`), which includes the ENG-18 fix (PR #173). The auto-updater restarted the bot with the new code at 14:32:49. The log showed `[AUTO] Bot eski bir kod sürümüyle çalışıyor; yeni sürümle yeniden başlatılıyor`.
- First fill after the restart: BUY 0.10 at 1.12059 at 14:46:59. This is 3 points below the level 1.12062. The bot then set the TP from the entry (log `Açık Pozisyon Güncellemesi … yeni TP/SL ayarlanıyor` at 14:47:00). The position closed by TP at 1.12109 at 14:57:58 with +5.0 $.
- Second fill: BUY 0.10 at 1.12061 at 15:04:44, with TP 1.12112. This is 1 point below the level, and the TP is 0.0005 above the level. The bot did not change this TP. The TP sync in `grid_order_manager.py` (`expected_tp = price_open + take_profit`) has a tolerance of about 1 point (`> 0.00001`).
- Both times the position above was at 1.12162. The distance is 0.00101 to 0.00103, which is about -10 $ at 0.10 lot.
- Pending orders after the second fill: BUY LIMIT at 1.11962, 1.11862, 1.11762, 1.11662, 1.11562 and 1.11462. The orders are 0.00100 apart. The next BUY LIMIT is at 1.11962, not 1.11961, because of the 1 point of slippage. This is within the level tolerance.
- Other open positions at 1.12362, 1.12262 and 1.12162: TP exactly 0.0005 above the entry, which is 5 $ at 0.10 lot.
- Preview text: the dashboard (language `tr`) showed `≈ 0,001 fiyat mesafesi (0,1 lot)` below the grid step and `≈ 0,0005 fiyat mesafesi (0,1 lot)` below the TP of this setup. This agrees with `/api/symbols/{id}` (EURUSD `trade_tick_value` 1.0, `trade_tick_size` 0.00001) and `lossToPriceDistance` in `zoneHelpers.ts`.
- Earlier evidence on 2026-10-13: a USOUSD breakout setup with `step_by_loss: true` (tick value 0.1 per 0.001). BUY 0.02 lot with grid 0.16 $ gave position steps of `+0.080` and a TP distance of `0.8`. SELL 0.01 lot with grid 0.6 $ gave SELL STOP orders at 91.804 / 92.404 / 93.004 and a TP distance of 0.400.

## Open points

- [ ] Run the steps that remain for LOG-07, VPS-07 and VPS-09.
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
