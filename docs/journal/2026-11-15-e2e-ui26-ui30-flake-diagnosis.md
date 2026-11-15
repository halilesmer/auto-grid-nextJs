---
date: 2026-11-15
author: Claude
type: diagnosis
status: open
pr: [564]
features: [UI-26, UI-30]
areas: [tests, chart]
---

# UI-26 red not reproduced; UI-30 drag point made clock-independent

## Request
Two open test points: the UI-26 red on `main` (run 43717132359, `chart-latest-bar.spec.ts:30`, two tries in a row, 2026-11-15 13:19 UTC) and the clock dependence of UI-30. Also record the "101 red e2e" precheck of PR 543.

## UI-26: not reproduced
Test: after the click, `aria-hidden` of the "latest bar" button stayed `"false"`. Assumption to check: the mock candles follow the clock (`E2E_FAKE_NOW`).

| Run (local, production build, mocked worker) | Result |
|---|---|
| Clock fixed to 2026-11-15 13:19 UTC, 3 runs | 3 of 3 green |
| 2026-11-15, every hour, minutes :00, :19, :40 (72 runs) | 72 of 72 green |
| 2026-11-14 and 2026-11-16, hours 00, 04, 08, 12, 13, 16, 20, three minutes each (42 runs) | 42 of 42 green |
| Clock fixed to 13:19 UTC, 12 busy loops, 6 workers, 18 runs | 18 of 18 green |

Result: a clock or CPU load does not explain the red. The spec is not changed. The cause stays open. Not tested: the 4-shard layout of CI, state left by an earlier test on the same worker. If it shows again, take the trace of the failed try first.

## UI-30: free drag point
The second test dragged at fixed points (`0.3` and `0.45` of the chart height). At some hours a formation line sits there; its hit area takes the press and the chart never sees the drag. `freeY` now looks for a `y` where the topmost element at three `x` values is a canvas. Same `expect` calls; the `fakeNow` line stays.

Test of the idea, clock NOT fixed (`fakeNow` line removed in a temporary copy), 12 different dates and hours, two tests each:

| Version | Hours with a red test |
|---|---|
| Fixed points (old) | 6 of 12 (5 times the second test, once the first) |
| `freeY` only | 1 of 12 (the first test, see below) |

Ideas from the draft that were not taken:
- Wait for three equal axis reads in `still()`: with the clock fixed, 2 of 20 runs of the first test went red (old `still()`: 0 of 20). The longer wait shows a difference that the 300 ms read hides (axis width 64 against 62 px after `refresh`). It does not make the test more stable.
- `refresh(page, 'arrow')` before the last Fit: the second test was already green at all 12 hours with `freeY` alone.

Fixed clock, final file: 20 of 20 green (10 repeats of both tests, 3 workers).

## Open: first test at 2026-11-10 09:41 UTC
With a free clock, the first UI-30 test fails every time at this hour (6 of 6): after `refresh` the axis canvas is 62 px wide, before it was 64 px; the price labels look the same. Not caused by `freeY` (the test does not use it). The fixed clock hides it. Cause not found: it may be a product effect (axis width after the appearance effect) or a test effect. Next step: find which label gives the 64 px.

## Precheck of PR 543 with 101 red e2e tests (2026-11-14 night)
Reported by the coordinator: 101 red tests, 66 in `formation-page.spec.ts`; 46 failures with `data-scan-ms` never set on `chart-page`; 41 failures with a test time-out as the first error (the two groups come from different counts and can overlap); spread over 73 minutes. The same code was green in CI and merged. Reading: the Mac was overloaded (other sessions ran `npm ci` and e2e at the same time), the page was not ready in time. Not verified by a rerun; no proof of a product or test defect.
