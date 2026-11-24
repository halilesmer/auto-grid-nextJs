---
date: 2026-11-24
author: Claude
type: feature
status: closed
pr: []
features: [ANA-28]
areas: [frontend]
---

# Price label box shows the time to bar close (1124-A9)

## Request
Halil compared `/chart` with TradingView (2026-11-24). The box under the last price label showed the broker time (ANA-28, 1123-A10.1 = B), and it looked one hour ahead of Berlin time. TradingView shows the time left to the bar close there. Decision 1124-A9: show the countdown. Colour, box and fill stay as they were; only the text changes.

## Change
- `priceClock.ts`: `formatCountdown(remainingSec, dayUnit)` and `secondsToClose(timeframe, barOpen, brokerSec)`. The close is `barEnd()` of `calendarBars.ts` (open + timeframe length; D1 ends at broker midnight; W1 at the next Sunday 00:00, as the W1 candles of the chart start; MN at the first of the next month, by calendar).
- Format: under 1 hour `52:47`, under 1 day `02:50:53`, from 1 day `3g 02:50`. Seconds are cut off, not rounded. Day letter from i18n: tr `g`, en `d`, de `T` (`cw.priceClock.day`).
- The box is hidden when the close time is past and no newer candle came (weekend, market closed). A new candle brings it back through `update()`. The attribute `data-price-clock` is removed while the box is hidden.
- `PriceClockState` has three new fields: `lastBarTime`, `timeframe`, `dayUnit`. `ChartWorkspace` passes the open time of the last bar of the chart.
- Setting: the stored key `priceClock` is unchanged. Name and hint are now "Mum kapanışına kalan süre" and "Fiyat etiketinin altında, son mumun kapanmasına kalan süreyi gösterir." (tr; en and de equivalents). The older `cw.countdown` (seconds at the bottom left) has the same Turkish name; the dialog now holds two rows with it when both are available. Not changed here.
- Unchanged: hide rules (past view, backtest, unknown offset, `priceLabel` off, under 1024 px), the one-second tick and the rule that asks for a redraw only when the text changed.

## Check
Tests `@ANA-28`: unit tests for each format, the day letters, D1 at broker midnight, W1, MN in November, December and February 2028, the hidden state and the return of the box; e2e tests with `fakeNow` for H1, D1, W1, MN and the hidden box after the close. The e2e tests use fixed candles (`ratesSeries`): the sine candles of the mock leave out the running candle, because that one needs a live price, so the clock would have no open bar.
Note on the work order: the code was written before the tests; the red run was not recorded.
Screenshots, 1440 px, light and dark: `docs/journal/images/2026-11-24-price-clock-countdown-*.png`.

## Finding
In the chart, the running candle is part of the bars only after a live price came. Before that, the last bar is the previous one, so the box can stay hidden for a short time at the start of a new bar.

Precheck: catalog, worker, lint and tsc ok; e2e 4715 of 4716. The one failure, `analysis-chart.spec.ts:39` (ANA-11, four weekends: 2 rates calls, 1 expected), also fails alone on the parent commit `50caadfc`, so it does not come from this work.
