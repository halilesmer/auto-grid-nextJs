---
date: 2026-11-25
author: Claude
type: fix
status: closed
pr: []
features: [ANA-28]
areas: [frontend]
---

# Price label countdown does not pause at the bar close (1125-D1)

## Defect
Halil saw it on `/chart`, XAUUSD M1: when the countdown under the price label reached 00:00, the box went away for some seconds and then counted again. TradingView starts the count of the next bar at once.

## Root cause
`PriceClock.remaining()` returned `null` when the close of the last bar was past, so the box was hidden. This rule was made for the weekend and a closed market. The box came back only when the chart got a new last bar. The chart opens the new bar only with its first price: a tick in the new period, then the stream, then a React render. That delay was the gap. The journal of 2026-11-24 (`2026-11-24-price-clock-countdown.md`, "Finding") had already recorded it.

## Change
- `priceClock.ts`: new function `countdownLeft(timeframe, barOpen, brokerSec)`. Before the close it gives the time to that close, as before. After the close it gives the time to the close of the next bar (`barEnd(tf, close)`, so W1 and MN stay calendar-aware). When `NEXT_BAR_GRACE_SEC` (60 s) after the close no new bar came, it gives `null` and the box is hidden.
- When the new bar arrives, `update()` gives the same count, so the text does not jump.
- Side effect: when the market closes, the box counts the next bar for at most 60 s and then hides (for example H1 shows `59:xx` for up to one minute after the last close of the week).

## Check
Unit tests `@ANA-28` in `chart-price-clock-lib.spec.ts`: two new tests failed first (`Received: ""` at 12:00:00 and at 12:00:59), then passed after the change (14 of 14). A third test covers `countdownLeft` for M1 and MN. The e2e test "no new candle after the close" moves the clock by one hour, so it still expects a hidden box.
The 60 s value is an estimate, not a measurement of the tick delay on the VPS.
