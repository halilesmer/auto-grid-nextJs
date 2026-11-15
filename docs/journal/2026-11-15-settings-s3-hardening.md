---
date: 2026-11-15
author: Claude
type: change
status: open
pr: []
features: [USR-13, USR-09, USR-11]
areas: [settings, accessibility]
---

# Settings S3: load gate, retry, focus and tabs

## Request
Close the open points of the settings dialog (S1, S2) in one PR (plan 1114-A4, step S3, decisions 1115-A2.2, 1115-A2.3, 1115-A2.4).

## Problem
`useUserPrefsStore.change()` ran before `load()` finished. A composite value (for example `tooltip_delay` = mode plus milliseconds) was built from the default part and written to the worker. The saved value was lost. `load()` also had no retry: one failed read left the cache values in place until the page was reloaded.

## Solution
- `useUserPrefsStore.loadState` (`idle`, `loading`, `ready`, `failed`, `offline`). `change()` writes nothing unless the state is `ready`. Exceptions: `locale` and `theme` (single values, used by the header buttons). A blocked write shows an error toast, unless `quiet`.
- `load()` retries 3 times (0.6 s, 1.2 s, 2.4 s). No connection gives `offline` at once, without retry. A 404 (old worker) counts as `ready`, as before. A newer `load()` call replaces an older one.
- `SettingsRow` locks its control in a `fieldset disabled` while the state is not `ready`. The row shows "Loading…", "Could not load" with a "Try again" button, or "Not connected". The hint of the badge gives the reason.
- `Modal`: Tab stays in the window; only the top window handles Escape and Tab (a confirm window on top of the settings dialog closed both before); a child that handled Escape (`preventDefault`) keeps the window open; on close the focus goes back to the opener.
- `SecondsInput` no longer remounts after a save (the `key` is gone), so it keeps the focus. First Escape resets the draft, the second closes the window. The same for the alert minutes input.
- Notification tabs: `tablist`, `tab`, `tabpanel`, `aria-controls`, `aria-selected`, roving `tabIndex`, arrow keys, Home and End. `AnimatedTabs` got the optional prop `panelId` for `aria-controls`.

## Why
A saved personal value must never be replaced by a default. Keyboard users must not lose the focus behind the dialog.

## Verification
See the pull request: e2e spec `settings-dialog-s3.spec.ts` (USR-13). The race test failed before the change (field not disabled) and passes after it. `precheck.sh`.

## Open points
- Header buttons for language and theme still write before the load ends (single values, by design).
- A write that is blocked by the gate is lost, not queued. The user repeats it after the load.
