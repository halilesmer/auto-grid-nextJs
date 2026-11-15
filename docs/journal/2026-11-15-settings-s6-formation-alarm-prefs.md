---
date: 2026-11-15
author: Claude
type: change
status: open
pr: []
features: [USR-15, USR-13, USR-14, FRM-30, FRM-43]
areas: [settings, formation, user-prefs]
---

# Settings S6: formation alarm preferences and "metrics pinned" move to the user

## Request
Store the personal part of the formation alarm and the "metrics pinned" switch per user on the worker, and add the tab "Formation alarm" to the notification settings (plan 1114-A4, step S6, decisions 1115-A9.2 and 1115-A9.3).

## Problem
Both values lived in the browser (`grid-robot-formation-alarm`, `grid-robot-metrics-pinned`). A second device showed other values. The alarm entry also mixed personal choices with data that belongs to an account.

## Solution
- Two new `user_prefs` keys: `formation_alarm` (`active`, `events`, `forms`, `system`, `sound`) and `metrics_pinned` (`pinned`). The worker needed no change: both values are far below the limits (8 KB per value, 40 keys).
- Fields per account stay in the browser: switch per symbol, favorites, remembered state, history, last account. `lib/formation/alarmStore.ts` keeps its API. `snapshot()` merges the browser part with the personal part (`useAlarmPrefsStore`). `save()` writes the account part to the browser and sends a changed personal part to the worker through `useUserPrefsStore.change()`.
- The settings tab and the bell menu in the chart use the same hook (`useFormationAlarm`), so a change in one place shows in the other.
- One-time migration (`migrateLocalAlarm`, `migrateLocalPinned` in `useUserPrefsStore`): when the worker has no value, the old browser value is applied, written to the worker, and then removed from the browser (for the alarm only `active` and `prefs`; the account fields stay). A value that exists on the worker always wins. While the write is open, the old value stays valid. If it fails, the old value stays and the next start tries again.
- The alarm does not scan and does not notify until the personal values are known (`personalLoaded`). Otherwise default values could trigger notifications that the user turned off.
- The tab uses the S3 and S4 parts (`SettingsRow`, lock `readonly`/`loading`), so the connection lock applies to it.

- The cleanup of remembered alarm state (`memory`) waits for the personal values. Without this, the empty product list of the idle alarm would delete the remembered state of the account.

## Not covered
- A very old worker without the prefs route (404): the personal values stay at the defaults and the alarm stays idle, because the load never confirms them.
- A second tab or device sees a change after it loads the preferences again (reload or reconnect). There is no live push. A tab with an old state can therefore write its old personal fields over a newer change from another device (the whole value is sent). The tab that holds the scan lock also keeps notifying with the values it loaded.
- Before the preferences load, the switches in the bell menu of the chart and the pin button on the dashboard are not locked. A change then shows the error toast "not loaded" and is not applied.
- Test: `e2e/mocked/settings-formation-alarm.spec.ts` (`@USR-15`).
