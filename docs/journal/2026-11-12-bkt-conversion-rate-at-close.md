---
date: 2026-11-12
author: Claude
type: feature
status: done
pr: [520]
features: [BKT-28]
areas: [backtest, frontend]
---

# Backtest converts profit at the rate of the close

## Request
Plan 1112-K9, PR-2. MT5 converts the profit of a deal into the account currency with the rate of the conversion pair at the moment of the close. The browser backtest used the tick value from the fetch time. The snapshot never matched one DEMO close to the cent.

## Solution
| File | Change |
|---|---|
| `lib/backtest/broker/conversion.ts` | New. `pickConversionPair` chooses the pair from the symbol list (`currency_base`, `currency_profit`), never from the name. `rateAt` gives the M1 close of the candle (bid for a buy, ask = close + spread × point for a sell). |
| `lib/backtest/broker/costs.ts`, `pathBroker.ts` | `profitOf` and `swapPerNight` accept a rate. The broker converts at the close and at the rollover. Direct pair: multiply. Inverse pair: divide. Pair is the symbol itself: use the deal price. |
| `lib/backtest/runJob.ts`, `runner.ts`, `protocol.ts` | The job loads the M1 candles of the pair (4 days before FROM to TO). A gap uses the last close. A rate older than 4 days, or a pair that cannot load, uses the snapshot and writes a WARN. |
| `runSettings.ts`, `BacktestView.tsx`, `i18n/messages/backtest.ts` | `model.conversionRate` is `'close'` (default) or `'snapshot'`. No visible control. New log texts in tr, en, de. |

Only calculation modes 0, 2, 3 and 4 are converted. Swap in money mode and MFE/MAE stay on the snapshot. `moneyPerPriceUnit` in `engine/config.ts` is not changed (PR-3).

## Result (fixed data, DEMO, GET only)
| Window | Mode | Sum of net differences | Net exact | K4 fails |
|---|---|---|---|---|
| P6+ | snapshot | 9.84 | 76.3 % | 3 |
| P6+ | close | 5.71 | 88.1 % | 1 |
| P7 (518 pairs of the plan) | snapshot | 53.29 | 81.5 % | 2 |
| P7 (518 pairs of the plan) | close | 52.84 | 90.9 % | 2 |

Unmatched trades stay 2 and 6. Entry and exit exactness did not change. The `'snapshot'` mode gives the old numbers.

## Why
A fixed rate of today cannot match a deal of last week. The close rate removes the rate as a cause of the remaining difference before P8 opens the flags. We rejected a visible switch: the decision 1112-K10.1 says no new control.
