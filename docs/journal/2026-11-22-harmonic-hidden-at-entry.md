---
date: 2026-11-22
author: Claude
type: fix
status: closed
pr: [648]
features: [FRM-07, FRM-12, FRM-13, FRM-14, FRM-39]
areas: [frontend]
---

# A harmonic trade that was not shown at entry is never shown (1122-A3.2, 1122-A3.4)

## Request
After PR 647, the XAUUSD H4 history scan still showed 9 harmonic `candidateVanished` violations. 6 of them come from sparse sampling of the scan (another task). This entry is about the other 3, which come from the search itself.

## Cause
In all 3 cases the last pivot of the trend moved while the swing continued. A base whose C was this moving pivot was the best base at the close of the entry candle. The trade of a different base was not shown at entry. When the pivot moved, that other base became the best, and the search showed its trade as "already running". When the next pivot came, a different base became the best. The priority of 1121-A1.3 (a running trade that was shown at entry stays) did not apply, so the running trade vanished.

- H1 Butterfly sell, X 2026-01-14 21:00, C 01-29 17:00, entry 5310.80 in the candle 01-29 18:00. The pivot 01-29 17:00 is confirmed only at the close 01-29 20:00. At the close of the entry candle (01-29 19:00) a buy base (C 01-29 01:00) was shown. The Butterfly was shown from 01-29 20:00 and vanished at 01-30 16:00, when the trend moved C to 01-30 11:00.
- H4 Gartley buy, X 10-07 12:00, C 10-16 16:00, entry in the candle 10-22 20:00. At entry, a sell base (C 10-21 04:00, the last pivot) was shown. The Gartley was shown from 10-23 16:00 (open, then TP1) and vanished at 10-28 16:00.
- H1 Gartley buy, X 10-02 04:00, C 10-05 11:00, entry in the candle 10-07 15:00. At entry, a sell base (C 10-07 12:00) was shown. The Gartley was shown from 10-07 20:00 and vanished at 10-08 12:00.

The first diagnosis put case 1 under 1121-A2.1 (C frozen at entry). The measurement showed that case 1 was also not shown at entry, so it has the same cause as cases 2 and 3.

## Decision
1122-A3.2 (Halil, 2026-11-22, option B): a trade that was not shown at entry is never shown. If the best base carries such a trade, the next best base is shown. Nobody could have entered that trade, and a trade that appears "already running" can vanish with the next pivot move.

Not chosen:
- A: a running trade that was shown once stays until it ends. On a cold context (first page load) this cost 0.7–9.2 s per form (median) and up to 35 s.
- C: change only the scan, so that it does not count these cases. This conflicts with 1120-A42.1.

The decision is about the trade, not about the base. The identity of a trade is its side, entry candle and entry price. X and C are not part of it: the trend can move them after entry, and the trade stays the same (1121-A2.1). The price is part of it: with only side and entry candle, a stale base (fixture `gar-buy-h4-03`, a sell base with C in October, entry 0.58246) matched another trade in the same candle (entry 0.57962, the one that was shown) and was shown, which breaks B (1122-A3.4.1, option a).

"Shown at a close" is the result of the search at that close: after the hidden trades are skipped and after the priority of a running trade (1122-A3.4). The first version of this change recorded the best base only. Review found two gaps:
1. Skip: the best base carried a hidden trade, the next best base was shown, and its trade entered in that candle. The trade was counted as hidden, so it was never shown (or, when shown, it vanished at the next close).
2. Priority: another running trade was shown, the best base carried a trade that entered in that candle. The new trade was counted as shown and appeared "already running" after the other trade ended.

A trade that enters in the last candle is not hidden at that close, and it has no priority there: it is shown only as the best base.

## Change
- `xabcd.ts`: `tradeKey(candidate, bars)` (side, entry candle, entry). `analyzeXabcd` computes the shown candidate per close (`shownAt`) and caches its trade key per context, form and close. `hidden(candidate)` looks up the trade shown at the close of its entry candle and computes that close recursively if it is not in the cache. Each base is measured once per decision.
- Tests:
  - `e2e/mocked/formation-harmonic-vanish-xau-lib.spec.ts` (real XAUUSD candles, fixture `formation-vanish-xau-rows.ts`): the 3 cases are never shown; guard: candle by candle in all 3 windows, each shown entered trade was shown at the close of its entry candle (same side, entry candle, entry); the 3 guards "no running trade is lost" stay. The first test was written for the old diagnosis (precondition: the search shows the Butterfly trade at 01-30 12:00). It now checks that the trade exists (`checkButCandidate`: entry 5310.8, TP1, no end), that a buy base was shown at entry, and that the search does not show the trade at 01-29 20:00, 01-30 12:00 and 01-30 16:00.
  - `e2e/mocked/formation-harmonic-shown-at-entry-lib.spec.ts` (fixtures, candle by candle): skip case `bat-sell-h4-01` (Butterfly sell, entry 182.139 in the candle 2025-12-09 08:00, shown as the next best base, stays at 12-10 04:00); priority case `abcd-breakc-h4-01` (Gartley: a sell runs from 2026-08-21; buy trades that entered meanwhile are never shown).
  - `formation-but-lib.spec.ts`: `but-bad-h4-01` identity test (C moves from 11-03 20:00 to 11-04 00:00, before the entry candle; the same trade stays). `but-buy-h4-02`: at its entry close a running sell (entry 1.32155) was shown, so the search does not show the buy; the test measures the same points with `checkButCandidate` and asserts that the search shows the running sell. The points take their price from the candle: a rounded price (1.31926 instead of the high 1.3192599999999999) failed the exact fractal check of BUT-01. All assertions stay.
  - `formation-cyp-lib.spec.ts` (`cyp-bad-h4-02`, `cyp-lib-h4-02`) and `formation-crb-lib.spec.ts` ("Abgrenzung echt", `gar-sell-h4-01`): the search now shows another candidate. The tests measure the old points with `checkCypCandidate` / `checkCrbCandidate` and assert the candidate that the search shows instead. The state, side and verdict assertions did not change (same pattern as `bat-sell-h4-02` in 1121-A5.1).

## Cost
Cold context (first page load), XAUUSD D1, W1, H4, H1, `scanFormations` (all forms, as on the page), 10 runs. The scan runs in a web worker; the UI does not block, the formation result comes later.

| Version | Median | Worst case |
|---|---|---|
| main (PR 647) | 1.8 s | 2.4 s |
| First version of this change | 2.6 s | 2.9 s |
| This change | 4.25 s | 5.6 s |

Per form (this change, median / worst case): GAR 1.6 / 2.0 s, BUT 1.1 / 2.7 s, BAT 0.7 / 1.3 s, CRB 0.66 / 1.5 s. A sequential candle-by-candle run costs about 35 % more. One speed-up was tried (each base measured once per decision): no effect on the result, 1 % faster. Halil chose to merge at this cost (1122-A31.1, option A); a deeper speed-up is a separate task.

## Evidence
- The 2 tests of `formation-harmonic-shown-at-entry-lib.spec.ts` fail on the first version of this change and pass on this change. The 6 tests of `formation-harmonic-vanish-xau-lib.spec.ts` fail on main and pass. All formation lib specs passed (2019).
- Sweep: 110 formation fixtures × GAR, BAT, BUT, CRB, CYP, candle by candle, with the history window of the scan:
  - "shown later" (a shown entered trade that was not shown at the close of its entry candle): 1528 on the first version, 0 on this change;
  - "lost" (a shown running trade is missing at the next close and has not ended): 79 on the first version, 77 on this change. 5 losses closed, 3 are new (Cypher in `crb-deep-h4-01`, `obo-gone-h4-01`, `t618-buy-h4-01`). The 3 new ones are trades that the first version never showed; now they are shown and vanish when their entry price moves (see open findings).
  - The sweep output is identical before and after the speed-up.
- Live scan, XAUUSD H4, DEMO account, read-only, under the heavy lock (`E2E_LIVE=1 FORMATION_HISTORY_TFS=H4 FORMATION_HISTORY_SYMBOLS=XAUUSD FORMATION_HISTORY_BARS_H4=1560 FORMATION_HISTORY_STEP_H4=1`, 1560 scans, 456 ms per scan):
  - before (main after PR 647): harmonic `candidateVanished` 9; first version of this change: 5; this change: 7. `entryChanged` 0. No new violation type. The 3 cases of this entry are not in the list. The 5 AB=CD `candidateVanished` cases belong to another task.
  - All 7 harmonic cases come from the sampling of the H1 context in the H4 scan (one H1 analysis per 4 H1 candles). A lib replay with the same candles found these cases at the H4 cadence and none of them candle by candle (H1 step 1). Example: H1 Gartley sell, X 2025-12-05 17:00, entry 4235.38 in the candle 12-10 22:00. It ends at breakeven in the candle 12-11 17:00 (shown at 18:00); the H4 scan sees it at 16:00 (TP1) and next at 20:00, when it is gone.
  - The 2 cases that are new against the first version are H1 Butterfly sells (X 2026-07-29 10:00): entry 4082.75 (candle 08-03 01:00), TP1 and TP2 at the close 08-03 17:00; entry 4069.27 (candle 08-04 03:00), stop at the close 08-05 05:00. Both ends fall between two H4 scans. They were not in the list of the first version; the likely reason is gap 1 above (not verified against the first version).

## Open findings
- The 77 lost running trades: when the trend moves X or C to an earlier candle after entry, the search measures the base again and the entry price moves (fixture `cdt-top-h4-02`: Gartley sell, entry 201.494 → 201.675; Cypher fixtures: 0.7934645 → 0.7934324). The trade then has a different identity, counts as hidden and vanishes. Proposal: freeze the base and the entry at entry.
- The drawn points of the same trade can change: two bases that enter in the same candle at the same price are the same trade, and the priority of a running trade takes the one with fewer unmet conditions. Fixture `bat-sell-h4-01`: the Butterfly sell (entry 182.139) is drawn with X 2025-12-03 12:00 until 12-10 00:00 and with X 2025-11-28 00:00 from 12-10 04:00. This rewrites the past visually; the history scan can count it as `candidateVanished` (its key holds X, A, B, C). The same proposal (freeze the base at entry) closes it.
- Speed-up of the recursive decision (worst case 5.6 s on a cold context).
