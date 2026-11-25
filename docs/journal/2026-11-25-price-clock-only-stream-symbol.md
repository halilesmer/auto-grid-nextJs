---
date: 2026-11-25
author: Claude
type: fix
status: closed
features: [ANA-28]
areas: [frontend]
---

# Price label clock counted down only on the stream symbol

## Request
Halil (1125-C1): the countdown under the last price label works on EURUSD. On the other symbols it does not count down.

## Cause
- The clock counts to the close of `bars.at(-1)` that the chart workspace gets (`ChartWorkspace.tsx`). When that close is in the past, the clock hides.
- The worker stream carries the live price of one symbol only: the symbol of the first zone of the account (`ws_server.py`). On Halil's account this is EURUSD.
- With the stream price, `ChartCore` writes the running candle into the workspace bars (`setWorkspaceTail`).
- Without the stream, on D1/H4/H1/M15 the series leaves out the candle at `live_from` (`OneChart.tsx`). The running candle comes from the search (common M15 price, `runningBar`). `ChartCore` drew it, but did not give it to the workspace. Thus the workspace saw the last closed candle and the clock hid.
- The existing tests did not find this: their fixed candles had no `live_from`, so the running candle stayed in the series.

## Change
- `ChartCore.tsx`: the `runningBar` effect also sets `workspaceTail`, the same as the live price path.
- New e2e test `@ANA-28` "Akışta olmayan sembolde de saat koşan mumu sayar": EURUSD with `live_from` set while the mock stream shows USOUSD. Before the fix it failed (`data-price-clock` was empty); after the fix it passes.

## Open
- At the start of a new candle, the search candles reload every 60 s (`REFRESH_MS`, `useMarketRates.ts`). Thus on a symbol without stream the clock can hide for up to 60 s after a close, until the new candle comes. Not changed.
- M1, M5, M30, W1 and MN: the series keeps the candle at `live_from` there (the filter in `OneChart.tsx` applies only to D1/H4/H1/M15). Thus the clock sees the running candle, with the same 60 s reload gap. This is from the code only; no test covers it.
