---
date: 2026-10-27
author: Claude
type: decision
status: open
pr: []
features: [FRM-09]
areas: [frontend]
---

# Formation detection: Libra (step E9)

## Request
Add the Libra (LIB) to the formation library: one check per rule ID, the points P1, C, P2 and P3 from candles, the touch of the entry edge, and the drawings Z-LIB-01 to Z-LIB-07.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/lib.ts` | Building blocks: pairs P1/P2, correction fractal C, candidates for P3, break beyond C, touch of the first reached edge, close beyond P2, swing points after P3, inner AB=CD, entry choice and CRV |
| `frontend_nextjs/src/lib/formation/libChecks.ts` | `analyzeLib`, `checkLibCandidate`, checks per ID, verdict, drawings Z-LIB-01 to Z-LIB-07 |
| `frontend_nextjs/src/lib/formation/params.ts` | `LIB_PARAMS`; levels read `FIB_PARAMS`, "near" reads `ABCD_PARAMS`, harmonic targets read `ABCD_PARAMS.targets` |
| `frontend_nextjs/e2e/mocked/formation-lib-lib.spec.ts` | Hand-calculated cases, coverage test, mirror cases, delimitation from the double top, flip from valid to invalid, real candles, tag `@FRM-09` |
| `frontend_nextjs/e2e/fixtures/formation/lib-*.json` | 6 files of real H4 candles |

The code reuses `impulseEnds`-style running extremes, `trendDirUpTo` (`f2618.ts`), `analyzeGar`, `analyzeBat`, `divergenceOf` and `zoneGeometry`. FRZ, TRD, FIB, SIG, ABCD, CDT, GAR, BAT and 2618 keep their behaviour.

## Why
- Everything is causal. P1, P2 and C are finished fractals. P3 is a running extreme since P2; the last one may be unfinished (LIB-04 unmet, verdict forming).
- Choice of the points: for each side, P2 is one of the last three swing highs (lows), P1 one of the two before it that lies less far out and has no point between it and P2 that reaches P2. The candidate with the fewest unmet form rules wins. On a tie the latest wins.
- Neighbouring fractals of one side (two candles apart or less) are one point. The rule needs this because candles are closed-based: a swing often makes two fractals in a row.
- The entry is the edge that price reaches first from P3: the near edge of the zone or level 0.786, whichever lies less far out. The touch needs a wick only.
- LIB-02 needs a close beyond C and a turned trend. The trend is measured with the candles up to the confirmation of P3 (two candles to the right), because the turn needs two closes (TRD-17).
- LIB-13 looks at every candle after P2 up to the last one. A close beyond the wick tip of P2 ends the Libra, also after the touch.
- Verdict: invalid when an exclusion is met, LIB-01 is unmet, or (P3 finished and LIB-02, LIB-03 or the needed LIB-07 is unmet). Forming when P3 is not finished or the touch is missing. Valid else.

## Choices without a rule source
- LIB-01 is unmeasurable while P2 has fewer than two candles to its right.
- LIB-03 counts every candle from P2 to P3.
- LIB-07 applies to M15 only (M30 is not in the context). In other timeframes it shows met with kind bonus.
- LIB-08 builds the inner AB=CD from swing points (fractals), not from the trend model. The rally from P3 is a correction of the turned trend and has no turning points there.
- LIB-09 is always unmeasurable until the Cypher detection exists.
- LIB-10 needs a valid harmonic of the opposite side with D on the candle of P3, both targets reached until the end of the measurement, and a strict divergence at P2 against P1. `checkLibCandidate` accepts harmonic results from outside for tests.
- LIB-11: stop is the wick tip of P2, target 1 is the near edge of the fractal zone of P3. The first reached edge is used when its reward-to-risk ratio is at least 1, else the other edge, else none.
- LIB-14 and LIB-15 count to the last candle while there is no touch.

## Open points
- The delimitation from the head-and-shoulders pattern is not tested: that formation does not exist yet. LIB-02 covers the turned-trend half.
- The real candles are scan results from the broker, not drawn examples. The mapping stays in the local test list.
- The candles hold no valid Libra with LIB-10 met in 12 symbols. LIB-10 met is tested with hand-built rows and an injected harmonic only.
- About 6 % of the scanned states are valid over 12 symbols: the library measures the rules, it does not judge the quality of a setup.
- LIB-03 counts a wide candle in either direction. The 2618 check looks at the direction; this one follows the rule text.

## Verification
- `scripts/features/run.sh FRM-09`: 48 tests passed.
- `scripts/features/run.sh FRM`: 509 tests passed.
- `npm run lint` and `npx tsc --noEmit`: no output.
