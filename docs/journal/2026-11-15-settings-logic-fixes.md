---
date: 2026-11-15
author: Claude
type: fix
status: closed
pr: []
features: [UPD-03, VPS-01, VPS-02, VPS-03, VPS-04, VPS-09, VPS-11, USR-09, USR-10, USR-12, USR-14]
areas: [settings, vps, system, connection, prefs]
---

# Settings dialog: logic errors found in the final review (F1–F13)

## Request
Before the settings work (S1–S7, PRs 546, 552, 559, 561, 563, 562, 565) was called done, five review agents checked it. The coordinator verified each finding in the code. This entry lists the verified errors, their root causes and the fixes. The finding "module state carries over between users" is out of scope: the page reloads when the user or the connection changes.

## Findings, causes and fixes
- **F1 Stop bot.** `handleShutdown` swallowed every error and then called `window.close()` (left over from "Shut down the system"). `shuttingDown` was never reset, so the confirm window stayed in `loading` on the next open. Fix: no `window.close()`; a success toast; an error toast with the reason (`getApiErrorMessage`); `setShuttingDown(false)` in `finally`. The text of the confirm window no longer says that the interface closes. Stopping still stops only the bot of the selected account.
- **F2 Dead worker not detected.** After one good read, a later error changed only `error`; `status` kept the old value. `workerDown` (`!status && error`) stayed false, the SSH rescue did not start and the Status tab showed "running". Fix: the last read decides. An error means "not reachable" (`workerDown = Boolean(worker.error)`); the Status tab hides the old bot and loop values.
- **F3 Update over SSH was gone.** The old /vps page had `check-update` and `update` over SSH. The new UI did not call them. If a bad commit breaks the worker, nothing could pull the fix. Fix: a row in the Update tab with the SSH badge, locked outside localhost with the lock note, with a `ConfirmModal` that names the running bots and LIVE or DEMO (same `useBotsLine` as the restart tab). The link in the update window now opens the "VPS and system" section in the settings (it was a link to /vps). The comment in `useSystemActions` is corrected.
- **F4 Missing logs.** The log viewer offered only `worker` and `ngrok`. Fix: `update` and `tunnel` come back (SSH, localhost only). The hint "the log file exists only after the restart loop of start.bat" comes back (`sys-log-missing`).
- **F5 Missing status information.** Fix: in the SSH group of the Status tab: Git branch, commit and last update (warning tone when the branch is not `main`); VPS name and uptime; MT5 terminal count; warning tone on the ngrok row when the tunnel is down (`failures` and `last_result === 'tunnel-down'`); a row that shows "no restart loop" per service. The VPS name is shown at run time only. Tests use the mock name `VPS-01`.
- **F6 Unreadable log shown as empty.** A failed worker log read left the box on "log empty". Fix: `useWorkerSystem` keeps `logError`; the box shows the reason, and old lines are marked as old.
- **F7 SSH buttons clickable before the first answer.** `sshLocked` was known only after the first `/api/vps/status` answer. Fix: `sshPending = vps.loading`; the SSH buttons stay disabled until then.
- **F8 Wrong run released the probe lock.** `setProbing(false)` ran early and in `finally`. Run A could release the lock of run B that started later. Fix: a local `released` flag; a run releases only its own lock, once.
- **F9 Preferences not reloaded.** After a connection recovery the lock opened before the preferences were read again. If the read stayed `failed` or `offline`, the formation alarm stayed off for the whole session (`useAlarmPrefsStore.loaded` never became true). Fix: `load()` starts before `await loadMe()` (it sets `loadState` to `loading` at once, so the fields stay locked). Every good probe also calls `load()` when `loadState` is `failed` or `offline`. The "connection is back" message appears only after a real fault.
- **F10 Write lost while the tunnel was closed.** `isLocalOnly` treated every 404 as "old worker". With the tunnel closed, ngrok answers 404 too, and the value stayed on screen but was not saved. Fix: a 404 with the header `ngrok-error-code` is a normal error: the value is rolled back and the "Could not save" message with "Try again" appears (same rule as the read side).
- **F11 Tabs did not sync.** Since S6 the personal formation-alarm fields did not sync between tabs (before: `storage` event). A tab that scans could keep notifying after another tab turned the alarm off, and a later write from the old tab overwrote the other change on the server. Fix, for all keys (including the oscillator standard): after each good PUT the pair `{key, value}` goes over a `BroadcastChannel`. Other tabs `apply` the value and update `confirmed[key]`. A tab with a write in flight for the same key ignores the message.
- **F12 Seconds field saved without a change.** Leaving the field with unchanged text saved the value again; a value shown rounded to 2 decimals (0.333 s as "0,33") was saved as 330 ms. Fix: `commit` does nothing when `draft === shown`.
- **F13 "Open on the chart" request not consumed.** `indicatorsRequested` and `appearanceRequested` were cleared only on the chart page. Without a navigation the flag stayed, and the window opened by itself when the chart opened later. Fix: the request stores its time; `ChartWorkspace` ignores a request older than 15 s; `show()` clears both flags.

## Design
F3, F4 and F5 bring back old functions in the approved pattern (SSH badge, lock note, row layout of the "VPS and system" section). They are not a new visual design.

## Tests
New cases in `settings-system.spec.ts` (F2–F7), `system.spec.ts` (F1), `connection-states.spec.ts` (F8, F9) and `settings-dialog.spec.ts` (F10–F12) and `settings-open-request-lib.spec.ts` (F13), with the existing catalog IDs. The mock worker accepts extra response headers (`ngrok-error-code`).

## Open points
- The tests were written together with the fixes; a separate red run before the fixes was not possible (the machine-wide heavy lock was held by other sessions for more than an hour, and the build would have read the edited sources).
- F13 has no browser test: the stale request cannot be reached through the UI (the chart consumes the request at once). The age rule and the clearing in `show()` are tested as functions.
- F11: the listener starts when the module loads, so a tab that never writes also hears the broadcast. A message with a value equal to the current value is not applied: a new object would restart the formation scan (FRM-30 failed in the first run because of this).
- The test "Saniye alanı kayıttan sonra odağı korur" (USR-13) failed once under load (`worker.userPrefs.admin` read before the first write); 8 repeats passed. The cause is a race inside that test, not in the field.
- Existing test UPD-07 changed on purpose: after a failed read the worker row now says "not reachable" (F2), not the old "last read failed".
