---
date: 2026-10-12
author: Codex
type: diagnosis
status: open
pr: [155, 156]
features: [SYS-03, SYS-07, VPS-10]
areas: [ops, worker, tests, docs]
---

# Platform recovery and blocking update checks

## Request

- Diagnose the reported eight-second platform timeout and repair a verified cause.
- Use Chrome and preserve the existing documentation branch and PR #154.
- Preserve credentials, account sessions, bots, positions, pending orders, and worker processes.
- The owner approved analysis, a targeted repair, and review on 2026-10-12.
- After recurrence, continue that plan and establish a reproducible trigger before changing code.

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

## Initial verification

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

## Recurrence and reproducible defect

| Evidence | Finding |
|---|---|
| PR #154 follow-up | The installed checkout was `v0.7.199` at `b61a723f`. A local worker probe timed out while its socket listened. |
| Tunnel log at `2026-10-12 07:49:17` | Both public and local probes exceeded their deadlines. The watchdog waited and requested no restart. |
| Tunnel log at `2026-10-12 07:53:36` | The endpoint answered again after one failure. |
| Concurrent probes starting `2026-10-12T05:53:32Z` | Public GET without a key returned 401 in 0.21 seconds; OPTIONS returned 200 in 0.21 seconds. SSH status succeeded in 4.26 seconds. |
| Worker log retrieved `2026-10-12T05:54:06Z` | An OPTIONS update check preceded resets. The GET update response appeared between resets, followed by platform responses. Request records lack timestamps and durations. |
| One existing SSH GET update check at `2026-10-12T05:55:28Z` | Successful in 2.42 seconds including SSH. Concurrent public probes returned 401 in 0.12–0.22 seconds. This short check did not reproduce the outage. |
| Chrome repeat | The existing local connection dialog returned a successful authenticated `win32` platform response. No connection values were saved. |
| Source trigger | The admin dashboard requests `/system/update/check` on mount. Its async endpoint called `check_for_updates` synchronously. That helper waits on `git fetch` through `subprocess.run`. |
| Isolated regression | A held update check prevented a second platform request from completing before the check finished. The original code failed the assertion. |
| Proven code cause | A slow synchronous update check blocks the worker event loop, including platform requests. A listening socket cannot establish responsiveness. |
| Historical incident limit | The live logs are consistent with this defect, but cannot prove which request blocked the worker at 07:49. |

## Follow-up solution

| File | Change |
|---|---|
| `worker_python/src/api/system.py` | Await `check_for_updates` through `asyncio.to_thread`, as the update endpoint already does for its blocking helper. |
| `worker_python/tests/api/test_logs_system_api.py` | A concurrent ASGI test holds the external update check and verifies a platform response before releasing it. Tag with UPD-01 and SYS-03. |
| `docs/features/features.yaml` | Specify responsive platform requests during a pending update check. |
| `docs/proje_dosya_krokisi.md` | Document the thread boundary. |

## Follow-up verification

| Check | Result |
|---|---|
| `.venv/bin/python -m pytest tests/api/test_logs_system_api.py -q -k plattform_antwortet`, original code | 1 failed, 18 deselected in 6.17 seconds. Platform responded only after the blocked update check ended. |
| Same regression, repaired code | 1 passed, 18 deselected in 0.44 seconds. The platform response completed while the update check remained held. |
| `scripts/features/run.sh api` | 251 passed in 22.35 seconds. The runner regenerated `results.json` and `FEATURES.md`: 139/157 checked. |
| `scripts/features/run.sh check` and `git diff --check` | Catalog valid with 157 features; diff check exit 0. |
| `npm run lint` and `npx tsc --noEmit` | Exit 0 for both. |
| `pyright worker_python/src/api/system.py worker_python/tests/api/test_logs_system_api.py` | 0 errors, 0 warnings. |
| API contract and manual security review | Admin dependency, authentication, response fields, error handling, and restart behavior remain unchanged. No endpoint or mock contract changed. |
| Load reviewed | Multiple admin browsers and the background updater can check Git while separate bot processes run. Pending Git work must not block platform responses. |
| Installed worker | Not verified with the repair: no deployment or agent-requested restart occurred. The live observations use the original code. |
| Trading state | No bot action, account/login switch, settings save, position change, or order occurred. Two bot processes remained present in status probes. |

## Open points

- [x] Capture concurrent public and local probes and filtered events after recurrence. The watchdog also recorded both paths timing out.
- [x] Establish a reproducible code trigger before correction. A held update check blocks the original platform endpoint.
- [ ] Verify the repair on the VPS only after separate deployment authorization. The historical live request responsible for the outage remains unverified.
- [ ] If timeouts continue after the repair, capture timestamped request durations and a read-only worker stack during the stall.
- [ ] ZON-21 remains outside this diagnosis. Recheck all account and market prerequisites and obtain explicit trading authorization separately.

## Lessons

Compare public and local worker probes at the same time. A listening socket alone does not prove a responsive worker.
Separate the failed path, the recovery action, and the underlying trigger. Recovery does not prove a permanent correction.
