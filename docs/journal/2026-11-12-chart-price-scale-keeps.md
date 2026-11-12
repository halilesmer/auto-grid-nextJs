---
date: 2026-11-12
author: Claude
type: fix
status: done
pr: []
features: [UI-30]
areas: [frontend]
---

# Price axis drag keeps, candles move vertically

## Request
On `/chart`, the user drags the numbers of the right price axis up or down. After the release, the chart goes back to the old scale. The user also wants to move the candles up and down with the mouse.

## Cause
- `applyAppearance` (`chart-workspace/runtime.ts`) sets `autoScale` on the price scale every time the appearance effect runs. The effect runs again after many events: a new candle, a change of a drawing (the drawing manager writes a checkpoint at the end of a gesture), a preference change. An axis drag sets `autoScale` to false in lightweight-charts. The next run of the effect set it back to true, so the scale snapped back.
- The effect also wrote `mode` again on every run. lightweight-charts then calculates the price range again. It keeps the range only when the range came from the API (`setVisibleRange`). A range from an axis drag or from the library's own pane drag is not kept, so the scale also snapped back with `autoScale` off.
- lightweight-charts moves the price range with a pane drag only when `autoScale` is false. With the default (auto scale on), a vertical pane drag did nothing.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/runtime.ts` | `applyAppearance` writes `autoScale` and `mode` only when the setting changes (`WeakMap` per chart). New `resetPriceScale()` sets it on purpose. New `enableVerticalPan()`: a mouse drag in the price pane with auto scale on turns auto scale off and moves the visible price range (also in log mode). After that, the library moves the range itself. |
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | Connects `enableVerticalPan`. The fit button and the navigation reset call `resetPriceScale`, so they go back to auto scale. |
| `frontend_nextjs/e2e/mocked/chart-price-scale.spec.ts` | UI-30 test: axis drag and pane drag stay after release and after the appearance effect runs again; fit goes back. The test failed without the fix. A drag that starts on a formation zone does not move the chart (the drawing manager takes it), so the test starts the drag in an empty area. |

## Why
- Not a full "manual scale" setting in the UI: the user only wants the drag to stay. Fit and double click on the axis go back to auto scale, as in TradingView.
- The vertical pan starts after 6 px of movement and only when the chart allows `pressedMouseMove`. While a drawing is moved, the drawing manager turns this off, so a drawing drag does not move the price range.
