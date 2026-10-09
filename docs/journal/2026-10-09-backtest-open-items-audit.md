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
| 1 | Audit merged work | Complete | Local `main` is clean at `42d8ba4` (`v0.7.187`), after merge commit `6a7c648` for PR #141. The checkout also contains PR #140, #139, #137, #136, #123 and earlier work. |
| 2 | Verify GitHub checks and deployed versions | Blocked | `gh pr view 141 ...` could not connect to `api.github.com`. No VPS SSH configuration, SSH agent identity, `VPS_SSH_HOST`, `VPS_SSH_KEY`, `VPS_REPO_PATH`, or `WORKER_API_KEY` is available in this process. The local frontend environment file is absent. Do not infer VPS deployment from the local version or auto-update design. |
| 3 | B4 installed swap constants and symbol values | Blocked | No read-only VPS/API path is configured. Compare the installed `SYMBOL_SWAP_MODE_*` values with distinct live `swap_mode` values from `GET /api/symbols`; accepted values remain 0, 1 and 4. |
| 4 | B9 real annual M1 import and broker-time check | Blocked | No verified real annual CSV was supplied or found among tracked project files. Obtain a file with its source and coverage, select the DEMO account and symbol, then get approval for the specific import. Read the imported rates and compare an overlapping MT5 candle, including seasonal offsets. |
| 5 | ZON-21 manual DEMO trading check | Blocked | The catalog still marks the manual tier pending. Prepare a suitable isolated DEMO zone and a bounded test that records its original settings and restores them. Get specific approval before saving settings, starting the bot, or allowing pending orders. Preserve existing zones, bots, positions, and orders. |
| 6 | Final status, catalog, and journal | Waiting | Update the manual result and close this audit only after the external checks above have evidence. Keep synthetic annual tests separate from real broker verification. |
| 7 | B6 chart and replay | Complete | PR #139. The current code preserves an exclusive cursor across timeframe loading. The annual test uses synthetic and mocked data. |
| 8 | B4 page limits and one-million-candle profile | Complete | BKT-10 e2e: 9 passed. PR #140 records 260,944 trades and 164.512 seconds of simulation after repair. |
| 9 | B5/B9 import cancellation, writes, and seasonal offsets | Complete locally | PR #141 is in local `main`. Its journal records the final BKT-05 API run (50 passed), e2e run (14 passed), and BKT-10 e2e run (9 passed). These are local tests, not a VPS import. |
| 10 | B7/B8, B1 history, stops-level flood | Complete | PR #136, recorded history check and PR #123. |
| 11 | Live timeout evidence | Conditional | PR #137 records a successful live backtest. Capture HTTP status and worker logs only if a timeout returns. |

## Limits

- The automatic approval review rejected combined merge, deployment and VPS trading authorization.
- The user authorized a normal PR workflow, with merge and pull only when repository rules and automatic approval allow it.
- No deployment or VPS trading action is authorized.
- Synthetic annual data does not prove a real annual import or broker time agreement.
- Worker tests use temporary databases and FakeMT5. Do not start the Python worker on this Mac.
- The current task process has no local DEMO test-account file. Do not use or print account identifiers from another source.

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

- [ ] Restore a read-only VPS path and record the installed swap constants and distinct symbol values.
- [ ] Obtain and verify the real annual M1 CSV, then approve and perform its scoped DEMO import and overlap check.
- [ ] Prepare and approve the bounded ZON-21 DEMO order test; record the manual result with the feature runner.
- [ ] Verify PR #141 CI and deployed versions when GitHub and VPS access return; do not claim deployment from local Git state.
- [ ] Update the catalog and close this plan after all external evidence is recorded.
