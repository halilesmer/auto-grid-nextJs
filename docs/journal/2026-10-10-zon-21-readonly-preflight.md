---
date: 2026-10-10
author: Codex
type: diagnosis
status: open
pr: []
features: [ZON-21]
areas: [ops, docs]
---

# ZON-21 preflight blocked by access

## Request

- Start ZON-21 with a read-only preflight.
- Verify an isolated DEMO account, a stopped bot, no positions or pending orders, and an open market.
- Preserve existing trading activity, account logins, credentials and worker processes.
- Keep B4 open and outside this check.

## Cause

| Observation | Result |
|---|---|
| Local dashboard in Chrome | The connection badge showed `API anahtarı geçersiz`. No account was selected or loaded. |
| Local dashboard in the in-app browser | The connection badge showed `API-Key abgelehnt`. No account was selected or loaded. |
| Existing VPS window | The screenshot showed a black screen. It supplied no terminal or trading evidence. |
| Earlier isolation evidence | The previous audit recorded existing trading activity. This check does not establish its current state. |
| Root cause | Not established. The frontend reports rejected API access; credentials were not inspected or changed. |

## Verification

| Check | Result |
|---|---|
| Checkout | `git rev-parse --short HEAD` returned `59973d7`; `git status --short --branch` showed clean `main` before documentation. |
| Frontend version | The dashboard showed `v0.7.190`. This does not verify the worker version. |
| DEMO account and isolation | Not verified: authenticated account data was unavailable. |
| Stopped bot | Not verified: authenticated bot status was unavailable. |
| No positions or pending orders | Not verified: neither browser nor terminal supplied current trading state. |
| Open market | Not verified: no authenticated symbol status or usable terminal view was available. |
| Trading test | Not executed. This session authorizes only the read-only preflight. |
| Other tests | Not executed, as requested. No feature behavior changed. |
| Safety | No bot action, order, position, account switch, credential edit or worker restart was performed. |
| Manual result | No pass or failure was signed. A blocked preflight does not prove a feature defect. |

## Open points

- [ ] The owner must make an authorized read-only account view available in Chrome, without changing existing trading activity.
- [ ] Repeat the preflight and verify all five prerequisites with current evidence.
- [ ] Obtain explicit user authorization for orders and bot start before the ZON-21 trading test.

## Lessons

A reachable frontend and its version do not prove authenticated worker access or an isolated DEMO account.
Preserve the earlier isolation warning until current account and trading evidence resolves it.
