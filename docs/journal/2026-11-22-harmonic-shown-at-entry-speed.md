---
date: 2026-11-22
author: Claude
type: fix
status: closed
pr: []
features: [FRM-07, FRM-39]
areas: [frontend]
---

# Harmonic "shown at entry" check without zones (1122-A41.1)

## Request
PR 648 made the harmonic search compute, recursively, which trade it showed at the close of an entry candle (1122-A3.2). A measurement with many moments showed that this made the cold `scanFormations` much slower. Halil chose "speed up first" (1122-A41.1, option A). Done criterion: the shown candidates are identical to main; worst case for H4 + H1 + M15 below 15 s; worst case for D1 + W1 + H4 + H1 not worse than main.

## Correction to the cost in 2026-11-22-harmonic-hidden-at-entry
The cost table in that entry ("worst case 5.6 s") measured one moment only (10 runs). The measurement below uses 10 moments and two sets of timeframes. It replaces that number.

## Cause
For each earlier close that the decision needs, `tradeAt` built a full environment at that close: the trends of all timeframes and the fractal and engulf zones (`analyzeFrz`). For an M15 entry it built two (head timeframe and M15). The profile of BUT on XAUUSD H4 + H1 + M15 at 2026-10-27 23:00 (main): 13.5 s in total, of which 10.5 s in `analyzeFrz`, 2.2 s in trends and 0.7 s in the evaluation of the bases.

## Change
- `reasons.ts`: `buildEnvWithoutZones(ctx, t, tf)` gives the same views, trends and fibs as `buildEnv`, with empty zones. Without zones the environment does not depend on the entry timeframe; in a `shareEnv` scope it is computed once per time for all timeframes and all forms.
- `xabcd.ts`: `tradeAt` uses `buildEnvWithoutZones`. Which trade is shown depends only on the form conditions (`misses`: form IDs and point exclusions, the Crab variant), on the entry and on the state of the trade. None of them reads a zone. In the harmonic evaluation, zones are read only by bonus rows (zone at D: GAR-10, BAT-11, BUT-12, CRB-12, CYP-09; reversal in the lower timeframe: BUT-16, CRB-16) and by SIG-29. The candidate that the search returns at the current time is still computed with the full environment.
- Test: `formation-harmonic-shown-at-entry-lib.spec.ts` checks that the environment without zones has the same views, trends and fibs as the full one, empty zones, and is computed once per time.

## Evidence
- Shown candidates, branch against main (f5618d6c):
  - sweep of 110 formation fixtures × GAR, BAT, BUT, CRB, CYP, H4, candle by candle (full view of each shown candidate: side, X/A/B/C, entry candle, entry, stop, state): 103,810 lines, 0 different.
  - XAUUSD, 10 moments, D1 + W1 + H4 + H1 and H4 + H1 + M15, all timeframes, full view including the state of each check: 150 lines per set, 0 different.
- All lib specs passed (2730), under the heavy lock.
- Cost, cold `scanFormations` (all forms), XAUUSD, under the heavy lock. Versions: PR 647 (72315a31), main (f5618d6c, PR 648), this change. 10 moments (the worst of an earlier run with 34 moments: 2026-10-27 23:00, 10-14 22:00, 10-01 21:00, 09-18 20:00, 11-10 00:00, 08-25 16:00, 08-12 15:00, 09-07 17:00, 07-30 14:00, 07-08 06:00). Each moment 3 times, in random order over the versions; the value of a moment is the smallest of the 3. D1 is made from the H4 candles (not the 1100-day live window). Load average at start 9.6, at end 6.4.

| Timeframes | Version | Median | p90 | Worst case (moment) |
|---|---|---|---|---|
| D1 + W1 + H4 + H1 | PR 647 | 0.95 s | 1.52 s | 1.70 s (10-27 23:00) |
| D1 + W1 + H4 + H1 | main | 2.11 s | 3.11 s | 3.19 s (11-10 00:00) |
| D1 + W1 + H4 + H1 | this change | 0.82 s | 1.15 s | 1.20 s (11-10 00:00) |
| H4 + H1 + M15 | PR 647 | 6.7 s | 10.3 s | 10.4 s (10-14 22:00) |
| H4 + H1 + M15 | main | 12.6 s | 24.2 s | 27.3 s (10-27 23:00) |
| H4 + H1 + M15 | this change | 6.4 s | 9.2 s | 9.2 s (09-18 20:00) |

  Per form at 2026-10-27 23:00, H4 + H1 + M15 (smallest of 3): main GAR 3.9 s, BUT 10.6 s, CRB 5.2 s, CYP 2.0 s, BAT 1.3 s (total 27.8 s); this change GAR 1.2 s, BUT 1.6 s, CRB 1.1 s, CYP 0.6 s, BAT 0.4 s (total 9.6 s).
