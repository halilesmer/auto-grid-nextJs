---
date: 2026-11-21
author: Claude
type: fix
status: done
pr: []
features: [ANA-19]
areas: [tests]
---

# The ANA-19 chart view tests need a fixed weekday clock

## Request
- `scripts/features/precheck.sh` on 2026-11-21 (a Saturday) failed 2 of 4050 tests in `e2e/mocked/chart-view-like-tradingview.spec.ts`: "Açılışta son mumlar varsayılan genişlikte görünür…" and "Son mumdan uzaktaki görünüm yeni mumla kaymaz". The same 2 tests failed on `main` (`f56a1f6c`), alone and with one worker.

## Root cause
- The spec used the real clock (`nowMs()` without `fakeNow`). On a Saturday the chart gets no running candle of the formation search, so `[data-last-price]` stays missing (`toHaveCount(1)` got 0).

## Solution
| File | Change |
|---|---|
| `e2e/mocked/chart-view-like-tradingview.spec.ts` | `test.use({ fakeNow: '2026-11-18T12:00:00Z' })` (a Wednesday), as in `chart-workspace.spec.ts` and `chart-latest-bar.spec.ts`. No test was loosened. |

## Verification
- Before: 2 failed, 4 passed on the Saturday clock (`main` and branch).
- With `E2E_FAKE_NOW=2026-11-18T12:00:00Z`: 6 of 6 passed. With the `test.use` line and the real Saturday clock: 6 of 6 passed.

## Open points
- [ ] Other mocked specs that use the real clock can fail at the weekend the same way. Not searched.
