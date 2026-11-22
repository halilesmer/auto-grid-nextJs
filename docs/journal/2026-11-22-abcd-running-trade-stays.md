---
date: 2026-11-22
author: Claude
type: fix
status: closed
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# A running AB=CD trade stays in the search; the history scan measures again when a trade disappears

## Request
1121-A11.1: the live history scan (XAUUSD, main time frame H1, step 4, main ed0f2dcd) found 34 `candidateVanished` cases for AB=CD (M15 29, H1 4, H4 1). An entered AB=CD trade that was not finished was missing from a later scan.

## Diagnosis
The scan was run again (AB=CD only) with a temporary patch: at each vanish, the trade was measured again with the same A, B, C at the vanish time (`checkAbcdCandidate`). The same 34 cases occurred.

- 8 cases (all M15) were not violations. The trade ended between two scans (4 times TP1 and rest at entry, 4 times TP1 and TP2). In a scan with main time frame H1 and step 4, the scan sees M15 only every 4 hours. The spec used the state from the last scan that showed the trade. Example: M15 sell, entry 4118.72, TP1 at 21:00, ended at entry in the candle 21:30, missing at 02:00.
- 26 cases were real. The trade was `open` or `tp1` when it disappeared.

Root cause of the 26 cases: `selectPoints` (abcd.ts) takes the youngest C among the last `lookbackPivots` (6) pivots whose correction depth is valid, and `analyzeAbcd` returns one candidate for each time frame. When the D of the running trade becomes a pivot and a new pivot follows, the triple A = old C, B = old D, C = new pivot has a valid depth and is selected. This candidate has no trade. In all 26 cases A, B, C were still consecutive pivots and the old C was still in the window (2nd to 6th from the end). Thus the cause was the selection rule, not the window and not a pivot change. This is the same class as case 1 of the harmonic vanish (decision 1121-A1.3).

## Decision
1122-A1.3 (coordinator, approved): rule 1121-A1.3 of the harmonics applies to AB=CD. The spec measures a vanished trade again at the vanish time.

## Change
- `analyzeAbcd` (abcdChecks.ts): first the candidate of `selectPoints`, as before. Then it searches all triples of consecutive pivots whose A is in the history window of the time frame (`HISTORY_DAYS`) for an entered trade that is running or ends in the last candle. Such a trade has priority if its triple was the choice of `selectPoints` at the close of the entry candle (it was shown at entry). If there are more, the first entered wins; at the same entry candle, the youngest. A cheap filter skips triples whose D did not reach level 1 (with tolerance) or the −0.272 extension (no entry is possible). The choice at each close time is cached per context. The displaced candidate is in `AbcdAnalysis.displaced` and `ScanHit.displaced` (measurement only, no display). The AB=CD trade now carries `entryIdx`.
- Visible effect: while an AB=CD trade runs, the new candidate of the same time frame is hidden. Chart, list and alarm show the running trade until it ends.
- `e2e/fixtures/formation-vanish.ts`: `remeasureAtVanish` measures the trade again with the same points (AB=CD and GAR, BAT, BUT, CRB) and uses only candles closed at the vanish time. The trade is finished only if its end candle is before the last of these candles. A trade that ends in the last candle must still be shown, so its vanish is a violation.
- `formation-history.spec.ts`: `candidateVanished` uses this measurement for AB=CD and the harmonics. New counters: `finishedBetweenScans` and `hiddenTrades` (AB=CD candidates with an entered trade that a running trade hides; number only, no violation class).

## Evidence
- Red first: `formation-abcd-vanish-lib.spec.ts` (real XAUUSD H1 candles, 282 bars) failed on main at the expected assertion; the preconditions passed. The guard "the past stays" (candle by candle) also failed on main. With the change, all 3 tests pass.
- `formation-vanish-remeasure-lib.spec.ts`: the M15 trade that ended between two scans is not a violation (end candle 21:30); the H1 trade that is running when it disappears is a violation.
- All 48 formation lib spec files: 2092 passed.
- Live check (DEMO, read-only, heavy lock, `E2E_LIVE=1`, `FORMATION_HISTORY_TFS=H1 FORMATION_HISTORY_SYMBOLS=XAUUSD FORMATION_HISTORY_BARS_H1=6240 FORMATION_HISTORY_STEP_H1=4`): LIVE_RESULT

## Open
- The harmonic fix (branch of the harmonic vanish) adds the same priority search to `analyzeXabcd`. After it merges, a shared helper for both is possible.
