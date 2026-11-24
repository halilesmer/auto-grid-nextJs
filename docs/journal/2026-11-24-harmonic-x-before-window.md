---
date: 2026-11-24
author: Claude
type: fix
status: open
pr: [672]
features: [FRM-07, FRM-39, FRM-08]
areas: [frontend, tests]
---

# Harmonic search: a running trade stays when X leaves the history window (1114-A4, step 2b)

## Request
Last open class of plan 1114-A4 (`2026-11-24-formation-window-lead-in.md`, "Open points", step 2b). A running harmonic trade vanished when X left the history window, although its entry was still in the window. Rule 1124-A3 (a): a running trade that leaves the screen is always fixed in the same plan. Rule 1122-A1.4 a: the window of a running trade counts from its entry.

Cases (XAUUSD M15, DEMO account A, read-only): Butterfly sell (entry 11-05 03:00, 4080.33, TP1) and Crab sell (entry 11-05 04:00, 4135.07, TP1). Both have X 2026-10-29 23:00, A 10-30 22:45, B 11-02 18:30, C 11-03 11:00. Both vanished at 2026-11-09 00:00 in the chart, lead-in and full context.

## Cause
`analyzeXabcd` (`xabcd.ts`) looks for the running trade among the bases of `historicBases`. That list holds only bases whose X is in the window (`windowStart = at - HISTORY_DAYS`) or whose C is among the last pivots now (`recent`). At 11-09 00:00 the M15 window starts at 10-30 00:00, after X. C (11-03) is no longer among the last six pivots. So the base was not measured and the trade vanished. AB=CD does not have this problem: it searches C two windows back and keeps a trade only if `entryInHistory`.

## Solution
A simple copy of the AB=CD rule (X up to two windows back) was too expensive. Mock page run: candidate measurements 5,556 → 9,438 (guard 6,000), 10× the time. It was not used.

The used rule comes from rule B: a trade that was not shown at the close of its entry candle is never shown. At that close the trade entered in the last candle, so only the best base among the last `lookbackPivots` pivots of that time can show it. So a base with X before the window can carry a running trade with an entry in the window only if its C was among the last `lookbackPivots` pivots at a candle in the window.

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/xabcd.ts` | `historicBases`, `historicBasesRef`, `historicBasesSweep`: new parameter `lookback` (default 0). At a time whose pivots are valid up to a candle in the window, the last `lookback` positions also count. `analyzeXabcd` passes `HARMONIC_PARAMS.lookbackPivots`. A base with X before the window counts only with a running trade whose entry is in the window (`entryInHistory`). Before the measurement, such a base is skipped when D (the outermost wick since C) is before the window: the entry (first touch of the D level, `harmonicFreeze`) is at the D candle or before it. `windowStart` now uses `historyStart` from `shownTrade.ts`. |
| `frontend_nextjs/e2e/mocked/formation-harmonic-x-window-lib.spec.ts`, `e2e/fixtures/formation-harmonic-x-window-xau-rows.ts` | New test with real XAUUSD M15 candles (10-19 to 11-09) and the window of the page (`formationRequests`, `ratesWindow`). |
| `frontend_nextjs/e2e/mocked/formation-bases-sweep-lib.spec.ts` | Sweep and reference give the same bases also with `lookback` 6. |
| `docs/features/features.yaml`, `FEATURES.md` | FRM-07 description and test. |

The checks, the counters of the history scan and the work guards of the golden spec do not change.

## Verification
- Red first: the new spec with `xabcd.ts` of main: 2 failed. BUT is missing from 11-09 01:15 (the first candle of the week) and its end is not shown; CRB the same. With the fix: 2 passed. The trades run until their end, show the end once and then go: BUT ends at the close 11-09 02:45 (breakeven), CRB at 11-09 22:00 (breakeven).
- `formation-bases-sweep-lib.spec.ts`: 110 passed (`lookback` 0 and 6).
- Golden (§4.10): 118 passed, no hash changed (110 fixtures, 3 page runs, 5 candle walks). Work of the page runs (main → fix): candidate measurements USOUSD 5,556 → 5,760, EURUSD 05:00 5,038 → 5,236, EURUSD 14:00 5,015 → 5,211 (guard 6,000); key builds 57,011 → 58,766, 44,442 → 45,768, 48,463 → 49,832 (guard 75,000). The guards stay as they are. The brief and the lead-in journal give 30,000 as the key-build guard; the file has 75,000 and 6,000 since PR 669.
- Cost of a cold `scanFormations` (method of `2026-11-24-formation-window-lead-in.md`): window of the page (`formationRequests`, `ratesWindow`, `splitDaily`), the same 10 moments, each 3 times, versions in random order in one process, smallest of 3, under the heavy lock. Code: main 6df8856b against this branch. The result size was the same for both versions at all 20 measurements.

| Timeframes | Version | Median | p90 | Worst case | Limit 1122-B4 |
|---|---|---|---|---|---|
| D1 + W1 + H4 + H1 | main | 0.43 s | 0.63 s | 0.86 s | 3.2 s |
| D1 + W1 + H4 + H1 | fix | 0.62 s | 0.77 s | 0.80 s | 3.2 s |
| H4 + H1 + M15 | main | 0.62 s | 0.87 s | 0.97 s | 15 s |
| H4 + H1 + M15 | fix | 0.80 s | 1.08 s | 1.49 s | 15 s |

  The main values are higher than in the lead-in journal (worst 0.55 s and 0.64 s); during this run the dev server and the browser processes of another session were active. Both versions ran under the same conditions.
- Live history scan, chart context, XAUUSD, DEMO account A, read-only, under the heavy lock (1560 scans each, H1 step 1):

| Main timeframe | `candidateVanished` | `vanishedOutsideWindow` running / finished | ms per scan |
|---|---|---|---|
| H4 (before: lead-in journal) | 0 | 0 / 1 | 214 |
| H4 (this branch) | 0 | 0 / 1 | 181 |
| H1 (before) | 0 | 2 / 10 | 316 |
| H1 (this branch) | 0 | 0 / 11 | 253 |

  No other violation. The two running cases are now finished trades: they end in the window and vanish later as finished trades (finished BUT 1 → 2, CRB 0 → 1). Finished ABCD 3 → 2 does not come from this change (AB=CD code is the same): the scan ends at the current time, so its range moved some hours since the earlier run.
- `tsc --noEmit` and `eslint` on the changed files: no error.

## Decision
- Plan 1114-A4 is closed (rule 1124-A3 (a)): in the chart context the target classes and the running class are zero for XAUUSD H4 and H1.
- Confidence of the `lookback` rule: high for the trade that the search showed at its entry. Evidence that changes it: a running trade with an entry in the window whose C was never among the last `lookbackPivots` pivots of a candle in the window, for example when the trade at the entry close was shown through another base with the same trade key.

## Open points
- [ ] Other symbols (S1, S2 of 1124-A2) are not measured in the chart context.
- [ ] Margin of the work guard: the page runs use up to 5,760 of 6,000 candidate measurements. A later change that adds measurements must look at this guard first.

## Lessons
A cheap necessary condition from an existing rule (here rule B: shown at the entry close) limits a search better than a wider window. Measure the work guard of the golden spec before the time: the time on a loaded Mac is noise, the count is not.
