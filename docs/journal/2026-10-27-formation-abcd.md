---
date: 2026-10-27
author: Claude
type: decision
status: open
pr: []
features: [FRM-05]
areas: [frontend]
---

# Formation detection: AB=CD (step E5)

## Request
Add AB=CD (ABCD) to the formation library: one check per measurable rule ID, the points A, B, C, D from candles, and the drawings Z-ABCD-01 to Z-ABCD-06.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/abcd.ts` | Building blocks: choice of A, B, C from the turning points, D as the outermost wick since C, correction depth, level 1, shortfall, inner AB=CD levels |
| `frontend_nextjs/src/lib/formation/abcdChecks.ts` | `analyzeAbcd` (each loaded timeframe), `checkAbcdCandidate` (own points), checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `ABCD_PARAMS`; minimum correction and minimum extension read `FIB_PARAMS` |
| `frontend_nextjs/e2e/mocked/formation-abcd-lib.spec.ts` | Hand-calculated cases, coverage test, mirror case, real candles, tag `@FRM-05` |
| `frontend_nextjs/e2e/fixtures/formation/abcd-*.json` | 2 files of real candles; four earlier SIG fixtures are reused |

FRZ, TRD, FIB and SIG keep their behaviour. ABCD calls their building blocks only.

## Why
- Everything is causal. A, B and C are turning points that are finished fractals at time t. D is the outermost wick since C and needs no fractal.
- Choice of the points: C is searched among the last six turning points. The latest C whose correction depth lies between 0.382 and 0.728 of AB wins. If none does, the last turning point is C. A later turning point beyond B is already D.
- Level 1 is C + (B − A). ABCD-10 to ABCD-16 measure at level 1, ABCD-17 to ABCD-20 and ABCD-23 at the D candle.
- ABCD-06 reads as geometry: level 1 reaches at least −0.272 of A to B when the correction depth is 0.728 or less. A price that has not yet run on does not change it.
- ABCD-07 is strict (wick reaches level 1). ABCD-08 allows a shortfall of 5 % of AB. The verdict "D reached" uses ABCD-08.
- The kind of ABCD-20 is required when ABCD-17 and ABCD-18 are both unmet. The kind of ABCD-19 is required when the trade is against the trend of the next higher timeframe.
- Verdict: invalid on an exclusion or an unmet form rule (01, 02, 04, 05, 06); forming while ABCD-03 or ABCD-08 is unmet; then invalid if another required rule is unmet (ABCD-07 and ABCD-11 excepted: the tolerance of ABCD-08 replaces the strict ABCD-07); else valid. Unmeasurable never blocks.
- A zone that price already closed through changes its role (FRZ-35). ABCD-22 therefore also looks at these turned zones near level 1.

## Choices without a rule source
- ABCD-09 and ABCD-15: inner movements are three turning points after C (A' on the side of C, B' on the side of B, C' on the side of C). Their level 1 must lie within the near distance of our level 1.
- ABCD-15 second levels: −0.272 of A to B, 0.618 of a larger counter move from the Fibonacci model of the timeframe or the next higher one, inner level 1.
- ABCD-12: without a loaded higher timeframe (and not D1) the state is `unmeasurable`.
- ABCD-13: "first test" means the near zones had no test before the D candle (FRZ-31 count up to the candle before D).
- A zone that only the D itself forms (finished fractal at D) does not count as the place of D. Without this rule ABCD-10 would be met by the D alone.
- ABCD-11 without an ATR is unmet and never blocks the verdict.
- ABCD-20 looks for an engulf whose last candle lies from the D candle on, in this timeframe or the next lower one.
- ABCD-25 is unmet for every loaded timeframe (the context holds D1, H4, H1, M15 only). The function `timeframeExcluded` covers M1 and M5 in the test.
- ABCD-16 (harmonic D) and ABCD-24 (double top) are always `unmeasurable` until the GAR/BAT and CDT steps.
- ABCD-08 does not cap an overshoot. A D far beyond level 1 counts as reached; ABCD-22 then usually excludes it because price closed through the zone.

## Open points
- Test list `abcd-neg-h4-03`: the small move A 0.81545, B 0.80115 reads C 0.80588 at the close of the 12:00 candle, depth 0.331 (ABCD-04 unmet). One candle later the high is 0.80682, depth 0.397 (met). The candles reproduce the numbers read from the picture, but the result depends on one candle and on the feed, so the case only shows the timing.
- `abcd-neg-h4-01` (USDJPY, May to July 2025) and `abcd-buy-h4-02` (NZDCAD, June 2025) fall away: the broker has H4 candles only from about the end of September 2025.
- The price entries of some test-list cases do not match the level 1 of the points found in the candles (XAGUSD entry 50.754, level 1 49.033). The real cases pin the measured states, not the trader's own drawing.
- Fixture-to-source mapping lives only in the local test list.

## Verification
- `scripts/features/run.sh FRM-05`: 55 tests passed.
- `npm run lint` and `npx tsc --noEmit`: no output.
