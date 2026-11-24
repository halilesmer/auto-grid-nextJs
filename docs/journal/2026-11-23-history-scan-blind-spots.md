---
date: 2026-11-23
author: Claude
type: diagnosis
status: open
pr: []
features: [FRM-39]
areas: [frontend]
---

# History scan: two blind spots are now counted (1122-A40)

## Request
The live history scan (`e2e/live/formation-history.spec.ts`) reports `candidateVanished` only for trades whose first point is inside the history window. It also counts `finishedBetweenScans` as one number. Two blind spots stay hidden. This is the first step of decision 1122-A40: make both countable. No check changes, no violation is added.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/live/formation-history.spec.ts` | `vanishedOutsideWindow.{running,finished}` (also by time frame and form, up to 3 examples of running cases). `finishedBetweenScans` is split into `endNeverShown.mainTf` (up to 3 examples) and `endNeverShown.contextTf`. Both counters are in the summary JSON and in the console line. |
| `docs/features/features.yaml` | FRM-39 live check text names the new counters. |

- `vanishedOutsideWindow`: an entered trade whose first point (`min(X, A)`) is before the history window of its time frame (`HISTORY_DAYS`) and that is missing in a later scan. It uses the same `remeasureAtVanish` and `vanishVerdict` as the other cases. It is a counter, not a violation.
- `endNeverShown.mainTf`: the trade is on the main time frame, ended between two scans and never showed its end. The user sees every candle of this time frame, so each case is a candidate against 1120-A42.1. `contextTf`: the same on a context time frame; it comes from the scan step (measurement error).
- Limit: for AB=CD the window starts at the entry (1122-A1.4 a), but the counter uses the first point (A), like the old check. An AB=CD trade with A outside and the entry inside the window is counted here as outside, not as `candidateVanished`. The XAUUSD runs have no such AB=CD case in the counter (see by-form table).

## Verification
Live scan, XAUUSD, DEMO account, read-only, under the heavy lock (`E2E_LIVE=1 FORMATION_HISTORY_SYMBOLS=XAUUSD FORMATION_HISTORY_TFS=<tf> FORMATION_HISTORY_BARS_<tf>=1560 FORMATION_HISTORY_STEP_<tf>=1`, all forms). `tsc` and `eslint` are clean.

| Counter | H1 main | H4 main |
|---|---|---|
| Scans | 1560 | 1560 |
| Violations | 0 | 0 |
| `finishedVanished` | 126 | 128 |
| `finishedBetweenScans` | 16 | 15 |
| `endNeverShown.mainTf` | 0 | 0 |
| `endNeverShown.contextTf` | 16 | 15 |
| `vanishedOutsideWindow.running` | 3 | 0 |
| `vanishedOutsideWindow.finished` | 3 | 1 |

The H1 `finishedBetweenScans` was 15 in the last earlier run; the extra case comes from the newer candles of this run (not verified in detail).

`vanishedOutsideWindow` by time frame and form: H1 main: running M15 BUT 2, M15 CRB 1; finished M15 GAR 1, M15 BAT 1, M15 BUT 1. H4 main: finished H4 GAR 1. All 3 running cases are harmonic trades on M15 (context of the H1 scan; the M15 window is 10 days). Each was at TP1 at the last scan.

## Open points
- [x] 3 running harmonic trades on M15 vanish outside the window (H1 scan, XAUUSD). Coordinator decision needed: does the chart show these trades? Cases (times are scan times, UTC): (done: PR 672)
  1. M15 BUT buy, first point 2026-09-28 17:45, entered 2026-10-08 06:00, last seen 10-08 17:00 (TP1), gone 10-08 18:00. Entry 4080.3, stop 4027.21.
  2. M15 BUT sell, first point 2026-10-29 23:00, entered 2026-11-05 03:00, last seen 11-07 00:00 (TP1), gone 11-09 02:00. Entry 4080.33, stop 4160.61.
  3. M15 CRB sell, same X, A, B, C as case 2, entered 2026-11-05 04:00, last seen 11-07 00:00 (TP1), gone 11-09 02:00. Entry 4135.07, stop 4236.26.
  In all 3 cases X is more than 10 days before the scan time at the vanish. The chart loads only the window of candles, so the trade may not be drawable at that moment. Not verified on the chart.
- [ ] `endNeverShown.mainTf` is 0 in both runs. One symbol only; other symbols not measured.
