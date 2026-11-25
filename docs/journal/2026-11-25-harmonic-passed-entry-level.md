---
date: 2026-11-25
author: Claude
type: fix
status: closed
features: [FRM-12, FRM-07, FRM-08, FRM-39]
areas: [frontend]
---

# Harmonic patterns made fake trades when the entry level was already passed

## Request
Coordinator 1124-A1: PR 689 freezes D at the stop candle of an ended harmonic trade, but not when the freeze would change entry, stop, entry candle or end candle (`evaluateFrozenD`). 4,721 of 84,479 ended trades fell into this exception (Bat 4,200, Cypher 521).

## Cause
The entry level can lie on the wrong side of C. `harmonicFreeze` (`tradeApply.ts`) measures "wick reached the level". If the level lies between C and the opposite side, the first candle after C "touches" it at once.
- Cypher: in all 225 bases C does not pass A or X (it is on the wrong side of X). Example buy: X 98.428, A 99.262, B 95.709, C 96.767. The level 0.786 of X → C is 98.07, above C. The candle after C is the entry, the stop lies above the entry, and the next candle ends the trade as "stopped".
- All these bases are invalid (CYP-01, CYP-04). The bug existed before PR 689.
- Bat has a second class (see Numbers).

## Rule
A level counts as touchable only if it lies on the D side of C: `outward(es, level) > outward(es, c.price)`. Otherwise `harmonicFreeze` returns `null` and the pattern has no trade (entry, stop, status: none). It applies to Gartley, Bat, Butterfly, Crab and Cypher, because all five call `harmonicFreeze`. `cypChecks.ts` now builds the trade only with a freeze. AB=CD has its own entry (`abcdTrade`): level 1 is `C + (B − A)` (`abcd.ts`). For an ordered pattern (B beyond A) it always lies on the D side of C, so the class does not exist there; AB=CD does not change.

## Numbers
Measured with a temporary counter in `evaluateFrozenD` over all fixtures and the walk tests (the counts include repeated measurements; compare only before and after).
- Exception (frozen D differs): before 18,530 (Bat 16,191, Cypher 2,339); after 9,314 (Bat 9,314, Cypher 0).
- Evaluations that return `null` from the new rule: Bat 20,881, Butterfly 11,835, Crab 8,738, Cypher 18,726, Gartley 0. All have the verdict `invalid`; none is `valid` or `forming`.
- Remaining 9,314 Bat cases, all invalid: B lies beyond X (BAT-01), so the level 0.886 lies before B. The trade enters at the level, but BAT-07 needs D beyond B. With D frozen at the stop candle D has not passed B yet, so BAT-07 is unmet and the frozen pattern has no trade. A level-before-B rule would remove them; it is not part of this change.
- Golden hashes: 43 of the scans changed, 118/118 pass after the update. Before and after were compared with `GOLDEN_FULL_DIR`: every changed hit is `invalid`; no `valid` or `forming` hit changed. In the three walk tests only invalid Bat/Butterfly hits differ (seven Bat trades vanish in two walks, and different invalid bases are selected).

## Test change
`formation-harmonic-vanish-xau-lib.spec.ts` (Butterfly sell, XAUUSD H1 January) used the fake trade (entry 5310.80) as precondition. The base is invalid (BUT-01, BUT-03) and its D level 4671.75 lies before C 5105.51. The precondition now asserts that there is no trade; the "never shown" assertions stay.

## Tests
- `formation-cyp-lib.spec.ts` (@FRM-12): new case with the real shape (X 98.428, A 99.262, B 95.709, C 96.767). Red before the fix (entry 98.0725), green after. The valid base keeps its trade.
