---
date: 2026-10-09
author: Codex
type: plan
status: open
pr: [141]
features: [BKT-04, BKT-05, BKT-06, BKT-07, BKT-10, ZON-21]
areas: [frontend, worker, tests, docs]
---

# Audit remaining backtest work

## Request

- Continue in the existing local checkout and preserve its uncommitted changes.
- Complete B9 seasonal CSV offsets, then review, document and prepare the PR.
- Merge and pull only when repository rules and automatic approval allow it.
- Do not deploy or change VPS trading state.

## Ordered work

| Order | Task | State | Evidence or next action |
|---|---|---|---|
| 1 | Audit merged work | Complete | Before this documentation branch, the local checkout was clean on `main` at `4fc0f76` (`v0.7.191`). PR #145 merged as `43aec89`; the version-bump commit followed. |
| 2 | Verify GitHub checks and deployed versions | Complete | GitHub Actions run #304 passed the catalog, worker, and frontend jobs on `43aec89`. The read-only local SSH status page reports worker `v0.7.191`, `main` at `4fc0f768`. Chrome shows Production frontend `v0.7.191` at the URL recorded in `docs/NGrok/Sistem ve Canlıya Alma.md`. |
| 3 | B4 installed swap constants and symbol values | Complete | The existing Windows VPS session gave read-only access to the installed MetaTrader5 5.0.6180 package and the worker symbol cache. Installed values are DISABLED=0, POINTS=1, CURRENCY_DEPOSIT=4. Cached symbol records have modes 1, 3, 5, and 6. The backtest accepts only 0, 1, and 4. See `2026-10-10-backtest-b4-vps-swap-verification.md`. |
| 4 | B9 real annual M1 import and broker-time check | Complete | Three annual M1 files committed on the VPS. USOUSD API time and OHLC matched the CSV and source terminal. See `2026-10-10-backtest-b9-vps-import.md`. |
| 5 | ZON-21 manual DEMO trading check | Blocked | The 2026-10-10 read-only preflight in Chrome reported rejected API access; the existing VPS window showed a black screen. Current DEMO type, bot status, isolation and market status remain unverified. Earlier terminal evidence showed existing trading activity. See `2026-10-10-zon-21-readonly-preflight.md`. A trading test requires explicit user authorization. |
| 6 | Final status, catalog, and journal | Waiting | Close this audit after the separate ZON-21 check. B4 evidence is recorded; keep the cache measurement distinct from a fresh worker API response. |
| 7 | B6 chart and replay | Complete | PR #139. The current code preserves an exclusive cursor across timeframe loading. The annual test uses synthetic and mocked data. |
| 8 | B4 page limits and one-million-candle profile | Complete | BKT-10 e2e: 9 passed. PR #140 records 260,944 trades and 164.512 seconds of simulation after repair. |
| 9 | B5/B9 import cancellation, writes, and seasonal offsets | Complete locally | PR #141 is in local `main`. Its journal records the final BKT-05 API run (50 passed), e2e run (14 passed), and BKT-10 e2e run (9 passed). These are local tests, not a VPS import. |
| 10 | B7/B8, B1 history, stops-level flood | Complete | PR #136, recorded history check and PR #123. |
| 11 | Live timeout evidence | Conditional | PR #137 records a successful live backtest. Capture HTTP status and worker logs only if a timeout returns. |

## Limits

- The automatic approval review rejected combined merge, deployment and VPS trading authorization.
- The user authorized a normal PR workflow, with merge and pull only when repository rules and automatic approval allow it.
- The user authorized the requested external and DEMO actions. Preserve existing trading state and stop if a precondition fails.
- Synthetic annual data does not prove a real annual import or broker time agreement.
- Worker tests use temporary databases and FakeMT5. Do not start the Python worker on this Mac.
- Do not use or print account identifiers from another source. The local DEMO profile and frontend environment files are present, but the symbol endpoint rejects the available key with HTTP 401.

## Changes and evidence

| Task | Cause and repair | Fresh check |
|---|---|---|
| Model notice | Four limits were only in the plan. `BacktestView` now shows them before a run, using tr/en/de keys. | The first browser regression failed in all three languages because the notice was absent. The repaired run passed nine tests. |
| Initial test setup | The first build lacked the new i18n keys. Add those keys before testing the absent notice. | No test was skipped or weakened. |
| Swap reference | The [official enum reference](https://www.mql5.com/en/docs/constants/environment_state/marketinfoconstants) defines units by name. | Do not infer installed integer values solely from the listed order. |
| Import cancellation | Keep the ID response after cancellation; delete the new staging entry before any chunk or commit. | Cancel and SPA-unmount regressions pass. Cancel failed before the fix. The first navigation setup hit the modal overlay; use programmatic SPA navigation. |
| Import write lock | Parse outside the lock; write existing 50,000-row batches, then publish status and replace overlaps atomically. | The concurrent writer regression failed before repair. 37 API cases pass, including late parser failure and account removal between batches. |
| Large synthetic import | 100,001 generated candles, not a real broker file. | Commit: 0.681 seconds; longest sampled write body: 0.074 seconds. One observation on this Mac, not VPS latency. |
| Seasonal broker offset | A single current offset cannot represent seasonal changes. | Fixed and row modes now match the selected CSV columns. The worker stores provenance and rejects duplicate converted times. |
| Feature checks | BKT-05 and BKT-10 changed. | `scripts/features/run.sh BKT-05`: API 50 passed, e2e 14 passed. `scripts/features/run.sh e2e BKT-10`: 9 passed. Unit filter had no BKT-05 tests. |
| Frontend checks | Dialog, messages, mock and tests changed. | `npm run lint`: exit 0. `npx tsc --noEmit`: exit 0. |
| Python checks | Import module and API tests changed. | `pyright src/utils/csv_import.py src/api/market.py tests/api/test_csv_import_api.py`: 0 errors, 0 warnings. |
| Build runner | Turbopack could not start its CSS process (`Operation not permitted`). | The same mocked suites passed with the supported `next build --webpack` option. The Playwright config was restored afterward. |

Cancellation cannot recover an ID if the creation response is lost through network failure or a full browser exit.
The worker's existing 24-hour staging cleanup remains the recovery for this case. Creation has the preset API's 30-second deadline.

## Open points

- [ ] Resume ZON-21 on Monday, 2026-10-12, after the selected symbol's market opens. Preserve all access and trading prerequisites.
- [x] Verify the Production frontend version in Chrome at the URL recorded in `docs/NGrok/Sistem ve Canlıya Alma.md`. It displays `v0.7.191`.
- [x] Record installed swap constants and distinct cached symbol values through the existing read-only Windows VPS session. See `2026-10-10-backtest-b4-vps-swap-verification.md`. The worker API still returned 401; no credential was read or changed.
- [x] Obtain and verify the real annual M1 CSV, its source and time basis, then perform the authorized import and overlap check. See `2026-10-10-backtest-b9-vps-import.md`.
- [ ] Restore an authorized read-only account view, then verify the ZON-21 preconditions. Run the trading test only after explicit user authorization. See `2026-10-10-zon-21-readonly-preflight.md`.
- [x] Verify current GitHub CI and VPS worker version on 2026-10-10. Main run #304 passed all three jobs. The worker reports `v0.7.191` at `4fc0f768` through the local read-only SSH status page. Do not infer the Production frontend version from this local app or worker status.
- [ ] Update the catalog and close this plan after all external evidence is recorded.
