---
date: 2026-10-13
author: Claude
type: diagnosis
status: open
pr: []
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
| 1 | ZON-21 | Open, needs the owner | The check adds a fractal zone, starts the bot and waits for a fill. |
| 2 | ENG-31 | Open, needs the owner | The settings show no setup with `spread_guard.enabled: true`, and `metrics.spread_guards` is `{}`. The check sets a limit below the current spread. |
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
| 15 | VPS-02 | Open, needs the owner | Not read-only. |
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

Safety: no trade, bot action, settings save, order, position change or worker restart occurred. The sweep sent `/rates`, `/deals` and `/symbols` only for the account with a running bot, so no terminal changed its account. These routes write to the cache `data/market.sqlite` (ANA-04, ANA-07).

## Open points

- [ ] Run the steps that remain for ZON-13, ZON-16, LOG-07, VPS-07 and VPS-09.
- [ ] Run the checks that need the owner (table "Verification").
- [ ] Prepare a symbol with 2 setups and trades for LOG-07 and ANA-14.
- [x] Prepare pending orders of a legacy setup for ENG-29, or close ENG-29 as not testable any more. ENG-29 has no manual tier now. See `2026-10-13-eng-29-and-update-task-running.md`.
- [x] Find why `AutoGrid-Update` shows `Running` since 2026-10-10. See `2026-10-13-eng-29-and-update-task-running.md`.

## Lessons

Isolate the DEMO test account before a trading check. A running bot on that account blocks most manual checks. The worker can reject the seed key in `.env.local`, because the browser stores the current key.
