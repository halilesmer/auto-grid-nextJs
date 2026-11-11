---
date: 2026-11-11
author: Claude
type: feature
status: open
pr: []
features: [BKT-24]
areas: [frontend, tests, docs]
---

# Pending orders at window start (backtest library)

## Request
Step 2 (PR-B, frontend) of plan 1111-K1, decision 1111-K2. The worker endpoint is in main (PR 499). The browser backtest must start with the pending orders that the live account held at the window start. There is no visible UI change.

## Solution
| File | Change |
|---|---|
| `src/lib/backtest/startState.ts` | `LiveOrder` (endpoint row). `buildStartState` takes the rows as sixth parameter and returns `orders`. `undefined`: no request, no note. `null`: requested but not available, WARN `run.startOrdersMissing`. Partial fill: WARN `run.startOrderPartial`. |
| `src/lib/backtest/broker/pathBroker.ts` | `InitialOrder` and `seedOrder`. The order goes into the broker order book, not into the engine state. No history entry. |
| `src/lib/backtest/runner.ts` | `RunInput.initialOrders`. Seeded after the positions, so existing ticket numbers do not change. INFO `run.startOrders`. WARN `run.startOrderNoFractal` for a fractal zone. |
| `src/services/historyApi.ts` | `fetchLiveOrders` with `axiosInstance`. |
| `src/i18n/messages/backtest.ts` | Four log texts (tr/en/de). |
| `e2e/fixtures/mock-worker.ts`, `data.ts` | The new endpoint. |
| `e2e/mocked/backtest-start-orders-lib.spec.ts` | Library tests (@BKT-24). They failed before the code. |
| `docs/analyse-regeln.md` | One paragraph in section 5. |

## Why
- The engine reads orders with `ordersGet()`. If the broker holds the seeded orders, there is no special rule for the first step: no double order on a level, an invalid order is deleted, the position limit deletes them, and a 10018 reject keeps them.
- The seeded order must carry the TP and SL that the bot would send. Otherwise `validateAndCleanup` deletes it as invalid. The live order carries them, so this matches live.
- No model flag. The behavior depends on the data: no orders, same run as before.

## Verification
- All library specs (`*-lib.spec.ts`, 2358 tests) pass. The BKT-16 and BKT-19 to BKT-23 specs are unchanged.
- Not verified: a full fractal run with a seeded fractal order (only the comment path and the WARN are tested). The acceptance measurement (step 3) covers it.

## Open points
- [ ] Risk 2 (session start): the K55 evidence shows the BT retried at 22:05:00, not 22:04:30. The snapshot session of USDJPY and GBPUSD may open at 22:05. Print `trade_sessions` for Sunday in the acceptance step. If it differs, open a separate item. BKT-21 is not changed here.
- [ ] K2.5: the live compare page does not pass start state to the run (`runJob.ts`). Separate step with its own acceptance.
- [ ] Acceptance measurement (windows P6+, P7, P8).
