---
date: 2026-11-14
author: Claude
type: fix
status: done
pr: []
features: [UI-30]
areas: [frontend]
---

# Fit button left the price axis stale

## Request
Test UI-30 (`chart-price-scale.spec.ts:58`) failed at random in CI since 2026-11-13 and blocked PR 532, 533 and 535. Find the root cause and fix the product.

## Cause
- Symptom: after a vertical drag (auto scale off) the user presses Fit. The candles fit again, but the price axis keeps the old range for 0.4 to 4.6 s. It then corrects when the next metrics poll re-renders the chart.
- `resetPriceScale` called `priceScale.setAutoScale(true)`. In lightweight-charts 5.2.1 this only writes the option. The library keeps its cached price range (`_invalidatedForRange.isValid`) and does not recalculate it until a scale-mode change or a data change invalidates it.
- `applyAppearance` runs on every new candle and writes the scale mode again when it changes. That is why a metrics poll "fixed" the axis. Without that poll the stale range stayed.
- The earlier hypotheses (mock depends on the clock, formation drawings) were wrong for this failure. The flake also did not appear at 1 worker on an idle machine (12 of 12 passed).
- Reproduction (red): `CI=1`, 3 workers, 6 busy CPU loops (`yes`), fixed clock `E2E_FAKE_NOW=2026-11-13T11:00:00Z`, `--repeat-each=24`: 13 of 24 failed at line 78.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/runtime.ts` | `resetPriceScale` writes the current price scale mode again after `setAutoScale(true)`. This invalidates the cached range, and the chart recalculates it in the next frame. |

Result with the same load: 24 of 24 passed (before: 11 of 24).

## Why
- Alternatives rejected: a larger `expect.poll` timeout, retries and a weaker assertion (forbidden, they hide the defect); calling `candles.setData` again (heavy, resets other state); changing the order of `fitContent` and `resetPriceScale` (tried by an earlier session, no effect).

## Second failure: clock-dependent formation under the second drag
- Symptom: at some clock times (23:30 UTC on 2026-11-13, 00:08 UTC on 2026-11-14 in CI, 4 of 4 and 2 of 2 local runs) the second drag at line 75 left the price axis unchanged. With `E2E_FAKE_NOW=2026-11-13T11:00:00Z` the test passed; with `2026-11-14T11:00:00Z` and `2026-11-13T23:30:00Z` it failed. The date, not only the hour, changes the mock data.
- Cause: the mock candles follow the clock, so the formation drawing (ABCD, A to C zigzag and its level lines) sits in another place. In the failing data it covers the second drag start (x from 0.5 of the chart width, y 0.3 to 0.45 of its height). The drawing manager takes the drag and moves the drawing, not the price scale. Starts at x 0.2 or 0.35, or y 0.2, moved the axis. This is the designed drawing behavior, so it is a data issue and not a product defect.
- Fix: the spec fixes the clock (`test.use({ fakeNow: '2026-11-13T11:00:00Z' })`), so the chart is the same in every run. No timeout, retry or assertion change.
- Result: at the real clock (2026-11-14 00:32 UTC) 12 of 12 passed (before: 2 of 2 failed at 00:xx).
