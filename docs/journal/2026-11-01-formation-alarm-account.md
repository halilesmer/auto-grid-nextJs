---
date: 2026-11-01
author: Claude
type: fix
status: done
pr: []
features: [FRM-30]
areas: [frontend, tests]
---

# Formation alarm without a selected account

## Problem
- After a reload on `/chart` the account selector was empty. `FormationScanRunner` read only `useAccountStore.selectedAccount`, which is not stored. The scan rested and no notice came, while the bell menu said the alarm runs on every page.

## Decision
- The alarm remembers the last selected account in its own browser storage (`account` in `alarmStore.ts`). If no account is selected, the runner uses that account (`lib/formation/alarmAccount.ts`, `hooks/useAlarmAccount.ts`).
- The alarm never writes the global `selectedAccount`. The dashboard, bot start, bot stop and zones depend on that value. A reload must not preselect an account there, least of all a LIVE account.
- The runner searches only when the account is in the account list. It loads the list itself (retry every 10 s). An account that is not in the list (deleted, or owned by another user) makes the search rest.
- The bell menu always opens. Without a usable account it shows the reason (no account, remembered account gone, checking) and no switches. The design was approved by Halil on 2026-11-01.

## Why
- The alarm store is already per browser, and its switches and memory are per account (`<accountId>|<symbol>`). The new field mixes nothing.
- A change of account still aborts the running pass through the existing effects of the runner.
- The list check replaces a reaction to the 404 of the favorites route. The favorites loader would show an error toast and retry for ever.

## Verification
- Review found that an empty list stayed in "checking" for ever. Fixed with `accountsLoaded` in `useAccountStore`; two more tests (empty list, selected before remembered).
- Codex scan (one round, read only) found two points, both confirmed and fixed: (1) after a reload without an account on the page, an alarm product named in the URL could not be removed in the menu (the page symbol is now used only with the page account), (2) an account that another tab had just created and remembered showed as "gone" against an old account list (the runner now loads the list once per missing account). Each has a test, red before the fix.
- Red first: 5 new `@FRM-30` tests were red (reload without `?account=`, account remembered, dashboard without preselection, no account, account gone).
- `scripts/features/run.sh FRM` → all passed; `npm run lint`, `npx tsc --noEmit`, `npm run build` → no errors.

## Open points
- Shared retry loop: the runner and `/formasyon` both reload the account list every 10 s while it is empty. A shared hook would merge them (not done here).
- A list that never loads (worker down) keeps the menu on "checking" and logs an error every 10 s.
- Real browser check with Halil: reload on `/chart`, then wait for a notice from a real new candle.
