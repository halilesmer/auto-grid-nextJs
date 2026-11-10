---
date: 2026-11-10
author: Claude
type: fix
status: done
pr: [491]
features: [SYS-11, SYS-10]
areas: [tests, scripts]
---

# Heavy-lock tests failed under load; SYS-11 stayed red

## Request
`run.sh show SYS-11` showed `e2e ❌`. The heavy-lock tests had failed three times under load (2026-11-07, precheck of K1 and K3). Close the gap without relaxing the tests.

## Cause
1. The tests existed and carried `@SYS-11`. The red mark was an old result in `docs/features/results.json` (2026-11-07). Nobody ran the tag again after the fixes, so the mark stayed.
2. Three tests asserted a message from the waiting process (`fremder Halter`, `ohne Fortschritt`, `Uhrsprung`) inside a `HEAVY_LOCK_TIMEOUT` of 1 to 6 s. The script counts whole wall-clock seconds. Under load, the start of the script crosses a second boundary, the timeout ends the wait, and the message is never written. This was reproduced with 10 CPU loops (1 failure in 111 runs).
3. The stress test R3-03 used `spawnSync` with a 120 s limit. With 3 workers and CPU load, round 4 was cut off (3 of 4 rounds).
4. The orphan-server tests (`e2e_server.sh`) carried only `@SYS-10`, so SYS-11 did not count them.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/heavy-lock-lib.spec.ts` | New helper `stopAfterMessage`: wait for the message (condition), then stop the waiter. The three message tests use it and have no script timeout. R3-03 runs async and ends when all shells end. |
| `frontend_nextjs/e2e/mocked/test-scripts-lib.spec.ts` | The `e2e_server.sh` tests carry `@SYS-10` and `@SYS-11` (orphan server stopped, foreign process kept). |

No assertion was removed or loosened. Result: 185 of 185 runs pass with 10 CPU loops (5 repeats of each test).

## Lesson
A test that checks a message must wait for the message, not for a clock. A script timeout in whole seconds is only a safety limit.

## Unrelated failure seen during the precheck
`chart-workspace.spec.ts:590` (ANA-20) timed out in the 90 s click limit. This change does not touch that file. The run started when the 1-minute load average was below 10, but the 5-minute and 15-minute averages were still very high (other sessions ran FRM-47). The cause is not found. CI decides.
