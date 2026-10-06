---
date: 2026-09-29
type: diagnosis
status: open
pr: [68, 69]
features: [ENG-25, ACC-11]
areas: [worker, ops]
---

# Order flood: another client deleted the orders

## Request

The owner reported: the flood "occurs often, sometimes after an update". It is an error, not a planned behavior. The cause was outside our code (see below), so there is no `bekannter_fehler` entry.

## Cause

Signature of the flood:

| Source | What you see |
|---|---|
| Robot log | `🌱 Ağ Tazelendi: TP olan/eksik N adet emir yerleştirildi.` every 3–4 s, with N ≈ 8–15. Normal: N = 1–2, and only sometimes. |
| MT5 journal | Hundreds of `order #… done`. The same price ~30 times in 3 min. **No** `cancel order`. Almost no deals. Get it with `GET /api/logs/download/<account_id>` (zip, file `logs/mt5_terminal/MT5_Terminal_<YYYYMMDD>.log`, UTF-16). |
| Order life | Orders live only 2–5 s. The sell limits of one cycle are gone two cycles later. |
| Metrics | `pending_orders` stays small (6–11). |

Diagnosis on 2026-09-29 (DEMO account B):

1. The bot deleted nothing. The robot log and the MT5 journal show no delete.
2. The orders did not stay in MT5 without being visible: stacked buy limits did not fill when the price fell.
3. On the VPS, only the expected processes ran: one worker, one bot for each account.
4. **Root cause (confirmed):** account B was also logged in to an MT5 terminal on a second Windows VPS. An EA or a grid there deleted the orders of our bot. The owner closed that terminal. After this, the orders stayed, and no more "vanished" lines came.

Do not mix it up with the case of 2026-09-24 (account A). There, the bot itself deleted the orders: the MT5 journal showed as many `cancel order` lines as placed orders, and each log line came 5 times. The suspected cause was more bot processes or the partial-fill loop. Claude's notes say that it was fixed later; the PR is not recorded.

## Solution

| PR | Change |
|---|---|
| #68 (ENG-25, v0.7.115) | For each zone and cycle with vanished orders, the bot writes one summary line: the count, the states in the MT5 history and the first ticket. Example: `… bekleyen emir MT5'te kayboldu — bot silmedi, dolmadı (geçmiş durumu: CANCELED×n …)`. Other states: `EXPIRED`, `REJECTED`, `GEÇMİŞTE YOK`. After 10 external deletes in 60 s, the bot pauses the zone: `Emir seli durduruldu: …`. Code: `worker_python/src/core/grid_execution/vanished.py`. |
| #69 (ACC-11, v0.7.116) | The worker does not log in to the terminal of another account. Found on the same day: `initialize()` without a path connected to any running terminal, and the login moved that terminal to a different account. Code: `worker_python/src/utils/mt5_terminal_guard.py`. |

## Verification

- ENG-25 started live three times on 2026-09-29. Each time the history state was `CANCELED×n`.
- Unit tests: `worker_python/tests/unit/test_eng_vanished_orders.py`.

## Open points

- [ ] On the VPS, check that `terminal_info().path` of each terminal is its own installation folder (ACC-11).

## Lessons

- If the flood occurs again, read the `kayboldu` lines first. `CANCELED×n` means: a different client deletes the orders.
- Then ask the owner: does the account also run in a different MT5 terminal, or on a different VPS?
- Check that no terminal changed to the wrong account through `mt5.login()`.
