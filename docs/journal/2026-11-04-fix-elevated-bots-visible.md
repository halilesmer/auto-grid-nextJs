---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: []
features: [VPS-07]
areas: [frontend, worker]
---

# "End admin processes" shows bots and MT5 and asks before it stops them (1104-K6)

## Cause
`Get-ElevatedSummary` in `vps.ps1` hid every process whose parent process was also in the elevated list. This was meant to join the `.venv` launcher and the real Python process. But with an elevated worker, the bots are children of the worker, and MT5 is a child of the bot. So the list on `/vps` did not show them. `Invoke-FixElevated` still stopped the roles `bot` and `mt5`. The user could stop a LIVE bot without any warning. The old text "Bots without admin rights keep running" was correct for the list, but not for the action. The check on 2026-10-13 did not find this, because no bot was elevated at that time (`2026-10-13-manual-checks-readonly-sweep.md`, open points).

## Decision
The project owner delegated the details on 2026-11-04. The design is the Artifact of session `k6-tasarim`. The choices follow its recommendations:
- **One button (K6.1 = A).** With a bot or MT5 in the list, the button is "End all, including bots and MT5". The confirm dialog names the accounts, says the gap is about 1 minute, and says that positions and pending orders stay on the MT5 server. The confirm button works only after the user ticks "I understand that the bots and MT5 will stop".
- **LIVE/DEMO badge (K6.2).** A bot row shows the badge when the account list is loaded in the browser. If it is not loaded, there is no badge.
- **Guard in the script (K6.3).** `vps.ps1 fix-elevated` stops nothing when a bot or MT5 runs elevated and the argument `stop-bots` is missing. It returns `{ ok: false, code: "botsElevated", elevated: [...] }`. The route passes `stop-bots` only for `?stopBots=1` and answers `botsElevated` with HTTP 409. Any other value of `stopBots` gives HTTP 400. The page reads the list again and shows a warning. The user then confirms again with the new list. The guard works also when the list on the screen is old.
- **List rule.** A process is hidden only when its parent has the same role (`.venv` launcher and real Python), or when the worker or ngrok runs under its restart loop (the loop row stands for it). Bots and MT5 stay visible. The list has two groups: "Stops, then restarts without admin rights" and "Stops: bots and MT5".

## Check: does the worker start the stopped bots again?
Yes, but only for bots started with `/start`. `bot_watchdog.watch()` writes the account to `data/watched_bots.json`. Only `/stop` removes it. A killed bot process leaves the entry. The new worker reads the file in its startup handler (`main.py`, `load_persisted`) and `startup_maintenance` starts every listed account whose process is not running, LIVE too. Bots that run but are not in the file (not started with `/start`) are not started again. So the warning says "the bots that were started with Start". A unit test (`test_gestoppte_bots_kommen_ueber_watched_bots_zurueck`) records that the entry stays in the file.

## Tests
- Unit (`test_vps_automation.py`): the guard comes before the first stop; `bot` and `mt5` enter the role list only with `stop-bots`; the list rule; the `watched_bots.json` entry stays.
- E2E (`vps.spec.ts`, `@VPS-07`): loops only (no tick needed, no `stopBots`); bots and MT5 (two groups, button name, tick before confirm, call with `?stopBots=1`); stale list (409, warning, new list).
- The script runs only on the VPS. It was checked by reading the code. The DEMO test with an elevated DEMO bot is in the catalog entry VPS-07 as a manual step.

## Not verified
- The PowerShell script was read, not run. It runs only on the VPS. The DEMO check in the catalog entry VPS-07 is open.
- `stop-bots` stops every elevated bot and MT5 at run time, not only those on the screen. The tick resets when the set of bots or MT5 in the list changes. A bot that starts between the last poll and the click is stopped too. A guard with the confirmed PIDs is not built.
- If only MT5 runs elevated, the account list in the confirm dialog shows "–". A non-elevated bot on the same terminal loses its connection and is not named.
