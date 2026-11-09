---
date: 2026-11-09
author: Claude
type: fix
status: done
pr: []
features: [SYS-11]
areas: [tests, scripts]
---

# Heavy-lock memory test depended on the real swap

## Request
The e2e test for the memory check in `heavy_lock.sh` failed on a Mac without a swap file. K4 of plan 1108-A5 could not pass `precheck.sh` because of it.

## Cause
`_hl_mem_bad` reads `sysctl vm.swapusage`. When the swap total is 0, the function returns "no pressure". The test only changed the thresholds, not the measured values. So the result depended on the swap state of the machine. CI skipped the test on Linux, so nobody saw it.

## Solution
| File | Change |
|---|---|
| `scripts/features/heavy_lock.sh` | `HEAVY_LOCK_TEST_MEMLEVEL` and `HEAVY_LOCK_TEST_SWAPUSAGE` replace the sysctl values when both are set. Test use only. |
| `frontend_nextjs/e2e/mocked/heavy-lock-lib.spec.ts` | The pressure test sets the values and no longer skips on Linux. A new test covers "no pressure" (swap total 0, or enough free memory). |

## Lesson
A test that forces a threshold must also control the measured value. Do not let a test read machine state.
