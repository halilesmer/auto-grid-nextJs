---
date: 2026-11-23
author: Claude
type: feature
status: closed
pr: []
features: [ANA-28]
areas: [frontend]
---

# Broker clock under the last price label (1123-A10.1 = B)

## Request
The chart on `/chart` shows a second box under the last price label, as TradingView does. Decision 1123-A10.1 = B: the box shows the current broker time, not the time left to the bar close.

## Change
- `src/lib/chart-workspace/priceClock.ts`: `PriceClock` is a series primitive. Its price axis view has a fixed coordinate (last close + label height), so the box sits right under the last value and moves with the price. `alignLabels` does not move it. The format is `SS:DD:ss` from `brokerNow(offsetSec)` with the UTC getters. A one-second timer, aligned to the second boundary (+250 ms), keeps the text of the last draw and calls `requestUpdate()` only when that text is old; `detached()` removes the timer.
- Setting `priceClock` (group `priceLines`, after `priceLabel`, default on, tr/en/de text and hint). The row is hidden in the dialog when the chart has no clock.
- The input is separate from `clockNow` (that one is null in the calendar time zones W1 and MN): `OneChart` passes `priceClockOffsetSec` only when the screen is at least 1024 px wide, the chart does not look into the past and the broker offset is known. Backtest passes nothing. `priceLabel` off hides the clock too.
- The box follows the bar of the library label: the last bar at or left of the right edge of the view, edge rounded up (`labelBar`). After a scroll that hides the last candle, the label and the clock drop together.
- A fill under both labels (`priceAxisPaneViews`, bottom layer) gives them one width, the wider text sets it, so they look like one box. The library puts labels at the inner edge of the axis (left edge on a right axis). Text colour follows the library rule (`contrastText`).
- The canvas holds the text, so the primitive writes it to `data-price-clock` on the chart host (tests).
- The countdown setting and the seconds text at the bottom left are not changed.

## Check
Tests `@ANA-28`: unit format, live, one-second step, setting off, price label off, past, phone width, W1. Unit tests also cover the label bar at a fractional edge and the contrast colour. Screenshots light and dark with font sizes 11 and 16, and after a scroll: `docs/journal/images/2026-11-23-price-clock-*.png`.

## Cost and decision
`requestUpdate()` of a series primitive makes a full update in lightweight-charts (autoscale of all price scales, redraw of all panes). Measured in headless Chromium (no GPU), D1 "All" zoomed out, 20 780 candles, one worker, main-thread task time in 10 s of idle (Chrome DevTools `Performance.getMetrics`):

| Clock | Idle task time |
|---|---|
| on, tick always redraws | 6601 ms and 6281 ms |
| off | 2053 ms and 2116 ms |
| on, tick redraws only when the last draw missed the second | 4514 ms and 3370 ms |
| off (same run) | 2095 ms and 1391 ms |

With the tick that always redraws, the scroll to the first candle (ANA-27 D1 test) timed out after 60 s in 2 of 2 runs; with the clock off it passed in 2 of 2. After the change the six runs passed (42 s to 60 s with the clock on, 38 s to 44 s off; the machine was busy, so the gap has no number here).

Decision (coordinator, 2026-11-23): option A only. Streaming and dragging redraw the chart anyway, so the clock needs its own redraw only when the feed is quiet: at most once per second. Most of the remaining cost is the canvas drawing of headless Chromium. Option B (digits in a DOM layer, no full update at all) is postponed: the digits would sit above the crosshair label of the top canvas and bring z-order problems. Switch to B if ANA-27 D1 stalls again or tests with the clock on fail more often than on `main`.

Other findings of this work:
- The UI-30 test compares axis images, so the digits changed them each second; the FRM-27 tests move the fake clock by 15 minutes, which ran the timer 900 times. FRM-27 on the branch: 9 of 48 failed, `main` 1 of 48, branch with the clock off 0 of 48. Both specs now turn the clock off with `e2e/fixtures/no-price-clock.ts`. It merges into the saved chart record, because an init script runs again on every reload.
- Tests that fail on `main` too (3 of 3 runs): `chart-dock-formation.spec.ts:56` (UI-17) and `chart-layers-menu.spec.ts:171` (UI-13). Not caused by this work.
- The unit test adds a `window` to node; it removes it again, because it leaked into FRM-32 in the same worker.
- Scenario "chart is built before the candles arrive" does not occur: with a delayed `/rates` response the primitive attaches when the series already has data (`bars=111` at the first `sync`).
- One of 180 runs of the ANA-28 tests failed once (`element(s) not found` after 24.9 s, settings toggle test); 30 of 30 repeats passed. Cause not found.
