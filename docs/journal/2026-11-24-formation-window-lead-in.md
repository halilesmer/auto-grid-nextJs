---
date: 2026-11-24
author: Claude
type: fix
status: open
pr: []
features: [FRM-38, FRM-05, FRM-39]
areas: [frontend, tests]
---

# Formation search: the window start moved the trend pivots (1114-A4, chart context)

## Request
Plan 1114-A4 stayed open after the history scan measured the chart context (`2026-11-24-history-scan-chart-context.md`): XAUUSD `candidateVanished` H1 1, H4 5, the same cases 0 with the full context. Find the root cause and fix it. Examine the two running M15 cases of `vanishedOutsideWindow` (BUT and CRB sell, X 10-29 23:00).

## Cause
`buildTrend` is a state machine that starts at the first loaded candle. The search loads `HISTORY_DAYS` (H4 120, H1 40, M15 10, D1 400 days). The start of this window moves: live at each new broker day, in the past search (`?at=`) and in the history scan at each step. When the start moves, the trend draws the pivots near the start again, and the kind of a pivot (impulse or correction) can change. The pivots of a running trade did not change, but the pivot before X and the search of the entry close (rule B, `tradeAtOf`) did. Then a running trade vanished, or a trade that the full context never shows appeared and later vanished.

Measurement (XAUUSD, DEMO account A, read-only; local copy of the candles):
- Context swap at the vanish time of the H4 GAR sell (X 2025-10-20 20:00, entry 12-12 16:00, gone 12-13 04:00): only the H4 window changes the result. The candidate itself has the same checks in both contexts. The pivot before X is 08-22 in the full context and 09-18 in the chart context at 04:00 (window start 08-15 04:00 instead of 08-14 20:00).
- The D1 BAT sell and the H1 GAR sell are trades that only the chart context shows. The D1 window (400 days) causes the first, the H1 window the second.
- Pivots inside the history window (plus the two pivots before it) against a context with one year of candles. Without lead-in: different at almost every moment. With a lead-in of one window: H4 0 of 1063 moments, H1 0 of 709, M15 0 of 449. With 60 days H4 lead-in: 15 of 265.
- D1 with `welle382` does not converge with a lead-in (a long rally has no 38.2 % correction). Day-to-day changes of the D1 pivots inside the window: view of 400 days 66 of 355 days; view of 1100 days 30 of 355; fixed start (all candles) 30 of 355.

Two more findings:
- The running AB=CD search of 1122-A1.4 a looks for C up to two windows back (`historyStart(tf, start)`). The chart context had only one window of candles.
- The M15 BUT and CRB sell (X 10-29 23:00, entries 11-05 03:00 and 04:00, state TP1) vanish at 11-09 00:00 in all contexts (chart, lead-in, full). At that time X leaves the M15 history window. `historicBases` in `xabcd.ts` stops at a base with X before the window start, unless C is among the recent pivots. The entry is in the window, so by 1122-A1.4 a the trade must stay. This is a different class and is not fixed here.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/params.ts` | `TREND_LEAD_DAYS`: one history window of lead-in for H4, H1, M15. |
| `frontend_nextjs/src/lib/formation/requests.ts` | `LOAD_DAYS` (history window plus lead-in; D1 the W1 history); `formationRequests` uses it. `gapInHistory`: only a missing range inside the history window sets the gap notice. |
| `frontend_nextjs/src/lib/formation/weekly.ts` | `splitDaily(bars, missing)`: the D1 view is the whole loaded D1 history (W1 history, 1100 days). |
| `frontend_nextjs/src/components/formation/FormationScanRunner.tsx`, `src/hooks/useFormationScan.ts` | New `splitDaily` call; gap notice through `gapInHistory`. |
| `frontend_nextjs/e2e/mocked/formation-window-start-lib.spec.ts`, `e2e/fixtures/formation-window-start-xau-rows.ts` | New test (real XAUUSD M15 candles). |
| `frontend_nextjs/e2e/mocked/formation-past-lib.spec.ts`, `formation-w1-lib.spec.ts` | The request window and the D1 view follow the new rule. |
| `frontend_nextjs/e2e/mocked/formation-scan-golden-lib.spec.ts`, `e2e/fixtures/formation-scan-golden.json` | The page runs load `LOAD_DAYS`, like the page. |
| `frontend_nextjs/e2e/live/formation-history.spec.ts` | Loads `LOAD_DAYS`; `splitDaily` call. The exception "first point before the window" is still the history window, not the lead-in. |
| `docs/features/features.yaml`, `FEATURES.md` | FRM-38 description and tests, FRM-05 test. |

The search itself stays in the history window (`HISTORY_DAYS`). The checks and the counters of the history scan do not change.

## Verification
- Red first: `formation-window-start-lib.spec.ts` on the old request window: 2 failed. The running AB=CD buy (entry 09-24 13:30) is missing from 09-26 14:30 (a Saturday: no new candle, only the window start moves). With all candles loaded, it runs. After the change: 2 passed.
- `formation-past-lib`, `formation-w1-lib`, `formation-window-start-lib`: 126 passed.
- Golden (§4.10): only the three page runs change (`page:USOUSD@2026-11-12T16:21:00Z`, `page:EURUSD@…05:00:00Z`, `page:EURUSD@…14:00:00Z`). Cause: the page run now loads the lead-in and the D1 view of 1100 days. The 110 fixtures and the candle walks are equal. Key builds stay below 30,000 (26,839 at most). Re-recorded with `GOLDEN_UPDATE=1 KEY_MAX=30000`; then 118 passed.
- Live history scan, chart context, XAUUSD, DEMO account A, read-only, under the heavy lock (H4 default, H1 1560 scans step 1):

| Option | `candidateVanished` H4 / H1 | ms per scan H4 / H1 |
|---|---|---|
| Before (journal 2026-11-24-history-scan-chart-context) | 5 / 1 | 90 / 150 |
| D1 view only, no lead-in | 4 / 1 | 107 / 139 |
| Half lead-in (H4 60, H1 20, M15 5 days) | 0 / 0 | 154 / 227 |
| One window lead-in (this branch) | 0 / 0 | 214 / 316 |

  No other violation in these runs. `vanishedOutsideWindow.running` stays 2 in the H1 scan (M15 BUT and CRB sell, see Cause).
- Cost of a cold `scanFormations`, all forms, the 10 moments of `2026-11-22-harmonic-shown-at-entry-speed.md`, each 3 times, versions in random order, value = smallest of 3, under the heavy lock. The context is the window that the chart loads (`formationRequests`, `ratesWindow`, real D1 candles). Code: main 6461b065 (with PR 669).

| Timeframes | Version | Median | p90 | Worst case |
|---|---|---|---|---|
| D1 + W1 + H4 + H1 | main | 0.21 s | 0.23 s | 0.24 s |
| D1 + W1 + H4 + H1 | D1 view only | 0.24 s | 0.27 s | 0.27 s |
| D1 + W1 + H4 + H1 | half lead-in | 0.33 s | 0.38 s | 0.43 s |
| D1 + W1 + H4 + H1 | one window | 0.41 s | 0.54 s | 0.55 s |
| H4 + H1 + M15 | main | 0.27 s | 0.31 s | 0.33 s |
| H4 + H1 + M15 | D1 view only | 0.27 s | 0.30 s | 0.34 s |
| H4 + H1 + M15 | half lead-in | 0.41 s | 0.45 s | 0.46 s |
| H4 + H1 + M15 | one window | 0.55 s | 0.63 s | 0.64 s |

  The numbers of the earlier entries (H4 + H1 + M15 worst 13.10 s) do not come from the chart window: with the chart window, main before PR 669 had 0.44 s at the same moments. Those runs probably used a context of one year. In that method the lib code is the same on main and on this branch.
- Worker load (one request, warm cache, 3 times): H4 513 → 1021 candles, 50 → 58–64 ms; H1 631 → 1296, 56 → 69–77 ms; M15 592 → 1236, 52–55 → 66–69 ms. D1 unchanged. The 60 s refresh asks only for the tail and does not change. The alarm runner loads the full windows for each favorite in each 15-minute slot: 1.7 × the candles.
- `tsc` and `eslint` on the changed files: no error.

## Decision open
The speed rule of 1122-A41.1 says: D1 + W1 + H4 + H1 not slower than main. Each lead-in breaks it (0.24 s → 0.43 s or 0.55 s). The limit of 15 s for H4 + H1 + M15 is kept. Not merged; the coordinator takes the choice to Halil.
- Recommendation: one window of lead-in. Confidence: medium. Reasons: only one window gave 0 differences of the pivots; the AB=CD search of running trades and the rule-B search of the entry close both need one more window of candles. Evidence that changes it: half lead-in also gives 0 cases on other symbols.

## Open points
- [ ] Decision: one window, half window or no lead-in (coordinator, Halil).
- [ ] Harmonic running trade vanishes when X leaves the history window (M15 BUT and CRB sell, X 10-29 23:00). Fix in `xabcd.ts` `historicBases` like 1122-A1.4 a for AB=CD. It needs the lead-in candles.
- [ ] Other symbols (S1, S2 of 1124-A2) are not measured in the chart context.
- [ ] `precheck.sh` on this branch: not run yet (waits for the decision).

## Lessons
A path-dependent indicator (here the trend) depends on the first loaded candle. A search over a moving window needs a lead-in, or the window start must not move. Measure the cost with the same window as the screen; a measurement on a larger context hides the change.
