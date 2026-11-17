---
date: 2026-11-17
author: Claude
type: fix
status: open
pr: [591]
features: [VPS-10]
areas: [worker, vps]
---

# Watchdog reboot plus broken auto-login: 4.5 h outage

## Request
The project owner saw that the VPS worker was down for about 4 hours (night of 2026-11-16/17) and asked for a measure that prevents this kind of outage (1117-A1, authority "tam").

## Cause
Found over SSH in `logs/tunnel_watchdog.log`, the Windows System and Security logs and the scheduled task data:

1. 23:43–00:03 (CET): the public ngrok check failed three times (`Unerwarteter Fehler beim Senden`). Each line says `Worker lokal OK`: the worker and the bots ran, only the tunnel check failed. Two ngrok restarts did not help.
2. 00:03:40: `AutoGrid-Tunnel` rebooted the VPS (3 failures in a row).
3. 00:04:32: auto-login failed. Security event 4625 for the user, status `C000006D`, sub status `C000006A` (wrong password). The Windows password was changed on 2026-10-23 (`PasswordLastSet`); the LSA secret that `setup_vps.ps1` stored for auto-login still had the old password. The password expires every 42 days (`PasswordExpires` 2026-12-04), so a forced change will break auto-login again.
4. 00:04–04:33: no user session, so nothing ran. `AutoGrid-Start` has a logon trigger. `AutoGrid-Tunnel` had `LogonType Interactive` and runs only while the user is logged on, so the watchdog was silent too (no log line after 00:03:40).
5. 04:27: a manual reboot; auto-login failed again with the same status. 04:33: RDP logon, `AutoGrid-Start` started the worker.

Root cause: the hardest self-heal action (reboot) depends on auto-login, and auto-login was broken without any sign. A tunnel-only problem became a full outage, bots included.

## Solution
| File | Change |
|---|---|
| `worker_python/ops/windows/tunnel_watchdog.ps1` | `Get-RebootBlocker` blocks the reboot when the worker answers locally (1117-A1.2). New `Test-UserSession` (explorer.exe of the task user in a session > 0): no session → count the failure, `last_result = 'no-session'`, log `KEINE SITZUNG` at most once an hour, no restart and no reboot (1117-A1.3). New `Send-Heartbeat`: optional user variable `HEALTHCHECK_URL`; GET after each good check, POST `<url>/fail` on no session or from 3 failures; the URL is never logged (1117-A1.4). |
| `worker_python/ops/windows/setup_vps.ps1` | `AutoGrid-Tunnel` is registered with `LogonType S4U` (runs without a session, no stored password). The auto-login step sets `PasswordNeverExpires`. A warning when `HEALTHCHECK_URL` is missing. |
| `worker_python/tests/unit/test_vps_automation.py` | 3 new VPS-10 tests, setup test extended; the "save before heal" check now finds the order by index. |
| `docs/windows_start_guide.md`, `docs/features/features.yaml` | Text for the new behavior. |

## Why
- No reboot for a tunnel-only failure: in all logged tunnel-only cases since 2026-10-09, an ngrok restart or time fixed the tunnel; the reboot of 2026-10-09 did not help, and the reboot of 2026-11-17 caused the outage. While the worker answers locally the bots trade, so the UI outage is the smaller damage. A reboot stays allowed when the worker itself does not answer.
- S4U instead of `Interactive`: the watchdog must be able to see the case where auto-login failed. S4U needs no stored password. Rejected: a SYSTEM task that reads the LSA secret and validates it before a reboot (more privilege and code for the same result after A1.2).
- No reboot on "no session": with a wrong stored password a reboot cannot help; it only uses up the reboot budget.
- External heartbeat: nothing on the VPS can report a dead VPS. A dead-man switch (healthchecks.io or similar) notices missing pings. Rejected: a check on the Mac (sleeps at night) and a GitHub Actions cron (delays, public repository).
- `PasswordNeverExpires`: current password guidance does not require periodic changes, and an expiring password silently breaks auto-login.

## Verification
| Check | Result |
|---|---|
| New tests against the old scripts | 4 failed, 12 passed |
| `tests/unit/test_vps_automation.py` with the new scripts | 75 passed |
| PowerShell parser on the VPS (`ParseFile`, both scripts) | parse OK |
| `Test-UserSession` on the VPS (user logged on via RDP, session disconnected) | `True` |
| The "no session" branch and S4U behavior on the VPS | not verified: needs a logoff (stops the worker) or the re-run of `setup_vps.ps1` |

## Open points
- [ ] The project owner runs `setup_vps.ps1 -SkipRepoOwnership` in an admin PowerShell on the VPS (enters the current Windows password): stores the new auto-login password, `PasswordNeverExpires`, re-registers `AutoGrid-Tunnel` as S4U.
- [ ] After that: check over SSH that `AutoGrid-Tunnel` has `LogonType S4U`, that it runs and that `data/tunnel_watchdog.json` is not `no-domain` (user environment under S4U).
- [ ] Optional: create a check on healthchecks.io (period 5 min, grace 10 min) and set `HEALTHCHECK_URL` on the VPS.
- [ ] `.claude/rules/worker.md` still says the watchdog reboots after 3 failures without the new conditions; rule files change only on request.

## Lessons
- A self-heal action must not depend on a mechanism that nobody checks. Before a reboot, ask what brings the system back after it.
- A watchdog that runs only in the user session cannot report a missing session.
