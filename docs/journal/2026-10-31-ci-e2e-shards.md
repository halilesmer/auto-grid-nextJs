---
date: 2026-10-31
author: Claude
type: decision
status: done
pr: []
features: []
areas: [tests]
---

# Split e2e tests into 4 CI jobs

## Request
- The GitHub checks on a PR took too long. Make them faster.

## Cause
- A full run took 9 to 13 minutes. Playwright used 435 to 601 s of this time.
- The log showed `Running 1677 tests using 2 workers`. The sum of all test times was 1106 s.
- A GitHub runner has 4 cores. Playwright uses half of them by default.
- No spec file was much slower than the others. The slowest file used 96 s.

## Solution
| File | Change |
|---|---|
| `.github/workflows/tests.yml` | Job `frontend-static` runs lint and tsc. Job `frontend-e2e` runs Playwright in 4 parts with `--shard`. Job `frontend` keeps the name of the required check and is green only if all parts are green. |

## Why
- The repository is public, so more runners cost nothing.
- Each runner keeps 2 workers. The load per runner does not change, so the timing of the tests does not change.
- Rejected: more workers on one runner. This gives more load per runner and more risk of unstable tests.
- Rejected: run only the tests of the changed area. All of the last 8 PRs changed the frontend.
- Rejected: remove the run on `main`. The ruleset does not require an up-to-date branch, so this run finds faults that two merged PRs cause together.

## Lessons
- Do not change the name `Frontend (lint + e2e gemockt)`. The ruleset of `main` requires this name.
- Keep `if: always()` on the job `frontend`. GitHub counts a skipped required job as green.
