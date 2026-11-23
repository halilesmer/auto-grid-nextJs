---
date: 2026-11-23
author: Claude
type: fix
status: closed
pr: []
features: [ANA-17]
areas: [frontend, tests]
---

# ANA-17 scan-scale tests depend on the wall clock

## Defect
The two tests in `chart-scan-scale-tool.spec.ts` (lines 23 and 63) failed on 2026-11-23 in CI and on the Mac, also on main 0897c7ee. Main CI was green at 05:49 UTC. Two PR runs failed with the retry: 13:48 UTC (another PR) and 17:35 UTC (PR 653).

## Cause
- The mock worker computes its candles from the clock (sine curve, `mock-worker.ts`). The spec had no fixed clock, so the candles depend on the time of the run.
- The tests expect that the price scale widens when the formation scan ends. `ChartCore` widens the scale only when the price range of the found formation lies outside the candle range. With some clocks this is not true, and the expected change does not come.
- Measurement on main 0897c7ee, the same spec with `E2E_FAKE_NOW`: 05:30, 09:00, 11:00 and 13:30 UTC passed; 17:30 UTC and the real clock (17:53 UTC) failed.

## Change
- `chart-scan-scale-tool.spec.ts`: `test.use({ fakeNow: '2026-11-23T09:00:00Z' })`. The checks did not change.

## Evidence
- The spec three times at 17:54 UTC (the failing window): 2 passed each time. Precheck: 4119 passed, 0 failed, 0 flaky.
