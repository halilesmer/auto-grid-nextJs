---
date: 2026-10-27
author: Claude
type: decision
status: open
pr: []
features: [FRM-06, FRM-05]
areas: [frontend]
---

# Formation detection: double top and double bottom (step E6)

## Request
Add the double top and double bottom (CDT) to the formation library: one check per rule ID, the points H1, N and H2 from candles, and the drawings Z-CDT-01 to Z-CDT-06. Make ABCD-24 measurable with the same measurement.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/cdt.ts` | Building blocks: pairs H1 and N from the turning points, H2 as the outermost wick since N, start of the impulse, correction depth, violation by a close (CDT-15 with the small-close exception), trend at H2, `cdtCore`, `abcdIsCdt` |
| `frontend_nextjs/src/lib/formation/cdtChecks.ts` | `analyzeCdt` (each loaded timeframe), `checkCdtCandidate` (own points), checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `CDT_PARAMS`; minimum correction and the extension for the exception read `FIB_PARAMS` |
| `frontend_nextjs/src/lib/formation/abcdChecks.ts` | ABCD-24 calls `abcdIsCdt`; `ABCD_UNMEASURABLE_IDS` keeps ABCD-16 only |
| `frontend_nextjs/e2e/mocked/formation-cdt-lib.spec.ts` | Hand-calculated cases, coverage test, mirror case, real candles, tag `@FRM-06` |
| `frontend_nextjs/e2e/mocked/formation-abcd-lib.spec.ts` | ABCD-24 met and unmet; one verdict changes (see below) |
| `frontend_nextjs/e2e/fixtures/formation/cdt-*.json` | 4 files of real H4 candles |

FRZ, TRD, FIB and SIG keep their behaviour. CDT calls their building blocks only.

## Why
- Everything is causal. H1 and N are turning points that are finished fractals at time t. H2 is the outermost wick since N and needs no fractal. The trend at H2 uses the candles up to H2 only.
- Choice of the points: N is one of the last six turning points and H1 the turning point before it. Each pair is checked, and the pair with the fewest unmet form rules (CDT-01 to CDT-06) or a met CDT-15 wins. On a tie the latest pair wins.
- CDT-05 has no tolerance: the wick of H2 reaches at least the near edge of the zone of H1. H2 may lie below the high of H1.
- CDT-15 is met when a candle closes beyond H1. A small close is no violation when the candle is not wide (SIG-34) and the price has not yet gone 0.272 of the impulse beyond H1. Without a start of the impulse there is no exception.
- The start of the impulse for CDT-04 and CDT-15 is the start of the Fibonacci measurement that ends at H1, else the turning point before H1.
- CDT-12 reads the RSI(7) of the H1 candle. CDT-13 is an engulf from the H2 candle on, in this timeframe or the next lower one. CDT-13 is required when CDT-12 is unmet, else a bonus.
- Verdict: invalid when CDT-15 is met or CDT-01, 02, 03, 04, 06 is unmet. Forming while CDT-05 is unmet, or when CDT-12 is unmet and CDT-13 is not met (the entry waits for the confirmation). Else valid. Unmeasurable never blocks.
- ABCD-24 is met when, with B as H1 and D as H2, CDT-05, CDT-06 and CDT-12 are met and CDT-15 is unmet. One unmet part gives unmet. Missing data gives unmeasurable.

## Choices without a rule source
- CDT-02 compares with the previous turning point on the same side, not with any fractal.
- CDT-08: the mean range of the last 5 candles before H2 is at most 0.8 of the mean before H1.
- CDT-09 reuses the Wave divergence. It needs H2 beyond H1, so a lower H2 is never a divergence.
- CDT-10: any retracement or extension level of the Fibonacci legs of this timeframe and the next higher one within 0.5 ATR(14) of the zone.
- CDT-16 (kind bonus, source secondary): H1 and H2 are finished fractals and N is a turning point of kind correction.
- CDT-15: a candle without a volume flag (not enough history) counts as not wide, so the exception can apply.
- CDT-06, CDT-07: the trend direction is the one of the trend model; without a direction the state is unmeasurable.

## Open points
- The turning-point list drops small corrections (TRD-07). A double top whose N is such a small correction is not found as a pair.
- CDT-04 depends on the start of the impulse, which can move when later candles arrive (real case `cdt-top-h4-01`: depth 0.299 one candle before, 0.535 after).
- ABCD-24 changes one ABCD verdict: the verdict of the ABCD case `DIV_BEAR` changes from forming to invalid, because its D is only 0.13 of AB beyond B at an RSI of 88.5 on B.
- The M30 cases of the test list fall away: the context loads D1, H4, H1 and M15.
- Fixture-to-source mapping lives only in the local test list.

## Verification
- `scripts/features/run.sh FRM-06`: 43 tests passed.
- `scripts/features/run.sh FRM`: 378 tests passed.
- `npm run lint` and `npx tsc --noEmit`: no output.
