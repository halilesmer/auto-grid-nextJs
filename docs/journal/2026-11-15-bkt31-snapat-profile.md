---
date: 2026-11-15
author: Claude
type: feature
status: done
pr: []
features: [BKT-31]
areas: [frontend, backtest]
---

# Backtest: price-read time per turn and calibration profile (BKT-31, PR-1)

## Request

Plan 1114-M1 (two-phase turn). PR-1 is the pure base: carry the telemetry fields to the schedule and collect the broker-bound constants. Source: project owner decision 1114-K63, 2026-11-14.

## Solution

| File | Change |
|---|---|
| `botTurns.ts` | `BotTurns.snapAt?`: time of the price read for each turn. Missing means `starts`. The run does not read it yet. |
| `botTurnsLoad.ts` | `mergeTelemetry` keeps `snap`, `nsl`, `z0`, `nsl0`. Before, it dropped them. A part without these fields gives `null`. |
| `turnSchedule.ts` | `TelemetryTurns.nsl0` and `DecodedTurn.nsl0`. `TurnSchedule.snapAt`: `start + snap`; `snap` null gives `start`. `botTurnsFor` passes it on. |
| `calibration.ts` | New. `CalibrationProfile` and `DEFAULT_PROFILE`. The old constants (head 0.105 s, op costs, fill latency 1 ms, cluster gap, chain slack) now read from it. The values are the same. |

## Verification
- `npx tsc --noEmit`: no error.
- Playwright `@BKT-30` and `@BKT-31` lib specs (turn schedule, bot turns load, tick order, turn phases): 45 passed.
- The engine and the runner do not read `snapAt`. A run with the same input gives the same result as before.

## Open points
- [x] PR-2 uses `snapAt` (flag `turnPhases`, off by default). (done: PR 593)
