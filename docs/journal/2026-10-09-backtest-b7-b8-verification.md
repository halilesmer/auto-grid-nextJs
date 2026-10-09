---
date: 2026-10-09
author: Codex
type: fix
status: done
pr: [136]
features: [BKT-02, BKT-08, BKT-11, BKT-12, BKT-13, SYS-07]
areas: [frontend, worker, tests, docs]
---

# Verify backtest setups and preset isolation

## Request

The user authorized tests, merge, and deployment after the initial draft PR. This supersedes the earlier no-tests instruction.

## Cause

| CI failure | Cause |
|---|---|
| BKT-02 architecture guard | comparison.ts and presets.ts imported domain types from the Zustand store. |
| SYS-07 local mocked run | The test server inherited real VPS_SSH_HOST from the developer environment, so the expected disabled VPS view was not shown. |
| Two BKT-12 setup-isolation tests | They changed the saved source selector, which B7 uses as the template for Add. A local setup is selected separately. |

## Solution

| Change | Result |
|---|---|
| setupTypes.ts | Domain types move to the library; the store imports and re-exports them. The unchanged architecture test guards against store dependencies. |
| Existing BKT-12 tests | Add a local copy of the selected source before checking isolation. Both result/error assertions remain. |
| Preset API tests | Exercise real temporary SQLite through HTTP: CRUD, authentication, foreign-owner/admin isolation, retries, limit, identities and invalid payloads. |
| Browser tests | Exercise duplicate/result isolation, comparison, preset save/reload/load and one-shot unsaved dashboard transfer. |
| Playwright mocked server | Explicitly clears VPS_SSH_HOST; mocked tests cannot use the real SSH connection. |
| Store/preset tests | Check the six-setup limit, deep copy isolation and removal of identities/CSV references. |

## Verification

| Check | Result |
|---|---|
| scripts/features/run.sh, unit tier | 452 passed. |
| scripts/features/run.sh, API tier | 231 passed, including nine new preset cases. |
| Preset negative control | Temporarily omitting the router made the API suite fail; restoring it returned all nine cases to green. |
| Full browser suite | 469 passed; the one SYS-07 environment failure was fixed. All four SYS-07 cases passed on rerun. |
| Generated checklist | 138/157 features checked; remaining entries include manual or unrelated work. |
| TypeScript and ESLint | Passed. |
| Pyright for preset route and new API tests | 0 errors, 0 warnings. |
| Local browser build | Initial network restriction blocked Google Fonts; the restricted Turbopack cache also failed process creation. A fresh cache with approved execution recovered the build. |

## Release

The user authorized merge and deployment after green CI. The local checks are complete;
GitHub records the final PR checks and deployment status.
