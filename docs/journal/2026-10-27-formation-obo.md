---
date: 2026-10-27
author: Claude
type: decision
status: open
pr: []
features: [FRM-10]
areas: [frontend]
---

# Formation detection: head and shoulders (step E10)

## Request
Add the head and shoulders pattern (OBO, and TOBO for the mirror case) to the formation library: one check per rule ID, the points LS, N1, K, N2 and RS from candles, the neckline break, and the drawings Z-OBO-01 to Z-OBO-08.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/obo.ts` | Building blocks: finished peaks of one side, candidates (head, left and right shoulder), neckline price, close beyond the neckline, two closes beyond a zone edge, close beyond the right shoulder |
| `frontend_nextjs/src/lib/formation/oboChecks.ts` | `analyzeObo`, `checkOboCandidate`, checks per ID, verdict, drawings Z-OBO-01 to Z-OBO-08 |
| `frontend_nextjs/src/lib/formation/params.ts` | `OBO_PARAMS`; "near" reads `ABCD_PARAMS` |
| `frontend_nextjs/e2e/mocked/formation-obo-lib.spec.ts` | Hand-calculated cases, coverage test, mirror cases, delimitation from the double top and from the Libra, flip from valid to invalid, real candles, tag `@FRM-10` |
| `frontend_nextjs/e2e/fixtures/formation/obo-*.json` | 5 files of real H4 candles |

The code reuses `trendDirUpTo` (`f2618.ts`), `fractalDone` (`xabcd.ts`), `swingsAfter` and `innerLevels` (`lib.ts`), `divergenceOf`, `zoneGeometry` and the wide-candle flag. FRZ, TRD, FIB, SIG, ABCD, CDT, GAR, BAT, 2618 and LIB keep their behaviour.

## Why
- Everything is causal. LS, K, RS, N1 and N2 are finished fractals. The right shoulder may be missing: then the pattern is forming and every check that needs it is unmeasurable.
- Choice of the points: for each side, K is one of the last three peaks, LS one of the two peaks before it that lie less far out (with no peak between that reaches K), RS one of the later peaks or none. N1 is the farthest finished fractal of the other side between LS and K, N2 the same between K and RS. The candidate with the fewest unmet form rules wins. On a tie, the one with a finished right shoulder wins, then the latest.
- The neckline is the straight line through the wick tips of N1 and N2, extended to the right. The break is the first candle after RS whose close lies beyond it. A wick alone does not break it.
- OBO-05 (no trend change before the neck break): two closes in a row beyond the zone of N1 between N1 and N2 mean the trend turned. The pattern is then a Libra, not a head and shoulders. A test shows the same candles as a valid Libra.
- Target (not a check): head height h = head price minus neckline at the head. Target = neckline at the break candle minus h (plus h for TOBO). OBO-10 compares it with the D of an AB=CD that starts at RS.
- Verdict: invalid when an exclusion is met, or one of OBO-01 to OBO-05 is unmet, or the break candle is not wide. Forming when RS or the break is missing. Valid else.

## Choices without a rule source
- OBO-06 and OBO-07 follow the assumptions in the rule book (ratio 0.8 to 1.25; the right shoulder lasts 1.5 times as many candles as head to N2). OBO-06 is met also when OBO-07 is met (the exception).
- OBO-07 counts the candles from N2 to the break candle. Without a break it is unmeasurable.
- OBO-08 uses a strict divergence (wave high at K lower than at LS). The rule text says "lower", not "lower or equal".
- OBO-10 builds the AB=CD from swing points after RS (fractals), not from the trend model: the trend model has no turning points in the move after the break. "Near" is 0.5 times ATR(14) at the break candle.
- OBO-12 is unmet when there is no break candle but the pattern is complete (RS finished). It is unmeasurable when RS is missing.
- OBO-13 is measured with closes of the formation timeframe only. The rule says that a close in a lower timeframe does not count, so a lower timeframe never changes the result.
- OBO-14 follows the same list as LIB-16 (M15, the only timeframe below H1 in the context).

## Open points
- The real candles are scan results from the broker, not drawn examples. The examples in the rule book have no usable date. The mapping stays in the local test list.
- The scan over 12 symbols found 58 valid states (one per verdict change of each point set). Many of them have gaps of only 2 candles between neighbouring points: the library measures the rules, it does not judge the quality of a setup.
- A pattern with the right shoulder before the break (the retest case) is not covered.
- The score of the choice prefers a finished right shoulder over a newer unfinished one. A new head that is still forming is shown only if no finished candidate has fewer unmet rules.

## Verification
- `scripts/features/run.sh FRM-10`: 47 tests passed.
- `scripts/features/run.sh FRM`: 556 tests passed.
- `npm run lint` and `npx tsc --noEmit`: no output.
