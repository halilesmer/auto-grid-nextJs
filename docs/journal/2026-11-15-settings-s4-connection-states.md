---
date: 2026-11-15
author: Claude
type: change
status: open
pr: []
features: [USR-14, USR-13, SYS-09, UI-01]
areas: [settings, connection, header]
---

# Settings S4: connection states in the dialog and the header menu

## Request
Show the connection state in the settings dialog and in the header menu (plan 1114-A4, step S4, decisions 1115-A7.1 to 1115-A7.5 and 1115-A9.5).

## Problem
The plug button showed the state only inside its menu. When the worker became unreachable, nothing changed outside the menu, and the personal settings (stored on the VPS) looked editable. A failed save gave an error toast without a way to repeat it. The header menu also held language, theme, version, developer panel and update check, which now live in the settings dialog.

## Solution
- `useConnectionStore` keeps `lastCheckedAt`, `lastOkAt`, the failure reason and a `probing` flag (memory only). `lib/connectionCheck.ts` holds the one check function. The 30 s timer, the window focus and the "Try now" button call it. When the state goes from `unreachable`, `unauthorized` or `insecure` to `connected`, a toast "Connection restored" shows and `useUserPrefsStore.load()` runs again (A7.3).
- `usePrefsLock(prefKey)` in `settings/parts.tsx` has a new lock `readonly` for the three error states. Without a saved connection (`unconfigured`) `locale` and `theme` stay editable and get the badge "On this device"; the other rows show "Opens once connected" (A7.2).
- `ConnectionBanner` sits above the personal sections: icon, title, text, meta line and the action for the state ("Try now" and "Connection settings", "Change key…", "Fix address…" or "Connect to a VPS"). The navigation shows a lock on personal sections and a status dot on Connection (A7.1).
- The Connection section shows the last check and the last successful check, the reason (texts of `connection.test.*`) and the action. The role is "Unknown" when the key was rejected.
- The error toast of a failed save has a "Try again" button (A7.4).
- Header menu: status row, "Connection settings" (opens the dialog on Connection), "Settings" (last open section), separator, "Stop bot" (was "System shutdown"; same confirm dialog, still disabled without an account). The plug button has a corner dot: none when connected, grey while checking, yellow for `unauthorized`, red otherwise (A7.5, A9.5). `LanguageSwitcher` and `ThemeToggle` were removed.
- Test seam: `window.__gridPageProtocol` lets the e2e run the `insecure` state on an http page.

## Why
A write that cannot reach the VPS must not look possible. The reason and the next step belong next to the setting, not in a menu. Status never relies on colour alone: icon and text come with it.

## Verification
See the pull request: e2e spec `connection-states.spec.ts` (USR-14) covers the seven states. The header menu and the language, theme and update tests use the settings dialog now.

## Open points
- A write blocked by a read-only row is not queued (decision A7.1).
- `SystemSection` still shows its own shutdown row; step S5 removes it.
