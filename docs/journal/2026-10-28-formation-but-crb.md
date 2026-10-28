---
date: 2026-10-28
author: Claude
type: decision
status: open
pr: []
features: [FRM-13, FRM-14]
areas: [frontend]
---

# Formation detection: Butterfly and Crab (step E13)

## Request
Add the harmonic patterns Butterfly (BUT, 16 rule IDs) and Crab with the variant Deep Crab (CRB, 16 rule IDs) to the formation library: one check per rule ID in both directions, the points X, A, B, C and D from candles, and the drawings Z-BUT-01 to Z-BUT-06 and Z-CRB-01 to Z-CRB-05.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/but.ts` | Prices that only the Butterfly needs: the target D at 1.272 beyond X and the AB extension 1.618 |
| `frontend_nextjs/src/lib/formation/butChecks.ts` | `analyzeBut`, `checkButCandidate`, checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/crb.ts` | The target D at 1.618 beyond X and the zones at D without the broken X zone |
| `frontend_nextjs/src/lib/formation/crbChecks.ts` | `analyzeCrb`, `checkCrbCandidate`, checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/xabcd.ts` | Three new functions (`closedBeyondB`, `higherWith`, `lowerReversal`); no existing function changed |
| `frontend_nextjs/src/lib/formation/params.ts` | `BUT_PARAMS`, `CRB_PARAMS`; every number refers to FIB, ABCD or the harmonic parameters, except the BC projection 2 and the BC projections 2.618 and 3.618 |
| `frontend_nextjs/e2e/fixtures/formation-harmonic.ts` | Helpers shared by both specs |
| `frontend_nextjs/e2e/mocked/formation-but-lib.spec.ts`, `formation-crb-lib.spec.ts` | Hand-calculated cases, coverage test, mirror case, delimitation, no look into the future, real candles, tags `@FRM-13` and `@FRM-14` |
| `frontend_nextjs/e2e/fixtures/formation/but-*.json`, `crb-*.json` | 13 files of real H4 candles |
| `docs/features/features.yaml` | New features FRM-13 and FRM-14 |

Gartley, Bat, Cypher, ABCD and the other patterns keep their behaviour. No UI.

## Why
- Both patterns have the same point order as Gartley, Bat and Cypher, so they use the shared XABCD core. The difference is the place of D: beyond X, at 1.272 (Butterfly) or at 1.618 (Crab) of the fib X to A.
- The Crab and the Deep Crab share one check list. Both pairs of variant rules (B for the Crab, B for the Deep Crab) are always measured. A pattern is valid when one pair holds. This keeps a met and an unmet case for every rule ID.
- The two patterns do not share a verdict. The same points can be a Butterfly (B at 0.8, D at 1.272) or, with a lower B and a deeper D, a Crab. The tests show both directions of this delimitation.

## Choices without a rule source
- **BU-1** The core rules are required or exclusion, the filters are bonus (decision E-1 of the rule book). All IDs have the status "secondary" (only from the course material, not from the teacher).
- **BU-2** BUT-01 and CRB-01 also check the four conditions of the point structure: finished fractals at X and A, A as an impulse turning point, and that the points change sides. The rule book names only the impulse.
- **BU-3** The break of B (BUT-06, CRB-05) counts closes after C up to the candle of D. Without D it counts up to the last candle. If the break is missing, the pattern is "forming", not "invalid", because D is searched only after the break.
- **BU-4** The target D is the level itself (1.272 or 1.618), not the measured D. All "near D" rules (BUT-09 to BUT-12, CRB-10 to CRB-12) measure the distance to this level, so they work before D is reached.
- **BU-5** BUT-07 and CRB-04 have no upper limit. A D far beyond the level stays met.
- **BU-6** CRB-12 skips the zone that X forms. The rule book says the broken X zone alone does not count. BUT-12 uses the plain zone function of Gartley and Bat.
- **BU-7** BUT-09 uses the projection of B to C at 2 beyond C (price = C + 2 × (B − C)). CRB-10 and CRB-11 pass when at least one of their two levels is near the target D.
- **BU-8** BUT-15 and BUT-16 use the next loaded time frame (higher or lower). Without it they are "not measurable". CRB-15 is only the time frame H4. BUT-14 and CRB-14 use the tie variant of the divergence (equal or weaker wave) as Gartley does.
- **BU-9** The verdict "invalid" for the Crab needs a failed variant pair. A B between 0.786 and 0.886 fits neither variant and gives "invalid". A B at or beyond X excludes both.
- **BU-10** In a valid Deep Crab the rule CRB-07 (the Crab exclusion) is met. This means "the Crab variant is excluded", not a problem. The verdict ignores the pair that does not fit.

## Test cases
- Hand-calculated series with the points X 100, A 130; one series for the Butterfly (B 0.8, D 1.2733), one for the Crab (B 0.6, D 1.62) and one for the Deep Crab (B 0.9). Each rule has a met and an unmet case. Level checks have a case 0.005 inside and a case 0.02 outside the tolerance of 1 pip (0.01).
- Real candles: scan of 13 symbols on H4 (2025-10-03 to 2026-03-31) with 810 candles each. Every candle from the 150th was a test time. The fixtures hold up to 200 candles before and 50 after the test time. They are measured finds, not examples from the course material (the course material has none for these patterns).

## Open points
- On the real data many structures pass the core (38 different valid Butterflies and 57 different valid Crabs in 4.5 months and 13 symbols). The filters decide the quality: the PRZ rules and the RSI rule are met in a minority of cases.
- No real case with a higher time frame (D1) or a lower one (H1) is loaded. BUT-15, BUT-16 and CRB-16 are covered only by hand-made series. BUT-12 and CRB-12 are met in real cases and unmet in hand-made series.
- The variant rules are measured in both pairs. A UI that shows a verdict per variant needs a decision by the project owner (show the variant name, hide the pair that does not fit).
