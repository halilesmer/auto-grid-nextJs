---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: []
features: [ANA-22]
areas: [frontend, tests]
---

# ANA-22 hover test failed depending on the time of day

## Request
The e2e test "Linie unter der Maus …" (`chart-hover.spec.ts`) failed in every run from about 11:10 UTC on 2026-11-04 with `RSI line not found under the mouse`. The code did not change since the last green run on `main`. It blocked all open PRs.

## Cause
The mock worker builds the candles from `Date.now()`, and the chart range is relative to "now". So the RSI curve under the mouse moves with the clock. The helper `hoverRsiLine` searched one pixel column (middle of the pane) in 1 px steps. The hit zone of a line is only a few pixels wide. In this column the line often is not in a position that the mouse step can hit.
Proof: with a fixed clock (browser clock and mock clock) the test passed at 2026-11-03 12:00 and 2026-11-04 09:00 UTC. It failed at 10:50, 11:20 and 13:30 UTC and at 2026-11-09 03:00 UTC. A probe at 11:20 UTC found hits in other columns (35 %, 65 %, 80 %) but none at 50 %. A theory about the weekend gap of the mock candles was tested (`ratesAllDays`) and did not remove the failure.
No product code is at fault.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/chart-hover.spec.ts` | `hoverRsiLine` tries nine columns (middle first). The assertions are the same. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts`, `test.ts` | New env variable `E2E_FAKE_NOW` (ISO time). It fixes the clock of the mock and of the browser (`page.clock.install`). Without it nothing changes. |

Only this spec uses `hoverRsiLine`. The other hover tests in the file move to 30 %, 40 %, 60 % of the price pane and read text values, so they do not depend on the line position.

## Verification
`E2E_FAKE_NOW=<time> npx playwright test chart-hover --retries=0`: 19 of 19 passed at 2026-11-04 09:00, 10:50, 11:20, 13:30 UTC, 2026-11-05 22:10, 2026-11-07 12:00 (Saturday) and 2026-11-09 03:00 UTC.

ANA-19 and ANA-20 (`--grep "@ANA-19|@ANA-20"`, 25 tests) also passed at 2026-11-04 09:00, 11:20, 13:30 and 2026-11-09 03:00 UTC. They have no time dependency.

The exact reason why the middle column misses the line is not proven. Nine columns lower the risk. The check at seven clock times is evidence, not proof.

## Lessons
- A mock that uses the real clock makes an e2e test depend on the time of day. To reproduce, fix the clock with `E2E_FAKE_NOW`. The variable is meant for single specs such as `chart-hover`: other specs compute expected values with `Date.now()` and do not match a fixed clock.
- Do not hover a thin line in one fixed column. Search several columns.
