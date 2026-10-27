---
date: 2026-10-27
author: Claude
type: decision
status: done
pr: [209]
features: [FRM-01]
areas: [frontend]
---

# Formation detection: base library (step E1)

## Request
Build the base for rule-based formation detection in the browser: types, parameters, indicators, a multi-timeframe context and a fixture export script.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/types.ts` | Data shape: check (kind, status, state), drawing, candidate, verdict |
| `frontend_nextjs/src/lib/formation/params.ts` | All numbers with their rule ID in one place |
| `frontend_nextjs/src/lib/formation/indicators.ts` | RSI, Wave, ATR, wide-range candle |
| `frontend_nextjs/src/lib/formation/context.ts` | Per-timeframe indicators, `view(tf, t)` gives closed candles only |
| `frontend_nextjs/src/lib/formation/fixture.ts` | Validation of candle fixtures |
| `frontend_nextjs/scripts/formation-fixture.mjs` | Fetches candles from `/rates`, writes a fixture |
| `frontend_nextjs/e2e/mocked/formation-base-lib.spec.ts` | Hand-calculated cases, tag `@FRM-01` |

## Why
- Detection runs in the browser as a pure function over candles. The chart layer, the `/rates` route and the indicators are already there. The worker stays a trading process.
- Identifiers are English. The status value `secondary` means "only a secondary source"; it does not change the verdict.
- A candle counts as closed when `time + duration <= t`. All indicators are causal, so they are calculated once and cut to the closed part. The same detection can run in a backtest later.
- ATR(14) has no rule ID. It is an auxiliary measure for tolerances.
- Rejected: Python detection in the worker. The drawings would need a new API, and every change would need a VPS pull to see it.

## Open points
- An alert without an open browser needs the detection in Python or Node. This is decided when alerts are planned.
- `TimeframeView` copies its arrays on each `view(tf, t)` call. A per-candle backtest needs a length instead of a copy.
- Types and `parseFixture` have no caller yet outside the test. The next steps (FRM-02 and later) use them.
- The script `formation-fixture.mjs` is not run against a real worker in this step. Not verified.

## Verification
- `scripts/features/run.sh FRM-01`: green.
- `npm run lint` and `npx tsc --noEmit`: no output, no error.
