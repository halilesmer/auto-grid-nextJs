---
date: 2026-10-12
author: Codex
type: diagnosis
status: open
pr: []
features: [SYS-03, SYS-07, VPS-10]
areas: [ops, docs]
---

# Tunnel timeout recovered through existing watchdog

## Request

- Diagnose the reported eight-second platform timeout and repair a verified cause.
- Use Chrome and preserve the existing documentation branch and PR #154.
- Preserve credentials, account sessions, bots, positions, pending orders, and worker processes.
- The owner approved analysis, a targeted repair, and review on 2026-10-12.

## Cause

| Evidence | Finding |
|---|---|
| Owner's Chrome profile, first observation | The connection dialog displayed `Timeout 8 s` for `/api/system/platform`. |
| Tunnel log at `2026-10-12 07:24:02` | The public platform request exceeded its deadline. The same watchdog check recorded `Worker lokal OK`. |
| Existing recovery at `2026-10-12 07:24:02` | The watchdog stopped one ngrok process. `run_ngrok_watchdog.bat` restarted ngrok. The agent did not request this action. |
| Ngrok log at `2026-10-12T07:24:05+0200` | A session and tunnel started. |
| Tunnel log at `2026-10-12 07:28:38` | The public endpoint answered again after one failure. |
| Worker log | Twelve `ConnectionResetError` events with `WinError 10054` occurred in `proactor_events.py`, in `_call_connection_lost`. The records lack timestamps. They do not identify the timeout's cause. |
| Confirmed failure boundary | At the timed watchdog observation, public access failed while the local worker answered. The tunnel path was unavailable. |
| Unresolved trigger | The retained logs do not establish why the tunnel path stopped answering. They also do not explain the earlier failed local worker probe recorded in PR #154. |

## Solution

| Area | Result |
|---|---|
| Existing VPS recovery | The existing tunnel watchdog restored public access before the agent's repeat Chrome test. |
| Repository | No runtime code changed. A permanent code correction would require a verified trigger. |
| Existing documentation | PR #154 and its branch remain unchanged. This entry records the later recovery separately. |

## Why

The current connection works. Increasing the browser deadline would not explain the failed public watchdog probe or the earlier local probe.
The existing recovery already restarted ngrok. Another restart would add disruption without resolving the unknown trigger.

## Verification

| Check | Result |
|---|---|
| `git status --short --branch` before diagnosis | Clean `codex/read-only-audit-2026-10-12` at `fcfc2cd`. |
| `gh pr view 154 --json number,state,title,headRefName,baseRefName,url,statusCheckRollup` | Open. Four checks succeeded; the frontend check was in progress. No merge occurred. |
| `GET http://localhost:3000/api/vps/status`, filtered before output | HTTP 200 in 4.59 seconds; `ok=true`, worker listening and reachable. This duration includes SSH and status collection. |
| Repeat SSH status | Installed checkout `v0.7.198`, `main` at `9b9f567a`; two bot processes. Installed checkout does not prove each process's loaded revision. |
| Public `GET /api/system/platform` without a key | HTTP 401 in 0.21 seconds. The worker responded and enforced authentication. |
| Public `OPTIONS /api/system/platform`, production Origin and required headers | HTTP 200 in 0.13 seconds, with an allowed Origin. |
| Chrome, existing connection dialog, `Testen` | Successful authenticated platform response, `win32`. No connection value was saved or changed. |
| Watchdog state through the existing SSH status route | `last_result=ok`, `failures=0`, empty `last_action`; latest successful check `2026-10-12T05:28:37Z`. |
| Agent actions | Read probes only. No deployment, worker start or restart, VPS restart, bot action, account switch, settings save, or trading action. |
| Runtime tests | Not executed. No runtime behavior changed. Current platform probes replace no feature or trading acceptance test. |
| `git diff --cached --check` and journal privacy scan | Exit 0; no secret assignments, tunnel URLs, IPv4 addresses, or account-number patterns found. |
| Manual review against `hooks/RULES.md` section 9 | Documentation only. No authentication, ownership, API contract, concurrency, or trading-state change. |
| Later PR #154 status check | All five checks succeeded. The PR remains open. |

## Open points

- [ ] If the timeout returns, capture simultaneous public and local status codes and durations, with timestamped worker and ngrok events.
- [ ] Establish the trigger before proposing a permanent code correction. Preserve the earlier failed local probe as unresolved evidence.
- [ ] ZON-21 remains outside this diagnosis. Recheck all account and market prerequisites and obtain explicit trading authorization separately.

## Lessons

Compare public and local worker probes at the same time. A listening socket alone does not prove a responsive worker.
Separate the failed path, the recovery action, and the underlying trigger. Recovery does not prove a permanent correction.
