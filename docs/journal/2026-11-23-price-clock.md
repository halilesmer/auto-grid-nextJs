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
- `src/lib/chart-workspace/priceClock.ts`: `PriceClock` is a series primitive. Its price axis view has a fixed coordinate (last close + label height), so the box sits right under the last value and moves with the price. `alignLabels` does not move it. The format is `SS:DD:ss` from `brokerNow(offsetSec)` with the UTC getters. A one-second timer calls `requestUpdate()`; `detached()` removes it.
- Setting `priceClock` (group `priceLines`, after `priceLabel`, default on, tr/en/de text and hint). The row is hidden in the dialog when the chart has no clock.
- The input is separate from `clockNow` (that one is null in the calendar time zones W1 and MN): `OneChart` passes `priceClockOffsetSec` only when the screen is at least 1024 px wide, the chart does not look into the past and the broker offset is known. Backtest passes nothing. `priceLabel` off hides the clock too.
- The canvas holds the text, so the primitive writes it to `data-price-clock` on the chart host (tests).
- The countdown setting and the seconds text at the bottom left are not changed.

## Check
Tests `@ANA-28`: unit format, live, one-second step, setting off, price label off, past, phone width, W1. Screenshots light and dark with font sizes 11 and 16: `docs/journal/images/2026-11-23-price-clock-*.png`.
