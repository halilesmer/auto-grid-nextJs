---
date: 2026-10-13
author: Claude
type: fix
status: done
pr: [162, 163, 164, 165, 166, 167]
features: [ENG-29, VPS-02]
areas: [docs, ops, tests]
---

# ENG-29 not testable, AutoGrid-Update task hangs

## Request

- Examine the ENG-29 evidence from `2026-10-13-manual-checks-readonly-sweep.md` again (read-only).
- Find how the catalog records a manual check that cannot run.
- Find why `AutoGrid-Update` shows `Running` since 2026-10-10 00:11 (VPS local time).
- No restart, no update, no task stop and no git on the VPS.

## Cause

| Topic | Cause |
|---|---|
| ENG-29 | The check needs pending orders in MT5 with a comment `AutoGrid_Z{n}_F{k}{U\|D}{zeit}` and `k ≥ 2` (`is_legacy_setup_order`). No running bot reports such orders. New ones do not occur. The check cannot run. |
| Manual result schema | `update_checklist.py --sign` accepts only `bestanden` and `fehlgeschlagen` (line 325). A `manuell` tier is done only with `bestanden` (line 192). No status for "not applicable" exists. |
| `AutoGrid-Update` | `Invoke-UpdateLocal` (`vps.ps1`) sends the output of `start.bat` into a pipe: `& cmd.exe /c "`"$WorkerDir\start.bat`"" \| Out-File $log -Append -Encoding utf8`. `start.bat` opens 2 windows with `start "…" cmd /k …`. Each window inherits the write end of the pipe and stays open while the worker and ngrok run. `Out-File` waits for the end of the pipe. Thus the script does not return, and the task stays `Running`. |
| No time limit | The task settings have `-ExecutionTimeLimit ([TimeSpan]::Zero)` (`setup_vps.ps1`). The Task Scheduler does not stop the task. |
| Effect on update | The task settings have `-MultipleInstances IgnoreNew`. `Invoke-Update` uses the task only when the worker does not run. A new start then probably does nothing (not verified), but `Start-Task` does not fail, so the page `/vps` says that the update runs. |
| Effect on self-healing | None. `Test-UpdateRunning` (`tunnel_watchdog.ps1`) counts the task as an update only for 15 min after `LastRunTime`. |

## Solution

| Change | Detail |
|---|---|
| `Invoke-UpdateLocal` (`vps.ps1`) | Starts `start.bat` with `Start-Process -PassThru` and no pipe, then waits with `WaitForExit(60000)` only for `cmd.exe`. It writes `Worker neu gestartet.`, or after 60 s `start.bat nach 60 s nicht beendet - …`. |
| No `Start-Process -Wait` | `-Wait` waits for the full process tree, thus also for the child windows. Source: PowerShell docs, `Start-Process`, version 7.7. Not verified for 5.1. |
| Time limit 60 s | `start.bat` runs `cleanup_old_instances.ps1` (CIM queries, waits of 300 ms and 1 s), then 2 `start` commands. 60 s is an estimate with much margin, not a measurement. After a timeout, the result `ok` still shows the update result. |
| Cost | The output of `start.bat` and `cleanup_old_instances.ps1` is not in `vps_update.log` any more. It shows only in the `cmd.exe` window, which closes at once. |
| Test | `test_update_local_startet_start_bat_ohne_pipe` (unit, VPS-02) reads `vps.ps1`: no pipe on the `$WorkerDir\start.bat` call, `Start-Process`, `-PassThru`, `.WaitForExit(`, no `-Wait`. |
| Catalog | VPS-02 has the tier `unit` now, and a `pruefung` step for the path through the task. |

## Verification

| Check | Result |
|---|---|
| ENG-29, DEMO account (`GET /api/logs/{id}?log_type=all&lines=2000`) | Bot runs, `metrics.legacy_setup_orders` = `[]`, 0 of 2000 robot log lines contain `Eski fraktal kurgusu`. |
| ENG-29, other 3 accounts (all DEMO, same request) | 2 without a running bot: the field is not in the metrics, so they give no evidence. 1 with a running bot: `[]`. 0 log lines with `Eski fraktal kurgusu`. |
| Log line as evidence | Weak. `cancel_legacy_orders` writes `Eski fraktal kurgusu` only after the mode `delete` and a cancel. Detection writes no log line. The evidence is the metric. |
| `GET /api/vps/status`, `tasks.update` | `state: Running`, `last_run: 2026-10-10T00:11:04`, `last_result: 267009` (0x41301, `SCHED_S_TASK_RUNNING`). |
| `GET /api/vps/status`, `tasks.start` | `state: Ready`, `last_run: 2026-10-09T17:20:09`, `last_result: 0`. `AutoGrid-Start` starts the same `start.bat` without a pipe and ends. This supports the pipe cause. |
| `GET /api/vps/logs?log=update&lines=60` | The file has 2 lines: `=== 2026-10-10T00:11:05 Update (Aufgabe AutoGrid-Update) ===` and `Already up to date.` `Worker neu gestartet.` and `Update fehlgeschlagen` are missing. The script stopped at the `start.bat` line. No earlier run exists to compare. |
| New test without the fix (`vps.ps1` set back) | `pytest tests/unit/test_vps_automation.py -k ohne_pipe` → `1 failed`. |
| Tests with the fix | `scripts/features/run.sh unit VPS` → `33 passed`. |
| Process list on the VPS | Not verified. The worker and ngrok windows probably started from this task on 2026-10-10 00:11. |
| Fix on Windows | Verified for the task path (`Invoke-UpdateLocal`) on 2026-10-13, see the next rows. |
| Clear the hung task (owner, `Stop-Process` on the hung `update-local` process) | `GET /api/vps/status`: `tasks.update.state: Ready`, `last_result: 4294967295`. This is -1, probably the exit code from `Stop-Process`. `worker.reachable: true`, ngrok runs, 2 bots run. The VPS is at `v0.7.210`, so the fix is on the VPS. |
| Live check, task path (owner, `Start-ScheduledTask -TaskName 'AutoGrid-Update'` in a normal PowerShell) | `GET /api/vps/status`: `tasks.update.state: Ready`, `last_run: 2026-10-13T10:03:15`, `last_result: 0`, `worker.reachable: true`, 2 bots run. `GET /api/vps/logs?log=update&lines=40`: the new run ends with `Already up to date.` and `Worker neu gestartet.`. |
| VPS-02, "Worker neu starten" on `/vps` (owner) | `GET /api/vps/status`: `tasks.start.last_run: 2026-10-13T10:05:33`, `last_result: 0`, `worker.reachable: true`, `elevated: []`, 2 bots run. |
| VPS-02, "Update & Neustart" on `/vps` with a stopped worker | Not verified. The button starts the task only when the worker does not run (`Invoke-Update`, `vps.ps1`). The page `/vps` has no action to stop the worker, and the uvicorn watchdog starts it again after 3 s. Thus the owner started the task directly. |
| VPS-02, "Update & Neustart" on `/vps` after the merge of #165 (owner) | Partial. `GET /api/vps/status`: `version: v0.7.211`, `worker.reachable: true`, 2 bots run. `GET /api/vps/logs?log=worker&lines=200`: the auto-updater pull `67691ea..c8680a0` and restart come before `POST /api/system/update?branch=main` → `200 OK`. The log has no time stamps, so the order of the lines is the evidence. The button did not cause the version change. |
| VPS-02, "Update & Neustart" on `/vps` after the merge of #166 (owner) | Partial again. `GET /api/vps/status` 1 min after the bump commit: `v0.7.211`. 20 s later the auto-updater pulled `c8680a0..8845b87` (`git.updated_at` 10:45:04 VPS local time). The worker log shows the auto-updater pull, then `GET /api/system/update/check` → 200, then `POST /api/system/update` → 200. |
| Auto-updater off for the check (owner: `setx AUTO_UPDATE_MINUTES 0`, then "Worker neu starten") | Before the change, `GET /api/vps/status` showed `auto_update_minutes: null` (default 5 min). After it: `auto_update_minutes: "0"`, `tasks.start.last_run: 2026-10-13T10:51:28`, `last_result: 0`, `worker.reachable: true`, 2 bots run. Worker log after the new `Started server process`: `Application startup complete.`, and no line `[AUTO-UPDATE] Açık`. The worker runs under the watchdog (`AutoGrid-Start`), and before the change each start wrote this line. |
| VPS-02, "Update & Neustart" on `/vps` after the merge of #167, auto-updater off (owner) | Passed. Before the click, the VPS was at `v0.7.212` with `auto_update_minutes: "0"`. After it, `GET /api/vps/status`: `version: v0.7.213`, `git.commit: 3a231005`, `worker.reachable: true`, 2 bots run. `GET /api/vps/logs?log=worker&lines=2000`: `GET /api/system/update/check` → 200, then `POST /api/system/update?branch=main` → 200, then `Started server process`. The 2000 lines contain no `[AUTO-UPDATE]` line. Nobody recorded the button answer. The version change and the log are the evidence. |
| VPS-02 sign-off | Claude told the owner that nobody recorded the button answer and the result of "Nach Updates suchen". The owner accepted the version change and the log as the evidence for these 2 items, and approved the sign-off. `scripts/features/run.sh sign VPS-02 bestanden "…"` → `VPS-02: manuell bestanden`, checklist `142/158`. |
| Auto-updater on again (owner: delete `AUTO_UPDATE_MINUTES`, then "Worker neu starten") | `GET /api/vps/status`: `auto_update_minutes: null`, `tasks.start.last_run: 2026-10-13T13:56:18`, `last_result: 0`, `worker.reachable: true`, 2 bots run. Worker log after the new `Started server process`: `[AUTO-UPDATE] Açık: origin/main her 5 dakikada kontrol ediliyor.` |

## Why

Do not sign ENG-29 as `bestanden`, because the check did not run. On 2026-10-13 the owner selected to remove the manual tier. ENG-29 now has the tiers `unit`, `api` and `e2e`. The first `pruefung` step gives the reason. The other steps tell what to do if a legacy setup order shows again.

Legacy setup orders come only from the removed numbered fractal setups, so new ones do not occur. The unit, api and e2e tests cover the detection, delete and keep, the `422` for a wrong value, and the dialog. The checklist then shows only automatic evidence and does not claim a manual pass. The cost: nobody examined the delete on a real MT5 terminal. The risk is low, because the delete uses the same path as normal robot orders. Examine this again when a bot reports `legacy_setup_orders` that is not empty, or the dashboard shows the dialog.

Options that the owner did not select:

1. Keep the manual tier open until a legacy setup order exists. To get one, put a pending order with a legacy comment on the DEMO account in MT5. That changes live trading on an account with a running bot, to examine a path that does not occur any more.
2. Add a status such as `entfällt` to `update_checklist.py` and the checklist legend. ENG-29 is the only such case. The new status also gives an easy way to close manual checks without a test.

For `AutoGrid-Update`, a fix in `vps.ps1` is better than a manual stop. A stop does not prevent the next hang.

VPS-02 check steps, owner decision on 2026-10-13:

- Step 3 changes from "Update & Neustart with a stopped worker" to "start the task `AutoGrid-Update` directly". The page `/vps` has no action to stop the worker, and the uvicorn watchdog starts it again after 3 s. A live check of the old step needs a manual stop of the uvicorn watchdog on the VPS while bots run (not verified).
- Do step 2 as soon as possible after the merge and the bump commit (replaced by the last item of this list). The auto-updater examines `origin/main` each `AUTO_UPDATE_MINUTES` (default 5), counted from the worker start, not from the merge. If it pulls first, the button finds nothing to pull. On 2026-10-13 this occurred: the log shows the auto-updater pull before `POST /api/system/update`. Before the click, "Nach Updates suchen" must show an update. After the click, the button answer must show the pull, not `Already up to date.`.
- Partial evidence does not sign a check (`2026-10-13-manual-checks-readonly-sweep.md`). Thus VPS-02 stays open until step 2 has clean evidence (replaced by the sign-off, see "Verification").
- Cost: the line `Start-Task $UpdateTask` in `Invoke-Update` (`vps.ps1`) has no live check. It runs only when the worker does not run, and it starts the same task that passed the live check.
- The owner rejected two options: sign now, because this breaks the partial-evidence rule, and keep step 3, because it is not practical to do.
- After the second attempt without clean evidence (#166), the owner selected to switch off the auto-updater for step 2. The button does not pull first in a reliable way. Step 2 in `features.yaml` now says: switch the auto-updater off before the merge, and switch it on again after the check. The owner rejected a new attempt at each merge, because it passes only by chance.
- Cost: while the auto-updater is off, the VPS does not pull other merges. If nobody switches it on again, the VPS stays on old code. The last open point prevents this.

## Open points

- [x] ENG-29: the owner selected to remove the manual tier. `features.yaml` and `FEATURES.md` are updated.
- [x] Fix `Invoke-UpdateLocal` (see "Solution").
- [x] `bekannter_fehler` for VPS-02: not necessary, because the fix and its test are in the same PR.
- [x] Clear the hung task (see "Steps for the owner"). Do this before the live check: with `IgnoreNew`, a new start of the task does nothing while the old run shows `Running`.
- [x] Live check after the pull on the VPS: start the update through the task. `tasks.update.state` must change back to `Ready`, and the log must contain `Worker neu gestartet.`. The worker code does not change, so the effect is only on the next run of the task.
- [x] VPS-02, step 3: changed to a direct start of the task (see "Why").
- [x] VPS-02, step 2: "Update & Neustart" on `/vps` after a merge on `main`, with the auto-updater off (path through the running worker). Sign VPS-02 only after this step and the owner's approval.
- [x] Switch the auto-updater on again after step 2. The value before was `null`, so delete the variable. In a normal PowerShell on the VPS, run `[Environment]::SetEnvironmentVariable('AUTO_UPDATE_MINUTES', $null, 'User')`. Then select "Worker neu starten" on `/vps`. After that, `GET /api/vps/status` must show `auto_update_minutes: null`, and the worker log must show `[AUTO-UPDATE] Açık`.

## Steps for the owner

Before 2026-10-13 these steps were not verified. Stop of the task process can also stop the worker and ngrok windows, if the Task Scheduler ends the whole process group.

On 2026-10-13 the owner did step 3 and Claude did step 4. The worker answered and ngrok ran. The stop did not end the worker and ngrok windows. The output of steps 1 and 2 is not recorded.

1. In PowerShell as the normal user, find the hung process: `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*update-local*' -and $_.ProcessId -ne $PID } | Select-Object ProcessId, CreationDate`.
2. Make sure that 1 process from 2026-10-10 00:11 shows.
3. Stop only that process: `Stop-Process -Id <ProcessId>`.
4. Make sure that `GET /api/vps/status` shows `tasks.update.state` = `Ready` and `worker.reachable` = `true`.
5. If the worker does not answer, select "Worker neu starten" on the page `/vps` (task `AutoGrid-Start`). The tunnel watchdog `AutoGrid-Tunnel` also starts it again after a failed check.

## Lessons

Do not send the output of a command that opens long-lived windows into a pipe. The child processes keep the pipe open, and the caller waits with no limit.

To clear a hung `AutoGrid-Update` task, stop only its `powershell.exe` process. On 2026-10-13 this did not stop the worker or ngrok.

To examine "Update & Neustart" on `/vps`, switch off the auto-updater before the merge. It examines `origin/main` each `AUTO_UPDATE_MINUTES`, counted from the worker start, and it pulled before the button 2 times. Write down `auto_update_minutes` first, and set it back after the check. Record the button answer.

A manual check for a one-time migration path needs a date. After the migration, the check cannot run any more. Remove the manual tier only with the owner's decision and a journal entry.
