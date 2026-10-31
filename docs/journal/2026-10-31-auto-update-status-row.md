---
date: 2026-10-31
author: Claude
type: feature
status: open
pr: []
features: [UPD-07]
areas: [frontend]
---

# Page /vps shows the real auto-update state

## Request

The worker pulled no updates for days, and nobody saw it. The tile on `/vps` showed the setting from the registry, not the running process. PR #260 added `auto_update` to `GET /api/system/worker/status`. This change shows that field on the page. The owner approved design variant A: a separate row.

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/src/components/vps/AutoUpdateRow.tsx` | New row: state, last run, interval, worker detail. |
| `frontend_nextjs/src/lib/vps.ts` | `AutoUpdateStatus` type and the state rule `autoUpdateState`. |
| `frontend_nextjs/src/components/vps/useVps.ts` | The SSH view also reads `GET /system/worker/status` on each status poll, also when SSH fails. The request has a 10 s timeout. |
| `frontend_nextjs/src/components/vps/VpsStatusPanel.tsx` | Shows the row under the tiles. The auto-update line is removed from the tile "Version". |
| `frontend_nextjs/src/components/vps/VpsOnlinePanel.tsx` | Shows the same row in the panel for the public version. |

State rule, in this order:

1. No status from the worker: `unknown`. The SSH view also shows the registry value.
2. `enabled` is false: `offInterval` or `offUnsupervised`.
3. The last run is older than 3 intervals, minimum 15 minutes: `overdue`.
4. Else the value of `result`. `on`, `off` and no result show as `pending`. A value that this frontend does not know shows as `unknown`.

## Why

A separate row was selected because the tile "Version" cannot hold an error text, and a correct version must not become red. The public panel can use the same row.

The state `off` comes before `overdue`. A worker without the restart loop has no loop, so its old `checked_at` is not an error.

The state `off` is yellow, also when it is deliberate. A silent `off` was the cause of the incident.

The SSH view must call the worker, because SSH can read only the registry value. The call does not block the SSH status, so a hung tunnel does not stop the page.

The age compares the VPS clock (`checked_at`) with the browser clock. A clock difference of more than 10 minutes can show a false `overdue`. This is accepted: the fix needs a server time in the worker status.

The text for `unknown` says "no status from the worker", not the approved "worker does not answer". A worker before PR #260 answers but has no `auto_update` field.

## Verification

- `npx tsc --noEmit` → no errors. `npm run lint` → no errors.
- `E2E_PORT=3177 npx playwright test e2e/mocked/vps.spec.ts e2e/mocked/tooltips.spec.ts e2e/mocked/mobile-layout.spec.ts` → 65 passed.
- Red check: with the row hidden, 9 of 9 `@UPD-07` tests failed. With the limit changed to 1500 minutes, 3 of 9 failed. The 2 tests from the review (SSH failure, unknown `result`) failed before their fixes.
- Screenshots: light, dark, and 375 px. At 375 px the page has no horizontal scroll.
- Not verified on the VPS: the worker there must first have PR #260.

## Open points

- [ ] On the VPS, after the worker has PR #260: open `/vps`. Expected: the row shows "up to date", and the last run is at most one interval old.

## Lessons

`reuseExistingServer` in `playwright.config.ts` accepts any process on port 3100. A different program on this port gave a false red: all tests failed with an HTTP 404 page that did not come from Next. If all tests fail, read the page snapshot first. Use `E2E_PORT` to select a free port.
