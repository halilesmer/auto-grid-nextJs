---
date: 2026-10-09
author: Codex
type: plan
status: open
pr: []
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
| 1 | Audit and status corrections | Complete | Main is v0.7.186. Git confirms PRs #123, #136, #137, #139 and #140 are merged. |
| 2 | B6 chart and replay | Complete | PR #139. The current code preserves an exclusive cursor across timeframe loading. |
| 3 | B4 swap constants | Blocked | The current process has no VPS SSH configuration. Official enum names do not prove installed numeric constants. |
| 4 | B4 model limits on the page | Locally verified | `scripts/features/run.sh e2e BKT-10`: 9 passed; screenshots inspected at 375px/1280px in both themes. |
| 5 | B5/B9 abort during import creation | Locally verified | Delayed creation IDs are removed before upload after cancel or SPA unmount. The final BKT-05 e2e run passed 14 tests. |
| 6 | B9 database lock during import | Locally verified | CSV parsing holds no write lock; unpublished batches remain unreadable. The final API run passed 50 tests. |
| 7 | B9 changing broker offset | Locally verified | Row mode accepts UTC timestamps and historical broker offsets, with strict converted ordering. API and browser DST vectors pass. |
| 8 | B9 real annual CSV | Blocked | No verified real annual file is supplied. A concrete VPS import action needs separate authorization. |
| 9 | B4 million-candle profile | Complete | PR #140 and its raw observations: 260,944 trades; 164.512 seconds simulation after repair. |
| 10 | ZON-21 manual DEMO trading check | Blocked | It requires settings changes, bot start and orders. No concrete authorization under this continuation. |
| 11 | B7/B8, B1 history, stops-level flood | Complete | PR #136, recorded history check and PR #123. |
| 12 | Live timeout | Conditional | PR #137 records a successful live backtest. Capture HTTP and logs only if a timeout returns. |

## Limits

- The automatic approval review rejected combined merge, deployment and VPS trading authorization.
- The user authorized a normal PR workflow, with merge and pull only when repository rules and automatic approval allow it.
- No deployment or VPS trading action is authorized.
- Synthetic annual data does not prove a real annual import or broker time agreement.
- Worker tests use temporary databases and FakeMT5. Do not start the Python worker on this Mac.

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

- [ ] Create and review the PR; inspect CI and merge only if automatic approval allows it.
- [ ] Obtain the external evidence for the real annual CSV, installed swap constants and ZON-21 manual DEMO check.
