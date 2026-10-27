---
date: 2026-10-27
author: Claude
type: decision
status: open
pr: []
features: [FRM-04]
areas: [frontend]
---

# Formation detection: Fibonacci and signals (step E4)

## Request
Add Fibonacci (FIB) and signals (SIG) to the formation library: one check per measurable rule ID, the Fibonacci measurement over the last impulse, the extension, RSI extreme, divergence in the Wave, engulf, reversal candle, the reasons G1 to G11, and the drawings Z-FIB-01 to Z-FIB-08 and Z-SIG-01 to Z-SIG-05.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/fib.ts` | Building blocks: impulses of the trend, end of a measurement, running measurement, correction depth, level price, extension |
| `frontend_nextjs/src/lib/formation/fibChecks.ts` | `analyzeFib` (each loaded timeframe), `checkFibCandidate` (a measurement with own anchors), checks per ID, drawings |
| `frontend_nextjs/src/lib/formation/sig.ts` | Building blocks: RSI extreme, divergence, engulf and engulf zone, saw candle, merge of candles |
| `frontend_nextjs/src/lib/formation/reasons.ts` | Environment per timeframe and the reasons G1 to G11 (shared by FIB-23 and SIG-40, SIG-41) |
| `frontend_nextjs/src/lib/formation/sigChecks.ts` | `analyzeSig` (last closed candle of each timeframe), `checkSigDivergence` (two chosen points), checks per ID, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `FIB_PARAMS`, `SIG_PARAMS`; `TRD_PARAMS.healthy` now reads `FIB_PARAMS` (same numbers, TRD unchanged) |
| `frontend_nextjs/src/lib/formation/indicators.ts`, `context.ts` | `narrowRange` (SIG-35) and its series in each timeframe view |
| `frontend_nextjs/e2e/mocked/formation-fib-lib.spec.ts`, `formation-sig-lib.spec.ts` | Hand-calculated cases, coverage test, real candles, tag `@FRM-04` |
| `frontend_nextjs/e2e/fixtures/formation-rows.ts` | Helpers that build candle rows by hand |
| `frontend_nextjs/e2e/fixtures/formation/fib-*.json`, `sig-*.json` | 8 files of real candles |

## Why
- Everything is causal. At time t only closed candles up to t flow in.
- An impulse runs from a low (start, level 1) to a high (end, level 0). If a further high follows, the move back between them counts as a correction only at depth 0.382 or more. Below that, the end moves on to the new high (FIB-07). Above it, the new impulse starts at the deepest wick of the correction.
- A measurement is running while a wick lies beyond the end and no fractal is finished there (FIB-05, FIB-06). The correction rules (FIB-07, FIB-09 to FIB-17) then are `unmeasurable`. The extension (FIB-19 to FIB-21) is measured against the finished impulse (the finished one, not the running one).
- The impulse that caused a trend change starts at the turning point before the trend origin.
- States read as in TRD: for event rules (FIB-06, FIB-21, FIB-22, FIB-28, SIG-07, SIG-15, SIG-16, SIG-30, SIG-31, SIG-38) `met` means "the event is there". For exclusions this means "excluded".
- Divergence uses the record extreme points of a side over the loaded candles: each is further out than all earlier turning points of that side. Limiting it to the current trend broke the real GBPJPY case, because a trend change lies between the two records. This follows SIG-12 (ends of the trend moves, not inner highs). With the plain "last two turning points", the real GBPJPY case showed no divergence, because lower highs sit between the records.
- Tie rule: the divergence used everywhere (SIG-15 to SIG-17, SIG-20, G7) counts equal Wave peaks (SIG-14). SIG-13 is strict.

## Choices without a rule source
- FIB-14 and FIB-15 are both "the measurement did not end" (two closes beyond the start). The rule text names no other difference.
- FIB-09 uses the full level set (0.236 to 0.886), FIB-10 only 0.382, 0.5 and 0.618. FIB-07 and FIB-12 give the same depth, FIB-12 also holds while a breakout runs.
- FIB-13 (bowl): depth between 0.236 and 0.382 and at least 3 low-range candles in a row after the end.
- FIB-16: depth from 0.382 up to 0.5. FIB-17: depth below 0.786. FIB-28: the higher timeframe is against the trade side and the depth is over 0.886.
- FIB-22: a high-range candle against the impulse closes beyond the zone of the end, and the extension stays below 0.272.
- FIB-24 and FIB-25 use valid fractal zones of the timeframe on the side of the correction and holding engulf zones. FIB-26 uses zones that changed their role and have no test.
- FIB-30: a finished fractal of the lower timeframe, after the end, inside the zone of the end of the higher timeframe.
- G4 (FIB-11, FIB-12) stays true after the correction ended while the impulse is the last one; it does not require the price to be in the band now.
- G4 counts for a trade in the direction of the last impulse, G5 for a trade against it. G9 (formation point) only comes as input (`formationPoint`). The order block is not measurable.
- SIG-32 (double engulf): two engulfs on the same side with one candle between (positions k and k−2 or k−3). The rule names no exact shape.
- SIG-31: "large" means the engulf candle is high-range.
- SIG-02 without a trade side: either extreme. SIG-03 is `unmeasurable` without an RSI extreme, because there is nothing to filter.
- SIG-05: direct entry with an RSI extreme, or a reversal candle in the lower timeframe, or enough reasons.
- SIG-29 (stop and target from the trade) and SIG-08, SIG-39 (no data) are always `unmeasurable`.

## Open points
- The expected values of the test list for the AUDCAD case say that the minimum extension is reached. In the candles, the daily impulse 0.89027 to 0.92262 has depth 0.479 and the high of 6 October exceeds the end by 0.047 only. The minimum extension is reached for the earlier impulse (July to 13 August). The test pins the values of the candles (FIB-12 met, FIB-20 not met).
- The broker has H4 candles only from about the end of September 2025. The AUDCAD H4 fixture has 66 candles, the EURUSD one 78.
- Fixture-to-source mapping lives only in the local test list.

## Verification
- `scripts/features/run.sh FRM-04`: 110 tests passed.
- Wave peaks of the divergence cases and the RSI values of the stairs cases were recomputed with an independent script (SMA 5 − SMA 35 of the median price, Wilder RSI with period 7): 9.835 and 7.183 for the divergence, 14.626 for the case without, 95 / 69.9 / 88.5 / 75.3 for the RSI cases.
- `npm run lint` and `npx tsc --noEmit`: no output.
