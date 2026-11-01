---
date: 2026-11-01
author: Claude
type: fix
status: done
pr: []
features: [BKT-07]
areas: [frontend, tests, docs]
---

# Backtest charts keep their own candles per timeframe

## Request
A Codex audit of `/backtest` found 10 faults. This entry covers B9 (two charts overwrite each other) and B10 (wrong wording in the rules).

## Cause
With "both candle paths", the page shows two charts. Each chart has its own timeframe. The store kept only one `chartRequestId` and one `chartData` for each setup. A request from one chart cleared the buffer. The other chart used the buffer only when the timeframe matched, so it showed "Loading" and never asked again.
B10: `docs/analyse-regeln.md` said "SL first" for TP and SL in the same path segment. The code (`pathBroker.ts`, `runner.ts`) and the tooltip say: only when both have the same trigger price. The code is correct.

## Solution

| File | Change |
|---|---|
| `src/store/useBacktestStore.ts` | `charts`: one buffer (request ID and candles) for each timeframe. A request clears no other timeframe. Candles stay until the new answer comes. |
| `src/hooks/useBacktestRun.ts` | `expectChartRequest` gets the timeframe. |
| `src/components/backtest/BacktestChart.tsx` | Reads the buffer of its own timeframe. |
| `docs/analyse-regeln.md` | §5 wording: SL first only at the same trigger price. |

## Why
There are 7 timeframes at most, so the memory stays bounded. The worst case is 7 timeframes of up to 50,000 candles for each setup, about three times the old size. A new run, an account change and a cancel replace the whole run object, so all buffers are freed. A stale answer is still rejected: its run ID or request ID must match. Both charts use the same candles, so one buffer for each timeframe is enough. Alternative rejected: one buffer for each chart. It would store the same candles twice.

## Verification
- New e2e test in `backtest-replay.spec.ts` (BKT-07): red before the fix (second chart stays at 0 candles), green after.
- `backtest-chart-lib.spec.ts` extended: a request for M5 keeps the M1 candles.
- `npx playwright test e2e/mocked/backtest` → 271 passed.
- `npx tsc --noEmit` and `npm run lint` → no errors.

## Lessons
- Do not share one buffer between views that each have their own state. Key the buffer by what the view asks for.
