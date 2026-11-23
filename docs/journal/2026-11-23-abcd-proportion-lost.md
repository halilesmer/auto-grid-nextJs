---
date: 2026-11-23
author: Claude
type: fix
status: closed
pr: []
features: [FRM-05]
areas: [frontend]
---

# AB=CD: an ended trade with a lost proportion is not shown (1123-A, decision b1)

## Request
The chart (XAUUSD M15, trend rule `welle`, change after 2 closes) showed an AB=CD with a very long D leg: CD was 13.7 × AB. Halil: the legs of an AB=CD must be proportional; when the proportion is lost, the search looks for a new AB=CD. Decision b1: a running trade keeps its priority (1122-A1.3) and shows its end one time (1120-A42.1). After the trade ends, the proportion is measured. If D is farther from C than `maxCdAb` × AB, the AB=CD is not selected, and the selection continues with the next triple. If no triple is valid, the time frame has no AB=CD. Rule B (1122-A3.2), the identity of the trade and the history records do not change.

## Cause
- `selectOrder` (`abcd.ts`) selects C only by the correction depth (BC 0.382–0.728). No younger triple had a valid depth, so the same A, B, C stayed selected for two days.
- D is `extremeAfter(C)`. After the trade ended (stop by close in the candle 11-19 14:30), D moved to each new extreme wick. `dReached` and `shortfall` check only that Level 1 is reached; they have no upper limit.
- The ended trade had no priority (it was not running), but it stayed `picked` because no other triple was valid.
- Contributing cause (open finding): the trend rule `welle` applies no minimum leg size. AB was 17.19, below the minimum leg of the trend rules (2.5 × ATR). The standard rule `welle382` shows the case less often (M15, CD/AB > 1.618: 42 formations with `welle382`, 72 with `welle`).

Count before the change (local data, 110 fixtures and XAUUSD one year M15/H1/H4): each shown AB=CD with D more than 1.272 × AB beyond C had an entered trade; nearly all had an ended trade. Before the entry this cannot occur, because the entry is at Level 1.

## Decision
- b1 (Halil, 1123-A11): drop the ended AB=CD when the proportion is lost; search again.
- a1 (assumption): the limit is CD/AB ≤ 1.618 (`ABCD_PARAMS.maxCdAb`). The rule book gives no maximum for D; 1.618 is the longest extended AB=CD in a secondary source. Halil can change this one constant. Evidence that changes it: AB=CD examples that Halil calls proportional with CD/AB between 1.618 and 2.0.
- 1123-A15.1 (Halil: "1: orantı her zaman", the proportion applies always): the rule also applies to an ended trade with a re-entry section (Yeniden giriş, 1114-A4.4) or with the TP1-only warning. The price returns to the zone at D after TP2 (or TP1), and usually after the end of the trade. When D is then beyond `maxCdAb` × AB, the AB=CD is dropped and the re-entry is not shown. A re-entry is shown only when CD ≤ `maxCdAb` × AB.
- Not changed: a not-entered candidate (it cannot overshoot), a running trade, Rule B, the history records.

## Change
- `params.ts`: `ABCD_PARAMS.maxCdAb = 1.618`.
- `abcdChecks.ts`: `proportionLost(c, last)` is true when the trade ended before the last candle (`endIdx < last`) and |CD| > `maxCdAb` × |AB|. In `shownAt`, the picked loop skips such a candidate in the same way as a hidden one. The measurement starts after the end candle, so the end is shown one time.
- `formation-trade.spec.ts` (tests moved, checks kept, 1123-A15.1):
  - "TP1 only and price back in the zone": from `gar-buy-h4-01` (D moves to 2.36 × AB after the end) to the real `abcd-breakc-h4-01` (sell, running trade, TP1 only, CD 1.51 × AB).
  - "End at the stop" and "Level 1 reached: no C-leg section": `crb-form-h4-01` with the D wick at 100.25 (beyond the stop 100.356, CD 1.57 × AB) instead of the real 100.142 (CD 1.77 × AB). The C-leg test also asserts the status TP1+2.
- `chart-dock-formation.spec.ts` (UI-17, narrow window): the test failed in the precheck because the arrow menu was not visible in 7 s. First reading (wrong): the dropped H4 AB=CD removes one button, so the row fits. Measurement: after the end of the search, the arrow is visible at 480, 500, 520, 540, 560 and 600 px, and the test passes with one worker. Cause: the buttons (only forms with a hit) and the arrow come only at the end of the search, and the cold search over the mock candles takes about 10 s in Node (main and branch alike: main 9.5–11.1 s, branch 7.8–13.6 s, 4 runs each). Under load (3 workers) it was longer than the 7 s of the expectation. The test now waits for the end of the search (`data-scan-ms`, 30 s) before the checks. The checks did not change.
- `formation-abcd-frozen-from-lib.spec.ts` (test changed, intent kept): the case `crb-form-h4-01` ends at TP1+2 on 2025-11-18 08:00 with CD/AB 1.77. `analyzeAbcd` now selects another triple there. The test now asserts this and measures the 1121-A14.1 values of the same A, B, C with `checkAbcdCandidate`. All earlier assertions stay.

## Tests
- `formation-abcd-overshoot-lib.spec.ts` (@FRM-05, 6 tests, real XAUUSD M15 candles 11-14 to 11-20): precondition (stopped trade shown at its end), the case is dropped two days later, the measurement starts after the end candle, a running trade beyond 1.618 is not dropped, the next triple is selected after the drop, a not-entered candidate never exceeds `maxCdAb` (110 fixtures). Two more tests lock the drop in the real fixtures: `crb-form-h4-01` (TP1+2, re-entry before the rule) and `gar-buy-h4-01` (breakeven, TP1-only warning before the rule) show their end one time and are dropped after it.

## Evidence
- Harmonic outputs are equal to main (0 diff lines): sweep of the 110 fixtures, XAUUSD sets D1+W1+H4+H1 and H4+H1+M15.
- AB=CD replay dump of XAUUSD (4680 lines, 1560 scans): 988 lines differ. 985 lines: an ended trade with CD/AB > 1.618 is dropped (M15 42, H1 13, H4 6 formations); the replacement is a not-entered triple (731), an entered triple (139) or no AB=CD (115). 3 lines: a replacement triple that entered its trade later stays shown as a running trade (1122-A1.3); main showed another candidate there. No other difference. Violations: 0 on main and on the branch.
- Speed, cold `scanFormations`, 10 moments × 3 runs, versions in mixed order, minimum per moment, worst moment: H4+H1+M15 main 9.60 s, branch 9.94 s (limit 15 s); D1+W1+H4+H1 main 1.79 s, branch 1.75 s (limit 3.2 s).
- Live scan XAUUSD H1 (DEMO, read-only, 1560 candles, every candle): 1560 scans, 0 violations, 128 ended trades removed by the rule; passed in 34.5 min.

## Open
- The trend rule `welle` applies no minimum leg size. A small AB can make a formation from a swing that belongs to a lower time frame. Separate decision.
- Side note: localhost:3000 ran the older main v0.7.686 on 2026-11-23. That version does not have 1121-A14.1, so the target Fib lines of the ended trade went to the moved D.
