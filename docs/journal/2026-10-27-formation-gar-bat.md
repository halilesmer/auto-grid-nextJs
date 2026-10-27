---
date: 2026-10-27
author: Claude
type: decision
status: open
pr: []
features: [FRM-07, FRM-05]
areas: [frontend]
---

# Formation detection: Gartley and Bat (step E7)

## Request
Add the Gartley (GAR) and the Bat (BAT) to the formation library: one check per rule ID, the points X, A, B, C and D from candles, and the drawings Z-GAR-01 to Z-GAR-06 and Z-BAT-01 to Z-BAT-06.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/xabcd.ts` | Shared XABCD core: points X, A, B, C from four turning points, D as the outermost wick since C, retracement and level helpers, touch with a pip tolerance, zones near D, close beyond X, space check, higher timeframe against the trade, `analyzeXabcd`, `checkXabcd` |
| `frontend_nextjs/src/lib/formation/garChecks.ts` | `analyzeGar`, `checkGarCandidate`, checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/batChecks.ts` | `analyzeBat`, `checkBatCandidate`, checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `HARMONIC_PARAMS`, `GAR_PARAMS`, `BAT_PARAMS`; levels read `FIB_PARAMS`, targets read `ABCD_PARAMS` |
| `frontend_nextjs/e2e/mocked/formation-gar-bat-lib.spec.ts` | Hand-calculated cases, coverage test, mirror cases, delimitation, real candles, tag `@FRM-07` |
| `frontend_nextjs/e2e/fixtures/formation/gar-*.json`, `bat-*.json` | 9 files of real H4 candles |

The AB=CD inside the pattern comes from `shapeOf` in `abcd.ts`. FRZ, TRD, FIB, SIG, ABCD and CDT keep their behaviour.

## Why
- Everything is causal. X, A, B and C are finished fractals at time t. D is the outermost wick since C and needs no fractal.
- Choice of the points: C is one of the last six turning points; X, A and B are the three before it. The candidate with the fewest unmet form rules wins. On a tie the latest wins.
- Touch rules: the required levels (GAR-03, GAR-04, GAR-05, BAT-05, BAT-06, BAT-07) count as touched up to one pip before the level. The forbidden levels (GAR-15, GAR-16, BAT-14) have no tolerance. A B between 0.618 minus one pip and 0.618 is both a Gartley and a Bat candidate.
- GAR-05 has no upper limit for D. A close beyond X (GAR-18, BAT-17) ends the pattern for new entries.
- GAR-08 and BAT-08 use the correction depth of C (0.382 to 0.728, as in ABCD-04 and ABCD-06). GAR-09 and BAT-09 measure the distance between the AB=CD level and the pattern level in ATR(14).
- BAT-02 replaces BAT-01 when X to A is not yet an impulse. Its kind is required then, else a bonus.
- Verdict: invalid when an exclusion is met or a required rule other than D is unmet. Forming when only D is missing. Unmeasurable never blocks, except BAT-01 unmet with BAT-02 unmeasurable: that stays invalid.

## Choices without a rule source
- One pip is 0.0001 for pairs, 0.01 for JPY pairs and silver, 0.1 for gold, 0.01 for other symbols.
- GAR-01 and BAT-01 read A as a turning point of kind impulse. GAR-21 also needs X and A as neighbouring turning points.
- GAR-02 and BAT-04 measure that the points change sides (X and B on one side of A, C on the other side of B).
- GAR-07 accepts a distance of 0.05 of X to A from level 0.786.
- GAR-19 needs weekly candles. The context has none, so the rule is never met.
- The "borderline" display for B near a forbidden level is not part of the library. The state `value` carries the ratio.
- GAR-11 and BAT-10 measure only the two numbers (30 candles, 4 ATR), not the position inside a trend.

## Open points
- A D far beyond the pattern level (near or beyond X) stays valid until a close beyond X. The real cases `gar-sell-h4-01` and `bat-buy-h4-01` show this.
- The real candles are scan results from the broker, not drawn examples. The mapping stays in the local test list.
- ABCD-16 (harmonic D) stays unmeasurable in this step.

## Verification
- `scripts/features/run.sh FRM-07`: 58 tests passed.
- `scripts/features/run.sh FRM`: 436 tests passed.
- `npm run lint` and `npx tsc --noEmit`: no output.
