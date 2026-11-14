---
date: 2026-11-14
author: Claude
type: feature
status: open
pr: []
features: [BKT-30]
areas: [frontend, backtest]
---

# Backtest builds the live bot turn schedule (BKT-30, PR-2)

## Request

PR-1 lets the engine take a turn schedule (`RunModel.botTurns`). PR-2 builds that schedule from live data. Source: project owner, 2026-11-13 (decisions 1113-G4.1, K39.1): telemetry first (ENG-35), order history only as fallback.

## Solution

New file `lib/backtest/turnSchedule.ts`. Pure functions, no network. Wiring into `runJob` and the worker call are PR-3.

| Function | Use |
|---|---|
| `scheduleFromTelemetry` | Primary. Turns of `GET /api/bot/{id}/turns`, only `kind=t`. |
| `scheduleFromLiveOrders` | Fallback for windows without telemetry. Chain rule; empty turns are aligned backwards to the next real turn, so no short fake turn appears. |
| `estimateClockOffset` | Clock shift between telemetry (UTC) and order history (broker time). |
| `liveOpsFromOrders`, `clusterOps`, `decodeTurns`, `botTurnsFor` | Helpers. |

- Clock: broker time = telemetry + whole-hour offset (input, from `GET /market/{id}/clock`) + one constant shift. The shift is the median of: first op of each live op cluster minus (turn start + `pre` + 0.105 s). Two passes; one value for the whole window; the function returns the shift, p10/p90 and the number of pairs. Fewer than 5 pairs: shift 0, `reliable` false.
- `zoneAt` per setup = turn start + `pre` + 0.105 s + SLTP load + cost of the ops of lower magics in that turn (setup 0.225 s, delete 0.102 s, constants from `botTurns.ts`).
- SLTP load: telemetry does not show it. If the first live op of a turn is later than expected (0 to 1 s), the difference is the SLTP load (class B of the NFP measurement). Option `sltp: 'none'` switches it off.
- Op counts of lower magics (G4.1): from live order history by default; with `ownOps` (the op log of a first backtest pass) from the backtest itself.
- The result carries `source` (`telemetry` or `liveOrders`), turn count, aligned cluster count, clock estimate and `opCounts` (`live` or `own`). PR-3 writes this into `run.botTurns`.

## Measurement

Fixed data, read-only, fill latency 5 ms (N2, measurement only). Full notes: private session notes (`bkt30-pr2-dogrulama`).

| Check | Result |
|---|---|
| Fallback source, P6+ | sum of net differences 0.01, unmatched 0, K4 failed 0 (same as the prototype) |
| Fallback source, P7 | 1.10, 0, 0 (same as the prototype) |
| G4.1, op counts from the backtest itself, P6+ | 0.01, 0, 0 |
| G4.1, op counts from the backtest itself, P7 | 22.95, K3 failed 1: setup 200047 goes 0.00 → 21.85 |
| Telemetry, window 2026-11-13 16:40 to 21:00 UTC | 7416 turns, 55 of 55 live clusters aligned, shift -0.042 s, p10 -0.010 s, p90 +0.096 s |
| Same window, four arms (fallback, telemetry with and without SLTP load, no schedule) | all 0.04, 0 unmatched, 0 K4 failed (22 pairs; quiet window, information only) |

- G4.1 result: the backtest own op counts break P7, so live counts stay the default. `ownOps` stays as an option.
- The telemetry shift is small and stable. The quiet window cannot separate the sources; NFP and P8 can.

## Open points

- PR-3: wiring in `runJob`, protocol field `run.botTurns`, worker GET.
- Default stays off. Decision after NFP and P8 (2026-11-16).
