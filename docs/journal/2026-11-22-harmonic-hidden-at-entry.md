---
date: 2026-11-22
author: Claude
type: fix
status: closed
pr: []
features: [FRM-07, FRM-12, FRM-39]
areas: [frontend]
---

# A harmonic trade that was not shown at entry is never shown (1122-A3.2)

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

Cost of B on a cold context (XAUUSD D1, W1, H4, H1; 20 runs; per form): median 216–310 ms, worst case 1.2 s. Before: median 141–284 ms, worst case 0.9 s. The coordinator accepted this.
- C: change only the scan, so that it does not count these cases. This conflicts with 1120-A42.1.

The decision is about the trade, not about the base. So "shown at entry" compares the trade: side, time of X, entry candle and entry price. The first version compared the four pivot times X, A, B, C. In the fixture `but-bad-h4-01` it hid a trade that was shown at entry (entry 100.093), because the trend later moved the C pivot from 11-03 20:00 to 11-04 00:00, before the entry candle. That was a new vanish, so the identity was changed to the trade. C is frozen at entry (1121-A2.1), so C is not part of the identity.

## Change
- `xabcd.ts`: `tradeKey(candidate, bars)` (side, X, entry candle, entry). The cache per context and time holds the trade key of the best base (before it held the base key). `hidden(candidate)`: an entered trade whose key is not the key at the close of its entry candle. `analyzeXabcd` shows the best base without a hidden trade (`bestRecent(…, skip)`). The priority of a running trade uses the same check.
- Tests:
  - `e2e/mocked/formation-harmonic-vanish-xau-lib.spec.ts` (real XAUUSD candles, fixture `formation-vanish-xau-rows.ts`): the 3 cases are never shown; guard: candle by candle in all 3 windows, each shown entered trade was shown at the close of its entry candle; the 3 guards "no running trade is lost" stay.
  - The first test was written for the old diagnosis (precondition: the search shows the Butterfly trade at 01-30 12:00). It now checks that the trade exists (`checkButCandidate`: entry 5310.8, TP1, no end), that a buy base was shown at entry, and that the search does not show the trade at 01-29 20:00, 01-30 12:00 and 01-30 16:00.
  - `formation-but-lib.spec.ts`: new test with `but-bad-h4-01`. At the close of the entry candle (11-04 08:00) the search shows the trade (entry 100.093) with C 11-03 20:00; at 11-06 00:00 C is 11-04 00:00, and the search still shows the same trade (side, X, entry, entry candle).
  - `formation-cyp-lib.spec.ts`: `cyp-bad-h4-02` and `cyp-lib-h4-02` took their candidate from the search. In both, the trade was not shown at entry, and the search now shows another base. The tests measure the same points with `checkCypCandidate` (points measured on the old code), assert that the search does not show the trade, and assert the base it shows instead: for `cyp-bad-h4-02` a buy base (X 2025-11-21 12:00, no trade), for `cyp-lib-h4-02` a sell Cypher (X 2025-12-05 08:00, entry 1.16631, shown at its entry). The state, side and verdict assertions did not change (same pattern as `bat-sell-h4-02` in 1121-A5.1).

## Evidence
- On the old code, the 6 tests of `formation-harmonic-vanish-xau-lib.spec.ts` failed; with the change they passed. All formation lib specs passed (2016).
- Live scan: see below.
