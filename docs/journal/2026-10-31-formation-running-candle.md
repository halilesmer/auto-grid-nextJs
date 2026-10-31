---
date: 2026-10-31
author: Claude
type: fix
status: done
pr: []
features: [FRM-31]
areas: [frontend]
---

# Formation chart shows the running candle

## Request
On `/formasyon` each time frame (15m, 1h, 4h, D) showed another "current" price.

## Cause
`FormationChart` drew only `context.view(tf, scanAt)`, which holds closed candles. The price axis showed the close of the last closed candle of each time frame, so D showed the previous day and 15m the last 15-minute candle.

## Solution

| File | Change |
|---|---|
| `src/lib/analysis/candles.ts` | New pure function `runningBar(rates, price)`. |
| `src/hooks/useFormationScan.ts` | New output `running` per time frame. The price is the close of the running M15 candle. |
| `src/components/formation/FormationChart.tsx` | Own effect after `setData` calls `update()` with the running candle. `data-last-price` for tests. |
| `src/app/formasyon/page.tsx` | Passes `running` to the chart. |
| `e2e/fixtures/*` | Mock option `ratesLive` sets `live_from` for fixed candles. |

## Why
The search rule stays: no look into the future (`docs/analyse-regeln.md`). `running` is not part of `FormationContext`, so `key`, `scanAt`, search and alarm do not change. RSI, drawings and indicators end at the last closed candle.
The plan named the feature `FRM-30`. That ID was already used by the alarm feature, so this change uses `FRM-31`.

## Verification
See `scripts/features/run.sh e2e FRM`. The e2e test checks the H4 chart (the fixture has hits only there), not a switch 15m → D. The per-time-frame rule is covered by the `runningBar` logic test.

## Open points
- [ ] Browser check on the DEMO account: 15m and D show the same price.
- The image export shows the running candle, although its time stamp names `scanAt`.
- If the running candle disappears (market closed), the old one stays until the chart data is set again.
