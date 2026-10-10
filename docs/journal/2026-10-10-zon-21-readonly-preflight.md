---
date: 2026-10-10
author: Codex
type: diagnosis
status: open
pr: [145]
features: [ZON-21]
areas: [ops, docs]
---

# ZON-21 preflight blocked by access

## Request

- Start ZON-21 with a read-only preflight.
- Verify an isolated DEMO account, a stopped bot, no positions or pending orders, and an open market.
- Preserve existing trading activity, account logins, credentials and worker processes.
- Keep B4 open and outside this check.
- On 2026-10-10, the owner deferred ZON-21 until Monday, 2026-10-12, after the selected symbol's market opens.
- Continue the next independent open task in a new session. This decision does not schedule an automatic trading run.

## Cause

| Observation | Result |
|---|---|
| Local dashboard in Chrome | The connection badge showed `API anahtarı geçersiz`. No account was selected or loaded. |
| Local dashboard in the in-app browser | The connection badge showed `API-Key abgelehnt`. No account was selected or loaded. |
| Existing VPS window, first check | The screenshot showed a black screen. It supplied no terminal or trading evidence. |
| Existing VPS window, repeat on 2026-10-10 | The selected terminal showed the local test account as DEMO, open positions, and at least four pending orders. |
| Local read-only SSH status, repeat on 2026-10-10 | The worker was reachable on `main` at `fb63d0e1` (`v0.7.193`). Three bot processes and four terminals ran. The test account matched one bot process. |
| Root cause of blocked isolation | The test account has active trading state. The rejected frontend API key remains unexplained. No credential was inspected or changed. |

## Verification

| Check | Result |
|---|---|
| First checkout | `git rev-parse --short HEAD` returned `59973d7`; `git status --short --branch` showed clean `main` before the first documentation change. |
| First frontend view | The dashboard showed `v0.7.190`. This did not verify the worker version. |
| Repeat checkout and frontend view | The local checkout and Chrome dashboard showed `v0.7.193`; the SSH status showed worker `v0.7.193`. |
| DEMO account and isolation | The local test profile declares DEMO, and the already logged-in terminal confirms a DEMO account. Isolation failed because that account has active trading state. |
| Stopped bot | Failed: the read-only SSH status shows a bot process for the test account. This is a process check, not a fresh account metrics response. |
| No positions or pending orders | Failed: the terminal's Trade tab shows multiple open positions and at least four pending orders. Exact totals were not established. |
| Open market | Not verified: no current authenticated symbol status was available. The market gate remains for Monday. |
| Trading test | Not executed. This session authorizes only the read-only preflight. |
| Other tests | Not executed, as requested. No feature behavior changed. |
| Safety | No bot action, order, position, account switch, credential edit or worker restart was performed. |
| Manual result | No pass or failure was signed. A blocked preflight does not prove a feature defect. |

## Monday check

| Gate | Pass criterion |
|---|---|
| Access | Chrome loads an authorized account view; the worker identifies the selected account as DEMO. |
| Isolation | A current account status shows no running bot. The terminal shows zero positions and zero pending orders for that same account. Preserve the present activity; do not clear it to make the gate pass. |
| Market | The selected symbol reports an open market with a current quote before any trading step. |
| Test setup | Read and preserve the complete settings and zone states. Use only an isolated DEMO account and a new appended BUY fractal zone with `fractal_next_loss=1` and `fractal_next_loss_mode=money`. |
| Gate behavior | After the first BUY fill, no new BUY pending order exists while the latest BUY profit is above −1 in account currency. The bot log reports `Sonraki emir` and `zarara geçince konacak`. At or below −1, BUY pending orders return on the latest eligible fractals. |
| Finish | Compare the final settings and zone states with the saved state. Record the resulting position and pending-order state. Sign ZON-21 only after observing the behavior and an authorized safe finish. |

The Monday trading steps require the owner's explicit authorization. This document does not authorize a bot action, a settings save, or an order.

## Open points

- [ ] Restore authorized Chrome access for account metrics without changing credentials in this check.
- [ ] Use an isolated DEMO account. The current test account has a running bot, positions, and pending orders.
- [ ] Repeat the account and order checks immediately before the trading test; today's evidence cannot certify Monday's state.
- [ ] Retry on Monday, 2026-10-12, after verified market opening and restored read-only access in Chrome.
- [ ] Obtain explicit user authorization for orders and bot start before the ZON-21 trading test.

## Lessons

A reachable frontend and its version do not prove authenticated worker access or an isolated DEMO account.
Preserve the earlier isolation warning until current account and trading evidence resolves it.
Account, bot and order checks can run while the market is closed. The complete trading test requires an open symbol market.
