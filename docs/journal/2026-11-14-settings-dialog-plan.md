---
date: 2026-11-14
author: Claude
type: plan
status: open
pr: []
features: [USR-09, USR-10]
areas: [worker, frontend, tests]
---

# Settings dialog and personal preferences (plan 1114-A4)

## Request
The project owner approved a design for one large settings dialog on 2026-11-14. Personal settings belong to the user. The worker stores them. Every change saves at once.

## Plan
| Step | Content | State |
|---|---|---|
| S1 | Worker endpoints for user preferences. Preference store. Dialog with Appearance, Connection, Robot and zone, Users, System. Hint delay and hint display time. | This PR |
| S2 | Notifications (toast time, news alerts, news filter) and Chart (default time frame, saved colors) move from the account to the user. | Open |

## Solution (S1)
| File | Change |
|---|---|
| `worker_python/src/api/user_prefs.py` | `GET /api/me/prefs`, `PUT /api/me/prefs/{key}`. One file per user: `data/user_prefs_<id>.json`. Limits: 8 KB for a value, 40 keys, 128 KB for the file. Deleting a user deletes the file. |
| `worker_python/src/utils/paths.py` | `get_user_prefs_path`. An unsafe user id raises an error. It never falls back to a shared file. |
| `frontend_nextjs/src/store/useUserPrefsStore.ts` | Loads when the connection and `/auth/me` are ready. `change()` updates at once, keeps a status per key (`saving`, `saved`, `failed`) and restores the old value on error. |
| `frontend_nextjs/src/store/useTooltipPrefsStore.ts` | Holds the two hint values. `tooltip.tsx` reads them. A separate store avoids an import cycle with the toast. |
| `frontend_nextjs/src/components/ui/tooltip.tsx` | The open delay and the hold time come from the user. After the hold time the hint closes, also when the pointer stays. |
| `frontend_nextjs/src/components/settings/` | The dialog. On a phone it is full screen: first the section list, then the section. |

Keys: `locale`, `theme`, `tooltip_delay` = `{mode: instant|custom, ms}`, `tooltip_hold` = `{mode: pointer|custom, ms}`.

## Why
- The worker stores the values, not `localStorage`. The values then follow the user to every device. `localStorage` stays as a cache for language, theme and hints, so the first paint is right.
- The connection (worker address and key) stays in the browser. The browser needs it to reach the worker.
- The mode "instant" keeps the custom value. When the user picks "custom" again, the last value returns.
- When the worker is not connected, or an old worker has no `/me/prefs`, the choice stays in this browser. It is not an error.
- The old gear menu in the header keeps connection, language, theme and system. Its icon changed to a plug. The new gear opens the dialog. Language and theme in the old menu use the same save path.

## Notes for S2
- Reuse `useUserPrefsStore.change(key, value, label)` and add the keys to `PrefKey`. Add an `apply` case and a `current` case for each key.
- `ui_prefs.py` (per account) holds the news filter today (NWS-02). Read the old value once, write it to the user file, then stop writing the account file.
- The news alert settings and the custom colors live in `localStorage` or in the account file today. Check `useNewsStore`, `newsAlerts.ts` and `useCustomColorsStore.ts` before the move.
- A section page needs `PrefStatusBadge` and `SettingsRow` from `components/settings/parts.tsx`. Add the section to `GROUPS` in `SettingsDialog.tsx`.

## Verification
- Worker API tests: `worker_python/tests/api/test_user_prefs_api.py` (17 tests, feature USR-09).
- E2E tests `@USR-09` (5) and `@USR-10` (4) pass, including the phone flow at 375 px without horizontal scroll.
- `tsc` and `eslint` report no errors.
- Screenshots: `docs/journal/images/settings-dialog-{desktop,phone}-{dark,light}.png` and `settings-dialog-phone-{dark,light}-menu.png`. They show no account number.
- A review found a rollback race. The store now rolls back to the last value that the worker confirmed, and it sends the writes of one key in order.
- Not verified: the dialog on the real VPS worker. The test needs the new worker version on the VPS.

## Open points
- [ ] S2: Notifications and Chart sections.
