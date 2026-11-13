---
date: 2026-11-13
author: Claude
type: diagnosis
status: open
pr: []
features: [ANA-21, FRM-03]
areas: [frontend]
---

# EWO trend rules put a low one bar late

## Request

A GBPUSD H4 Cypher from an outside chart does not show in the scan. The scan finds the same points, but measures X from 1.31528 (candle 2026-10-14 20:00). The deepest wick of the cluster is 1.31364 (candle 2026-10-14 16:00). D1 and H1 put the low on the deep wick. Find the root cause of the shift.

## Cause

Candles (DEMO account, GBPUSD H4, taken from the worker):

| Candle (UTC) | Low | Close | EWO 5/35 (median, ×1e5) |
|---|---|---|---|
| 2026-10-14 12:00 | 1.32023 | 1.32035 | +221.0 |
| 2026-10-14 16:00 | **1.31364** | 1.31548 | **+90.7** |
| 2026-10-14 20:00 | 1.31528 | 1.31936 | −41.6 |
| 2026-10-15 00:00 | 1.31788 | 1.32328 | −143.6 |

- Both the 16:00 and the 20:00 candle are support fractals (FRZ-01 to FRZ-04: no neighbor closes below the wick).
- The formations use the trend settings of the user (`formationTrend` → `buildTrend(tf, bars, wave, view.trend)`, `trdFormation.ts`). The chart default is `welle382` since 2026-11-12 (`DEFAULT_TREND_SETTINGS`, `params.ts`).
- `welle382` first runs `waveRule` (`trdZug.ts`, `waveRule`): `if (w === null || phaseSide(w) !== f.side) return null`, with `w = ewo[f.idx]`. A low is a point only when the EWO at the fractal candle is red (below 0).
- The EWO lags price. At 16:00 the EWO is still green (+90.7), so the rule rejects the deepest low. At 20:00 the EWO is red, so the rule accepts the higher low 1.31528. The pivot is one candle late and 16.4 pips higher.
- Rule `groesse` (size only) does not read the EWO. When the leg has the minimum size, it accepts the 16:00 low first (complete at 2026-10-15 00:00); the 20:00 low is not further out, so it is not drawn.
- D1 and H1 are correct because there the deep wick is already in a red phase: EWO −1502.4 (D1, 2026-10-14) and −435.3 (H1, 2026-10-14 18:00).

Effect on the Cypher: with X = 1.31528 the D point (1.32208) touches the 0.786 level. With X = 1.31364 the 0.786 level is 1.32148 and D does not touch it. The shifted pivot changes the result of the formation.

## Why

This is not a defect. It is the approved rule, and a test holds it:

- Rule text (`trdZug.ts`): "Je grüner EWO-Welle nur das höchste Hoch, je roter nur das tiefste Tief" (per green EWO wave only the highest high, per red wave only the lowest low).
- Test `formation-trd-lib.spec.ts` (FRM-03), "Regel welle: ein Hoch liegt in einer grünen, ein Tief in einer roten Phase": every pivot must have the EWO sign of its side at the fractal candle.
- The journal entry `2026-11-10-trend-rule-ewo-fibo382.md` keeps `waveRule` unchanged for `welle382`.

So no code changed. The shift happens each time the extreme candle comes before the EWO zero cross, which is common after a fast impulse (here: a 138-pip drop in three H4 candles, from the high 1.32747 at 2026-10-14 04:00).

## Verification

- EWO values: computed from the real candles with the same formula as `wave()` (`indicators.ts`: SMA 5 minus SMA 35 of `(high + low) / 2`).
- Fractal check of both candles: by hand against `probeFractal` (`frz.ts`).
- EWO sign of the low on D1 and H1: computed the same way.
- Not verified: a run of `buildTrend` on these candles in this session (the worktree has no `node_modules`). The result agrees with the `buildEnv` observation of the coordinator session (pivot 2026-10-14 20:00, 1.31528).

## Open points

- [ ] Decision of the project owner: keep the rule, or let a fractal count when the EWO has the color of its side at any candle from the fractal candle up to the candle that completes it (`idx` to `doneAt`). This option has no look-ahead (the decision stays at `doneAt`). Here the EWO is red at `doneAt` (2026-10-15 00:00, −143.6), so the 16:00 low would be the point and the 20:00 low would be weaker and not drawn. It changes the test above and maybe the GBPCAD reference count ("10 von 12") and other `welle`/`welle382` charts. A red test and a measurement over the fixtures come first.

## Lessons

- When a pivot is not on the deepest wick, look at the trend rule of the view first. EWO rules can reject the real extreme because the EWO lags.
