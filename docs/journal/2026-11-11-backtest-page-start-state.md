---
date: 2026-11-11
author: Claude
type: feature
status: open
pr: []
features: [BKT-25]
areas: [frontend, tests, docs]
---

# Backtest page starts from the live state at window start

## Request

The browser backtest page did not pass `initialPositions`, `initialOrders` and `initialFractalDone` to the run. Positions and pending orders that were open at the start of the window were missing from the result (plan K5.1, steps 1 to 7, frontend part PR-C).

## Solution

The start state is applied automatically. There is no switch and no new control. Conditions: saved setup, MT5 data source, M1, numeric `zone.magic`, window start in the past.

| File | Change |
|---|---|
| `components/backtest/BacktestView.tsx` | Checks the conditions and the archive coverage; passes `startState.deals` (filtered by magic) or the note `run.startStateMissing` |
| `lib/backtest/protocol.ts` | `RunParams.startState` |
| `lib/backtest/runJob.ts` | Fetches the orders once per job, calls `buildStartState`, passes the seed to every pass and both paths |
| `lib/backtest/runner.ts` | INFO line `run.startPositions` |
| `i18n/messages/backtest.ts`, `hints.ts` | Two new log texts and a longer hint, tr/en/de |
| `e2e/fixtures/mock-worker.ts` | Route `GET /history/{id}/orders` |

## Why

- If the archive does not cover the window start, the run is not blocked. It runs without a seed and writes WARN `run.startStateMissing`, so the owner still gets a result.
- A failed orders request counts as "not available" (WARN `run.startOrdersMissing`). The positions are still seeded.
- Both paths (lowFirst, highFirst) get the same seed, so they stay comparable.

## Verification

- `@BKT-25`: 6 lib tests and 4 page tests pass (`scripts/features/run.sh e2e BKT-25`).
- The lib tests were red before the change (5 failed, 1 passed: the regression test), then green.
- Without `startState` the result is identical (trades, summary, equity).

## Open points

- [ ] Show the start state in the result table (K5.2).
- [ ] Manual check on the VPS with a DEMO account (plan §4.2 and §4.3).
