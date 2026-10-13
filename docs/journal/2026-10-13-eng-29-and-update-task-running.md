---
date: 2026-10-13
author: Claude
type: diagnosis
status: open
pr: [162]
features: [ENG-29, VPS-02]
areas: [docs, ops]
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

## Verification

| Check | Result |
|---|---|
| ENG-29, DEMO account (`GET /api/logs/{id}?log_type=all&lines=2000`) | Bot runs, `metrics.legacy_setup_orders` = `[]`, 0 of 2000 robot log lines contain `Eski fraktal kurgusu`. |
| ENG-29, other 3 accounts (all DEMO, same request) | 2 without a running bot: the field is not in the metrics, so they give no evidence. 1 with a running bot: `[]`. 0 log lines with `Eski fraktal kurgusu`. |
| Log line as evidence | Weak. `cancel_legacy_orders` writes `Eski fraktal kurgusu` only after the mode `delete` and a cancel. Detection writes no log line. The evidence is the metric. |
| `GET /api/vps/status`, `tasks.update` | `state: Running`, `last_run: 2026-10-10T00:11:04`, `last_result: 267009` (0x41301, `SCHED_S_TASK_RUNNING`). |
| `GET /api/vps/status`, `tasks.start` | `state: Ready`, `last_run: 2026-10-09T17:20:09`, `last_result: 0`. `AutoGrid-Start` starts the same `start.bat` without a pipe and ends. This supports the pipe cause. |
| `GET /api/vps/logs?log=update&lines=60` | The file has 2 lines: `=== 2026-10-10T00:11:05 Update (Aufgabe AutoGrid-Update) ===` and `Already up to date.` `Worker neu gestartet.` and `Update fehlgeschlagen` are missing. The script stopped at the `start.bat` line. No earlier run exists to compare. |
| Process list on the VPS | Not verified. The worker and ngrok windows probably started from this task on 2026-10-10 00:11. |

## Why

Do not sign ENG-29 as `bestanden`, because the check did not run. On 2026-10-13 the owner selected to remove the manual tier. ENG-29 now has the tiers `unit`, `api` and `e2e`. The first `pruefung` step gives the reason. The other steps tell what to do if a legacy setup order shows again.

Legacy setup orders come only from the removed numbered fractal setups, so new ones do not occur. The unit, api and e2e tests cover the detection, delete and keep, the `422` for a wrong value, and the dialog. The checklist then shows only automatic evidence and does not claim a manual pass. The cost: nobody examined the delete on a real MT5 terminal. The risk is low, because the delete uses the same path as normal robot orders. Examine this again when a bot reports `legacy_setup_orders` that is not empty, or the dashboard shows the dialog.

Options that the owner did not select:

1. Keep the manual tier open until a legacy setup order exists. To get one, put a pending order with a legacy comment on the DEMO account in MT5. That changes live trading on an account with a running bot, to examine a path that does not occur any more.
2. Add a status such as `entfällt` to `update_checklist.py` and the checklist legend. ENG-29 is the only such case. The new status also gives an easy way to close manual checks without a test.

For `AutoGrid-Update`, a fix in `vps.ps1` is better than a manual stop. A stop does not prevent the next hang.

## Open points

- [x] ENG-29: the owner selected to remove the manual tier. `features.yaml` and `FEATURES.md` are updated.
- [ ] Fix `Invoke-UpdateLocal`: start `start.bat` without a pipe, for example with `Start-Process`, then write `Worker neu gestartet.` to the log.
- [ ] Decide if VPS-02 gets `bekannter_fehler` until the fix.
- [ ] Live check after the fix and a pull on the VPS: start the update through the task. `tasks.update.state` must change back to `Ready`, and the log must contain `Worker neu gestartet.`.
- [ ] Clear the hung task (see "Steps for the owner"). The effect is small, so it can wait for the fix.

## Steps for the owner

These steps are not verified. Stop of the task process can also stop the worker and ngrok windows, if the Task Scheduler ends the whole process group.

1. In PowerShell as the normal user, find the hung process: `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*update-local*' -and $_.ProcessId -ne $PID } | Select-Object ProcessId, CreationDate`.
2. Make sure that 1 process from 2026-10-10 00:11 shows.
3. Stop only that process: `Stop-Process -Id <ProcessId>`.
4. Make sure that `GET /api/vps/status` shows `tasks.update.state` = `Ready` and `worker.reachable` = `true`.
5. If the worker does not answer, select "Worker neu starten" on the page `/vps` (task `AutoGrid-Start`). The tunnel watchdog `AutoGrid-Tunnel` also starts it again after a failed check.

## Lessons

Do not send the output of a command that opens long-lived windows into a pipe. The child processes keep the pipe open, and the caller waits with no limit.

A manual check for a one-time migration path needs a date. After the migration, the check cannot run any more. Remove the manual tier only with the owner's decision and a journal entry.
