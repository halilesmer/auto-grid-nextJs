---
date: 2026-11-03
author: Claude
type: fix
status: open
pr: []
features: [FRM-32]
areas: [frontend, tests]
---

# Alarm menu opens on the history tab

## Request
- The bell menu on /formasyon opened on the settings tab. The history tab must be the default.

## Cause
- The tab state of `FormationAlarmMenu` started as `'settings'`. The state is local to the component, so every page load showed settings first.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/formation/FormationAlarmMenu.tsx` | The initial tab state is `'history'`. |
| `frontend_nextjs/e2e/mocked/formation-page.spec.ts` | New test "Das Menü öffnet standardmäßig auf dem Verlauf" (@FRM-32). New helper `openAlarmSettings` opens the settings tab. The tests that need switches, formations or product chips use it. |
| `docs/features/features.yaml` | FRM-32: the description and the check name the history as default tab. |

## Why
- The tab is not stored. It starts at the default on every mount, so the history shows on every page load.
- Rejected: default to history only when the history has entries. The request asks for history as the default. The empty history already shows an explanation.
- Cost: the settings controls need one more click. The tests that use them open the settings tab first.

## Verification
- Red first: before the change, the new test failed with `aria-selected` `"false"` on the history tab.
- After the change: `npm run test:e2e -- e2e/mocked/formation-page.spec.ts` → 132 passed, 0 failed. The new test passed.
- `tsc --noEmit` → exit 0. `eslint` on the two changed files → exit 0.
- `update_checklist.py --check` → "features.yaml ok (203 Features)".
- Not verified: the generated checklist `docs/features/FEATURES.md` is not regenerated (see Open points).
- Not verified: a manual check in the browser with the VPS worker.
- Test environment: port 3100 was taken by an unrelated `python -m http.server`. Playwright reused that server and every page returned 404. The run used `E2E_PORT=3111`.

## Open points
- [ ] Regenerate `docs/features/FEATURES.md` after a full feature run (`scripts/features/run.sh`). The file still shows the old FRM-32 check text.

## Lessons
- Check the e2e port before a run. With `reuseExistingServer` (outside CI), Playwright uses any server that already listens on the port, even a foreign one.
- Do not run `update_checklist.py` alone. It reads the older reports in `.feature-results/` and rewrites the dates of other features.
