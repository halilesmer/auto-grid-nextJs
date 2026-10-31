---
date: 2026-10-31
author: Claude
type: fix
status: open
pr: [260, 261]
features: [UPD-07]
areas: [worker, ops]
---

# Auto-update stayed off inside the worker process

## Request

On 2026-10-31 the worker on the VPS was at v0.7.289 while `main` was at v0.7.301. The worker ran under the watchdog (`supervised: true`). The owner's session asked for the cause and a fix.

## Cause

The auto-updater did not run at all. `run_auto_updater` returned at its first line because the worker process had `AUTO_UPDATE_MINUTES=0`. No `git` command of the auto-updater ran. Thus `tick()`, `check_for_updates`, `_is_behind_origin` and `execute_git_pull` are not the cause.

Timeline (UTC):

| Time | Event | Source |
|---|---|---|
| 2026-10-19 | `setx AUTO_UPDATE_MINUTES 0` and worker restart for test week 1 | `2026-10-18-backtest-live-comparison-plan.md` |
| 2026-10-28 21:32:40 | Worker start on v0.7.278, directly before the owner reported "`setx AUTO_UPDATE_MINUTES 5` and restart done" | `uptime_sec` in `GET /api/system/worker/status` |
| 2026-10-29 01:18:53 | Worker still on v0.7.278, same start time. `main` had v0.7.279 (21:50:36) and v0.7.280 (22:00:15) for 3 hours. | Read check of test week 2 |
| 2026-10-30 21:11:33 | Worker start on v0.7.289. The log shows `POST /api/system/update?branch=main` → 200 from a browser, then `Started server process`. | Worker log, 2000 lines |
| 2026-10-30 21:29 | The same log has 0 `[AUTO-UPDATE]` lines, also in the 243 lines after the start. | Worker log |
| 2026-10-31 09:31:37 | v0.7.289, `uptime_sec: 44404`, `GET /api/system/update/check` → `has_update: true` | Status response |
| 2026-10-31 09:35:22 | Worker start on v0.7.301 after a manual update | Status response |
| 2026-10-31 10:14 | `auto_update_minutes: "0"`, `tasks.start.last_run: 2026-10-19T16:33:47` (VPS local time), worker on v0.7.301. The last 2000 log lines have 0 `[AUTO-UPDATE]` lines. | `GET /api/vps/status` and `GET /api/vps/logs`, read with the approval of the owner |

Why this shows the value in the process:

- `run_auto_updater` prints `[AUTO-UPDATE] Açık` before its first `await` if `is_enabled()` is true. A normal start writes this line (`2026-10-13-eng-29-and-update-task-running.md`).
- `console_tee._Tee` writes to the log file first, so a console error cannot remove the line. Other startup lines of the same process are in the log.
- `is_enabled()` needs `WORKER_SUPERVISED=1` and a value above 0. The status shows `supervised: true`. Only the value is left.
- The manual path `POST /system/update` does not read this value, so it worked.

The trap: `setx` writes only to the registry. The window of `run_uvicorn_watchdog.bat` keeps the environment from its start. `POST /system/update` and `POST /system/restart` end the process, and the `.bat` loop starts it again in the same window. Only `/vps` → "Worker neu starten" (task `AutoGrid-Start`) and a reboot open a new window. `run_ngrok_watchdog.bat` already reads `NGROK_DOMAIN` from the registry for the same reason.

Two defects hid the state for 3 days:

- `run_auto_updater` returned without a log line, and `tick()` had 3 more silent paths (other branch, up to date, local commits).
- The `/vps` tile shows the registry value, not the value of the process. No read route showed the process value.

Result of the read on the VPS. 2 facts stop the updater, and each fact alone is sufficient:

- The watchdog window dates from 2026-10-19. The task `AutoGrid-Start` did not run after that date, so all later restarts stayed in this window with the value 0.
- The user value in the registry is `0`. Thus a new window also gets 0. The `setx AUTO_UPDATE_MINUTES 5` of 2026-10-28 is not in the user value of the account that `vps.ps1` reads. The reason is not known, because the registry has no history. Possible reasons: a different account, `setx /M`, or a later change back to 0.

Thus the worker with this fix also stays off until the value changes. The fix makes this visible, and it makes a new value work without a restart.

Correction for test week 2: the note "the merge stop did not hold, auto-update is probable" is wrong. The restart at 2026-10-30 21:11 was a manual update from the browser. The premise "each merge restarts the worker" was also wrong for this week.

## Solution

| File | Change |
|---|---|
| `worker_python/src/utils/auto_updater.py` | On Windows the value comes from the registry before each run: user value, then machine value, then the default. `os.environ` is not used there. The loop continues while the value is 0, so `setx` works without a restart. Each run stores its result. The log has a line only when the result changes. |
| `worker_python/src/api/system.py` | `GET /api/system/worker/status` returns `auto_update`: `enabled`, `interval_minutes`, `result`, `detail`, `checked_at`. |
| `worker_python/ops/windows/vps.ps1` | `auto_update_minutes` also reads the machine value, in the same order as the worker. |
| `docs/windows_start_guide.md`, `docs/features/features.yaml`, `docs/proje_dosya_krokisi.md` | New behavior. |

`result` is one of `on`, `off`, `other_branch`, `up_to_date`, `local_commits`, `check_failed`, `pull_failed`. The line `[AUTO-UPDATE] Açık` now also comes when `setx` switches the updater on without a restart. The value `nan` or `inf` counts as the default 5, because `nan` cannot go into the JSON of the status route.

## Why

A change in `run_uvicorn_watchdog.bat` was rejected. `cmd` reads a running batch file by byte offset, and a `git pull` changes the file under the open window. Also, this fix would work only after a restart, and the trap would stay for `setx` without a restart.

The worker reads the registry in Python, so the fix has no effect on the running window. A switch-off no longer costs a restart of worker and bots. This is useful for a test week.

`winreg` is imported in the function. If the import fails, the code is not on Windows and uses `os.environ`. There is no platform flag for tests.

The log line only on a change keeps the 300-line log window usable. `checked_at` shows if the loop still runs.

## Verification

- 12 new tests were red before the fix (`pytest tests/unit/test_vps_automation.py tests/api/test_logs_system_api.py`), among them `test_setx_gilt_auch_im_alten_watchdog_fenster`. The `vps.ps1` test was red before its change.
- The review by the `reviewer` agent found the `nan`/`inf` case and the missing `Açık` line. 3 more tests were red before these 2 fixes.
- The fake registry checks both registry paths as literal values.
- The Codex scan found 2 defects. Both tests were red before the fixes: a `setx 0` during `check_for_updates` did not stop the pull, and an unexpected exception left the old success in the status.
- After all fixes: `pytest tests` → 935 passed. `pyright` on `auto_updater.py` and `system.py` → 0 errors. `tsc --noEmit` → no errors.
- Not verified: the real `winreg` on Windows. The tests use a registry in memory. CI runs on Linux, and the worker does not run on the Mac. The check on the VPS is in the open points.

## Open points

- [ ] Owner: update the worker once by hand ("Update"). The old code in the running process cannot pull this fix while its value is 0.
- [ ] After that, read `auto_update` in `GET /api/system/worker/status`. Expected while the value is 0: `enabled: false`, `result: off`, and the log line `[AUTO-UPDATE] Kapalı: AUTO_UPDATE_MINUTES=0`.
- [ ] Owner, when the auto-update must run: `setx AUTO_UPDATE_MINUTES 5` in a normal PowerShell of the worker account, without `/M`. No restart is necessary. Expected within 5 minutes: `enabled: true`, then `result: up_to_date`, or a pull. Also check `auto_update_minutes: "5"` on `/vps`.
- [ ] Next test week: the value is 0 today, so no step is necessary if it stays 0. After a change to 5, switch off with `setx AUTO_UPDATE_MINUTES 0`, without `/M`. A machine value does not win over a user value. Check `enabled: false`.
- [ ] UPD-07 manual check on the VPS: merge a PR, and wait 5–10 minutes.
- [x] `subprocess.run` in `self_updater.py` has no timeout. A hung `git fetch` stops the loop without a log line. A stale `checked_at` now shows it. This was not the cause here. Done in `2026-10-31-git-timeout-updater.md`.
- [ ] Show `auto_update` on the page `/vps`. This is a visible change, so it needs a design first.

## Lessons

- Do not state that the auto-updater is on from a setting or from a report. The evidence is the log line `[AUTO-UPDATE] Açık` or `auto_update.enabled` of the running process.
- `setx` does not reach an open window. Code that runs for weeks in one window must read such a value from the registry.
- After a `setx`, read the value back (`auto_update_minutes` on `/vps`). "Done" in a chat is not evidence. Here 2 sessions built on a value of 5 that the registry did not have.
- A hypothesis about a value on the VPS stays a hypothesis until it is read. The first version of this entry named the stale window as the probable complete cause. The read showed the second fact.
- A version jump is not evidence for the auto-updater. Read the worker log: a manual update shows `POST /api/system/update`, an automatic update shows `[AUTO-UPDATE] Yeni sürüm bulundu`.
