---
date: 2026-11-23
author: Claude
type: fix
status: closed
pr: []
features: [FRM-07, FRM-39]
areas: [frontend]
---

# Harmonic base and entry freeze at the entry (1122-A28.1, 1122-A29.2)

## Request
A harmonic trade that the search shows at the close of its entry candle must stay on the screen with the same points X, A, B, C, the same entry candle, entry and stop until it ends ("the past stays the past"). Rule decision 1122-B1.2 = D: a trade that is not shown at the close of its entry candle is never shown (1122-A3.2). Done criteria: no shown running trade vanishes (LOST 0), no trade appears after its entry close (LATE 0), the AB=CD results do not change, and the cold `scanFormations` of XAUUSD has a worst case of at most 15 s for H4 + H1 + M15 and at most 3.2 s for D1 + W1 + H4 + H1.

## Cause
The trend line (`buildTrend` / `applyEdit` in `trd.ts`) changes pivots before the entry when a later fractal arrives: it moves the last pivot to a more extreme wick, or it removes B and C when a new extreme passes B. The search built the bases only from the pivots of the current time (`allBases(pivots)`). After such a change the base of the running trade was missing, or it was measured again with a different pivot before X (`deepestWickX`), so the trade key changed and rule B hid the trade. Sweep of the 110 formation fixtures on main: 77 shown running trades vanished.

Examples (fixture candles, fixture trend):
- `cdt-top-h4-02`, Gartley sell, entry 201.494 in the candle 11-07 16:00: at 11-08 00:00 the trend moves C from 11-07 04:00 to 11-07 12:00 and the trade vanishes.
- `bat-sell-h4-01`, Crab sell, entry 182.635 in the candle 12-09 16:00: at 12-10 04:00 the trend removes B and C and the trade vanishes.

## Change
- `trd.ts`: `TrendModel.spans` records the life of each pivot (`from`: candle where the trend added it, `to`: candle where it removed it, else `Infinity`). The pivots of the trend at an earlier candle k are the spans with `from <= k < to`. The record uses only candles up to k, so there is no look-ahead.
- `xabcd.ts`: the priority search takes its bases from `historicBases`: each base of four consecutive pivots that existed at any candle in the window, together with the pivot before X at that candle. A base that is equal to a base of the last candle uses the current measurement (`candidateFor`). The open trades are sorted by entry candle; `hidden` (rule B, PR 648) is computed only until the first trade that was shown at its entry is found. This stop does not change the result.
- `shownTrade.ts` (shared helpers): `recordShown` also keeps the points of the shown candidate (`Shown.points`, `pointsKey`). When more than one base gives the same trade, the base with the points that were shown at the entry close wins (`frozenOf`), then the base with the fewest misses.
- `sig.ts`: `engulfZones` keeps its result for each candle list (`bars`, `wide`). The function depends only on these two arrays; the search asked for it again for each base and each earlier close. The result is the same; the profile of the worst moment showed 41 % of the time in this function.
- Rejected: a cache of "dead" bases per context. It depends on the order of the calls and is not correct, because a removed base can come back into the trend and enter later (LOST 1 on CYP `trd-ref-h4-audnzd`).

## Tests
- `formation-harmonic-base-freeze-lib.spec.ts` (@FRM-07 @FRM-39): the two examples above; a fresh context gives the same result as the run candle by candle; candle by candle, each trade shown at its entry close keeps its points, entry candle, entry and stop until it ends; at each candle k from 10, the pivots from `spans` are equal to `formationTrend(view, k).pivots` (both fixtures).
- `formation-scan-speed-lib.spec.ts`: the trend checksum leaves out `spans`. The field is bookkeeping that grows with each removed pivot; the checksum locks the other fields of the trend model, and the new spans test above locks `spans` against the trend at every candle.

## Evidence
- Harmonic sweep, 110 formation fixtures × GAR, BAT, BUT, CRB, CYP, H4, candle by candle (full view of each shown candidate): main (f5618d6c, before the rebase) LOST 77, LATE 0; this change LOST 0, LATE 0. After the rebase onto a1ee72ad and after the `engulfZones` change, the dump (103,810 lines) is equal to the dump before the rebase (0 lines different).
- AB=CD: replay of XAUUSD H1, 1560 scans: 0 violations; the full dump (4,680 lines) is equal to main a1ee72ad (0 lines different).
- XAUUSD, 10 moments, D1 + W1 + H4 + H1 and H4 + H1 + M15, full view of all forms: equal to main a1ee72ad (150 lines per set, 0 different), and equal before and after the `engulfZones` change.
- All lib specs passed (2749), under the heavy lock.
- Live check, DEMO account, read-only (`e2e/live/formation-history.spec.ts`, XAUUSD H4, 1560 scans, step 1): 0 invariant violations.
- Cost, cold `scanFormations` (all forms), XAUUSD, under the heavy lock. The same 10 moments as in 2026-11-22-harmonic-shown-at-entry-speed, each 3 times, versions in random order; the value of a moment is the smallest of the 3. Load average at start 3.0, at end 3.2.

| Timeframes | Version | Median | p90 | Worst case (moment) |
|---|---|---|---|---|
| D1 + W1 + H4 + H1 | main (a1ee72ad) | 1.06 s | 1.90 s | 2.02 s (11-10 00:00) |
| D1 + W1 + H4 + H1 | this change | 0.91 s | 1.54 s | 1.72 s (11-10 00:00) |
| H4 + H1 + M15 | main (a1ee72ad) | 8.1 s | 11.1 s | 12.4 s (09-18 20:00) |
| H4 + H1 + M15 | this change | 7.3 s | 9.5 s | 9.5 s (10-27 23:00) |

  Without the `engulfZones` change (same method, an earlier run): D1 + W1 + H4 + H1 worst case 3.14 s, H4 + H1 + M15 worst case 19.1 s (09-18 20:00). The profile of that moment: 9.4 s of 19.8 s in `engulfZones`, called from `zonesNear` for each base.
