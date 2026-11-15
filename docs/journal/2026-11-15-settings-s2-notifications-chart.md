---
date: 2026-11-15
author: Claude
type: change
status: open
pr: []
features: [USR-11, USR-12, NWS-02, NWS-03]
areas: [settings, news, chart]
---

# Settings S2: Notifications and Chart sections

## Request
Add the sections Notifications (tabs General, News alerts, News filter) and Chart to the settings dialog, as in the approved design (plan 1114-A4, step S2).

## Solution
- New keys in `user_prefs` (the worker takes any key that matches `[a-z0-9_-]{1,40}`, so no key list changed): `toast_duration`, `news_filter`, `news_alerts`, `chart_tf`, `chart_colors`. The size limits (8 KB for each value, 40 keys, 128 KB for the file) are enough for the new values.
- `useUserPrefsStore` got five keys in `PrefKey`, with a case in `apply` and in `current` for each. `change()` has the options `silent` (no success toast) and `quiet` (no error toast).
- Notification time: `toast_duration` is `{seconds}` with 5, 10, 20 or 0 (until closed). `animated-toast.tsx` uses it for each toast that is not an error and has no own duration, and for news alerts. Until the user picks a value, the old times (4 s, news alert 10 s) stay.
- News filter and news alerts moved from the account (`ui_prefs`) to the user. `useNewsStore` does not read `localStorage` or `/ui-prefs` any more; it writes through `registerNewsPersister`.
- Migration: `POST /api/me/prefs/import-account/{account_id}` copies `news_filter` and `news_alerts` from the account to the user, only for keys the user does not have yet. The old account keys stay and are not read. The frontend calls it once after the account is known (`NewsAlertRunner`).
- Chart: `chart_tf` is the timeframe when the chart link has no `tf` (`chartUrl.ts` reads `useChartPrefsStore`; an explicit `tf` stays in the address). `chart_colors` replaces the `localStorage` store `grid-robot-custom-colors-v1`; old values move once, then the local key is removed. "Open on chart" sets a request in `useSettingsDialogStore`; `ChartWorkspace` opens the Indicators window.

## Why
Personal settings belong to the user, not to a device or an account (decision 1114-A2.2). A user with more than one account had a separate news filter for each account.

## Verification
See the pull request: worker api tests, e2e specs `settings-dialog-s2.spec.ts` (USR-11, USR-12), changed news specs, `precheck.sh`.

## Open points
- [ ] Open from S1 (not part of S2): focus trap and Escape in the dialog; a retry for `load()`.
- [ ] `.claude/rules/worker.md` does not name the route `POST /api/me/prefs/import-account/{id}` yet. Rule files change only on the owner's request.
- [ ] A news filter written by an older frontend to `ui_prefs` after the migration is not read.
