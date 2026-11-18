---
date: 2026-11-18
author: Claude
type: diagnosis
status: done
pr: [617]
features: [FRM-39]
areas: [frontend]
---

# Probable C: false alarm rate and missed distance

## Request
Plan 1114-A4. The C leg section is born two bars after the C candle, because a C point is a fractal (2 + 2) and needs two closed bars on its right. Measure how many "probable C" candles become a real C leg two bars later, how many do not (false alarm), and how much price the two-bar delay costs. The scan only reads. It changes no library result and no UI. Follow-up request: measure three variants (V1, V2, V3) and explain why most real C are not in K2.

## Method
- Spec: `e2e/live/formation-history.spec.ts` (tag FRM-39, project `live-demo`, `E2E_LIVE=1`). New switches: `FORMATION_HISTORY_PROBABLE=1` (probable C measurement; implies AB=CD only; step 1 is required) and `FORMATION_HISTORY_ABCD_ONLY=1` (AB=CD branch of `scanFormations` alone, that is `analyzeAbcd`; same hits, no harmonics).
- Window: H4, 1560 bars (one year), step 1, six products. One run per product under the heavy lock (`scripts/features/heavy_lock.sh`), one after the other. No run was stopped and no run needed a retry. Output: `summary-<SYMBOL>.json` with the counters and one record per probable C.
- The measurement calls the library functions as they are (`probeFractal`, `shapeOf`, `cLegOf`, `lowerCandleAt`, `lowerAbcdAt`, `noPeakDivergence`, `reversalCandleAt`, `engulfZones`). No library file changed.
- No change of library results: XAUUSD, EURUSD and GBPUSD ran twice (spec with the old definition only, then the final spec) on the same bars (data end 2026-11-18 16:00). Candidates, entered and C leg counts and the K1/K2 counts are equal in both runs. A first check on 300 bars of one product gave the same candidates, entered and C legs for the old full scan, the AB=CD-only scan and the probable C scan.
- `violations` is empty for all six products.

Existing counters of the runs:

| Product | Candidates | Entered | C legs born (distinct C) | Scan ms/scan |
|---|---|---|---|---|
| XAUUSD | 83 | 6 | 82 (82) | 311 |
| EURUSD | 62 | 8 | 57 (57) | 325 |
| GBPUSD | 58 | 6 | 52 (52) | 349 |
| USDJPY | 65 | 5 | 60 (60) | 316 |
| AUDUSD | 42 | 6 | 41 (41) | 356 |
| NZDCAD | 95 | 7 | 92 (92) | 433 |

## Definitions
- **Real C (born):** the C point for which the library creates the C leg block (`trade.cLeg` is not null) for the first time. It is counted once per AB=CD direction and C time. In all runs it is born two bars after the C candle. The block can exist with unmet required rows (no entry value).
- **Probable C at t (K1):** the last closed candle t is a C point on its side. Rules: it is a left fractal by the library (`probeFractal`: two left neighbours, no right neighbour, no neighbour closes beyond the C extreme); the trend pivots give A and B; the correction depth is between `ABCD_PARAMS.minCorrection` and `maxCorrection` (0.382 to 0.728).
- **A and B, old definition:** B must be the last trend pivot and A the pivot before it.
- **A and B, fixed definition:** as the old definition; or the last pivot is a C on the same side and the new C candle is beyond it. Then the new C replaces that pivot, and B and A are one and two pivots earlier.
- **K2:** K1 and `cLegOf` (same function and arguments as the library, with C = candle t and no D) gives a block with values (entry and stop). That means all required rows are met.
- **V1:** announced after one closed bar on the right (t+1): the candle is a fractal with two left and one right neighbour. Fixed definition, K2 conditions. Delay one bar.
- **V2:** K2 and `reversalCandleAt` (same time frame, from the C candle) finds a reversal candle or Engulf in trade direction that ends at candle t.
- **V3:** K2 and the H1 candle that holds the C extreme is a completed 2 + 2 fractal. Announcement time = the later of the C candle close and the completion of that H1 fractal. The bars to the right of the H1 candle are read only up to the two bars that complete the fractal.
- **Outcome:** verified = the real C with the same A, B, C and direction exists at t+2 (two bars after the C candle). False alarm = it does not. Causes: `moreExtremeBar` (a bar after the C candle closes beyond the C extreme), `candidateGone` (A or B is no pivot any more), `pivotNotDrawn` (the candle is a fractal, but the trend model did not draw it as a pivot), `cLegNull` (candidate exists, `cLegOf` returns nothing), `otherPoints` (the library selects other A, B, C). `bornLater` = not verified at t+2, but born at t+3 to t+12.
- **Coverage:** real C of the year that the layer announced.
- **Missed distance:** (close of bar t+2 − entry at announcement) in C leg direction. Positive = price went past the entry in profit direction. R = entry to stop distance. Only for announcements where the entry has a value. A negative value means price is on the buyable side. "Still buyable at verification" counts values ≤ 0. "Entry still buyable at announcement" uses the close at announcement time (candle t; V1: t+1; V3: the last H1 close at announcement time) in the same way.
- Pip size: gold 0.1, JPY pairs 0.01, other pairs 0.0001. Pip values of different products are not pooled; R values are pooled.

## Why most real C were not in the first K1 and K2
| Product | Real C | not in K1 (old) | not in K2 (old) | not in K1 (fixed) | not in K2 (fixed) | Probable C that replace an earlier same-side pivot (K1 / K2) |
|---|---|---|---|---|---|---|
| XAUUSD | 82 | 47 | 73 | 1 | 60 | 81 / 24 |
| EURUSD | 57 | 26 | 47 | 4 | 33 | 52 / 32 |
| GBPUSD | 52 | 19 | 48 | 1 | 41 | 50 / 19 |
| USDJPY | 60 | 31 | 53 | 1 | 49 | 75 / 11 |
| AUDUSD | 41 | 20 | 33 | 0 | 30 | 35 / 4 |
| NZDCAD | 92 | 49 | 81 | 11 | 68 | 66 / 18 |

Reason code of a real C that is not in K1 (old definition): `noProbe` 178, `replace:depthAboveMax>1` 6, `replace:depthAboveMax<=1` 4, `depthAboveMax<=1` 3, `depthAboveMax>1` 1 (`noProbe` = the old definition did not test this candle at all). In the first XAUUSD run the same rows were split by reason: 46 of the 47 were `lastPivotOnCSide` (the last pivot at candle t was a C on the same side, not B), 1 was `noProbe`.
Reason code of a real C that is not in K1 (fixed definition): `replace:depthAboveMax>1` 6, `noProbe` 4, `replace:depthAboveMax<=1` 4, `depthAboveMax<=1` 3, `depthAboveMax>1` 1 (`replace:` = tested as a replacement of the last same-side pivot).

The old definition asked for B as the last pivot. In the trend model a new C on the same side as an earlier C replaces that earlier pivot. In those cases the last pivot at candle t is the old C, not B, so the old definition did not test the candle. The fixed definition covers this case: real C outside K1 fall from 192 to 18 of 384. K2 is smaller than K1 because K2 needs a block with values; the verification target (a real C) also counts blocks without values.

## Results (one year of H4, six products)
Layers K1 and K2 with the old definition are kept unchanged. The other layers use the fixed definition.

### K1 (old def.)

False alarm causes (total): pivotNotDrawn 740, moreExtremeBar 516, candidateGone 38, cLegNull 15. Delay from the close of the C candle to the announcement: median 0 h, largest 0 h.

| Product | Announced | Verified | False alarm | Verified % | Real C caught | Entry still buyable at announcement | Verified with entry | Missed pip (p25 / median / p75 / max) | Missed R (p25 / median / p75 / max) | Still buyable at verification |
|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | 281 | 34 | 247 | 12.1 | 35/82 | 57/74 | 9 | -263.0 / -9.50 / 35.5 / 150.4 | -0.16 / -0.03 / 0.02 / 0.97 | 5/9 |
| EURUSD | 240 | 30 | 210 | 12.5 | 31/57 | 39/68 | 10 | -13.0 / -7.20 / 1.25 / 15.0 | -0.28 / -0.04 / 0.01 / 0.69 | 6/10 |
| GBPUSD | 319 | 29 | 290 | 9.10 | 33/52 | 47/57 | 4 | -22.9 / -2.10 / 8.10 / 16.7 | -0.33 / -0.04 / 0.05 / 0.31 | 2/4 |
| USDJPY | 233 | 29 | 204 | 12.4 | 29/60 | 46/65 | 7 | -47.1 / 6.20 / 8.50 / 42.1 | -0.57 / 0.01 / 0.06 / 1.65 | 3/7 |
| AUDUSD | 114 | 21 | 93 | 18.4 | 21/41 | 21/28 | 8 | -22.8 / -8.30 / 3.40 / 6.70 | -0.65 / -0.36 / 0.22 / 0.44 | 5/8 |
| NZDCAD | 308 | 43 | 265 | 14.0 | 43/92 | 59/89 | 11 | -8.40 / -5.20 / 7.70 / 71.0 | -0.48 / -0.30 / 0.06 / 1.52 | 7/11 |
| **Total** | 1495 | 186 | 1309 | 12.4 | 192/384 | 269/381 | 49 | not pooled (pip size differs) | -0.33 / -0.03 / 0.09 / 1.65 | 28/49 |

### K2 (old def.)

False alarm causes (total): pivotNotDrawn 183, moreExtremeBar 136, candidateGone 12, cLegNull 1. Delay from the close of the C candle to the announcement: median 0 h, largest 0 h.

| Product | Announced | Verified | False alarm | Verified % | Real C caught | Entry still buyable at announcement | Verified with entry | Missed pip (p25 / median / p75 / max) | Missed R (p25 / median / p75 / max) | Still buyable at verification |
|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | 74 | 9 | 65 | 12.2 | 9/82 | 57/74 | 9 | -263.0 / -9.50 / 35.5 / 150.4 | -0.16 / -0.03 / 0.02 / 0.97 | 5/9 |
| EURUSD | 68 | 10 | 58 | 14.7 | 10/57 | 39/68 | 10 | -13.0 / -7.20 / 1.25 / 15.0 | -0.28 / -0.04 / 0.01 / 0.69 | 6/10 |
| GBPUSD | 57 | 4 | 53 | 7.00 | 4/52 | 47/57 | 4 | -22.9 / -2.10 / 8.10 / 16.7 | -0.33 / -0.04 / 0.05 / 0.31 | 2/4 |
| USDJPY | 65 | 7 | 58 | 10.8 | 7/60 | 46/65 | 7 | -47.1 / 6.20 / 8.50 / 42.1 | -0.57 / 0.01 / 0.06 / 1.65 | 3/7 |
| AUDUSD | 28 | 8 | 20 | 28.6 | 8/41 | 21/28 | 8 | -22.8 / -8.30 / 3.40 / 6.70 | -0.65 / -0.36 / 0.22 / 0.44 | 5/8 |
| NZDCAD | 89 | 11 | 78 | 12.4 | 11/92 | 59/89 | 11 | -8.40 / -5.20 / 7.70 / 71.0 | -0.48 / -0.30 / 0.06 / 1.52 | 7/11 |
| **Total** | 381 | 49 | 332 | 12.9 | 49/384 | 269/381 | 49 | not pooled (pip size differs) | -0.33 / -0.03 / 0.09 / 1.65 | 28/49 |

### K1 (fixed def.)

False alarm causes (total): pivotNotDrawn 797, moreExtremeBar 638, candidateGone 38, cLegNull 23. Delay from the close of the C candle to the announcement: median 0 h, largest 0 h.

| Product | Announced | Verified | False alarm | Verified % | Real C caught | Entry still buyable at announcement | Verified with entry | Missed pip (p25 / median / p75 / max) | Missed R (p25 / median / p75 / max) | Still buyable at verification |
|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | 362 | 79 | 283 | 21.8 | 81/82 | 77/98 | 22 | -263.0 / -9.50 / 108.1 / 374.9 | -0.26 / -0.03 / 0.17 / 0.97 | 11/22 |
| EURUSD | 292 | 52 | 240 | 17.8 | 53/57 | 64/100 | 24 | -14.4 / -7.20 / 14.1 / 25.8 | -0.28 / -0.04 / 0.22 / 2.22 | 13/24 |
| GBPUSD | 369 | 47 | 322 | 12.7 | 51/52 | 62/76 | 11 | -25.8 / -2.10 / 8.10 / 25.6 | -0.62 / -0.04 / 0.18 / 1.08 | 6/11 |
| USDJPY | 308 | 59 | 249 | 19.2 | 59/60 | 56/76 | 11 | -59.6 / -5.10 / 8.50 / 78.1 | -0.57 / -0.01 / 0.06 / 1.65 | 6/11 |
| AUDUSD | 149 | 41 | 108 | 27.5 | 41/41 | 23/32 | 11 | -22.8 / -4.30 / 5.00 / 27.4 | -0.65 / -0.15 / 0.28 / 1.17 | 6/11 |
| NZDCAD | 374 | 80 | 294 | 21.4 | 81/92 | 71/107 | 24 | -11.0 / -5.20 / 7.70 / 71.0 | -0.80 / -0.30 / 0.12 / 6.22 | 14/24 |
| **Total** | 1854 | 358 | 1496 | 19.3 | 366/384 | 353/489 | 103 | not pooled (pip size differs) | -0.39 / -0.03 / 0.25 / 6.22 | 56/103 |

### K2 (fixed def.)

False alarm causes (total): pivotNotDrawn 197, moreExtremeBar 175, candidateGone 12, cLegNull 2. Delay from the close of the C candle to the announcement: median 0 h, largest 0 h.

| Product | Announced | Verified | False alarm | Verified % | Real C caught | Entry still buyable at announcement | Verified with entry | Missed pip (p25 / median / p75 / max) | Missed R (p25 / median / p75 / max) | Still buyable at verification |
|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | 98 | 22 | 76 | 22.4 | 22/82 | 77/98 | 22 | -263.0 / -9.50 / 108.1 / 374.9 | -0.26 / -0.03 / 0.17 / 0.97 | 11/22 |
| EURUSD | 100 | 24 | 76 | 24.0 | 24/57 | 64/100 | 24 | -14.4 / -7.20 / 14.1 / 25.8 | -0.28 / -0.04 / 0.22 / 2.22 | 13/24 |
| GBPUSD | 76 | 11 | 65 | 14.5 | 11/52 | 62/76 | 11 | -25.8 / -2.10 / 8.10 / 25.6 | -0.62 / -0.04 / 0.18 / 1.08 | 6/11 |
| USDJPY | 76 | 11 | 65 | 14.5 | 11/60 | 56/76 | 11 | -59.6 / -5.10 / 8.50 / 78.1 | -0.57 / -0.01 / 0.06 / 1.65 | 6/11 |
| AUDUSD | 32 | 11 | 21 | 34.4 | 11/41 | 23/32 | 11 | -22.8 / -4.30 / 5.00 / 27.4 | -0.65 / -0.15 / 0.28 / 1.17 | 6/11 |
| NZDCAD | 107 | 24 | 83 | 22.4 | 24/92 | 71/107 | 24 | -11.0 / -5.20 / 7.70 / 71.0 | -0.80 / -0.30 / 0.12 / 6.22 | 14/24 |
| **Total** | 489 | 103 | 386 | 21.1 | 103/384 | 353/489 | 103 | not pooled (pip size differs) | -0.39 / -0.03 / 0.25 / 6.22 | 56/103 |

### V1 one right bar

False alarm causes (total): pivotNotDrawn 171, moreExtremeBar 55, candidateGone 6, cLegNull 1. Delay from the close of the C candle to the announcement: median 4 h, largest 4 h.

| Product | Announced | Verified | False alarm | Verified % | Real C caught | Entry still buyable at announcement | Verified with entry | Missed pip (p25 / median / p75 / max) | Missed R (p25 / median / p75 / max) | Still buyable at verification |
|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | 72 | 22 | 50 | 30.6 | 22/82 | 43/72 | 22 | -150.7 / -9.50 / 108.1 / 374.9 | -0.16 / -0.03 / 0.17 / 0.97 | 11/22 |
| EURUSD | 69 | 24 | 45 | 34.8 | 24/57 | 31/69 | 24 | -13.0 / -5.10 / 6.40 / 26.1 | -0.12 / -0.01 / 0.08 / 1.79 | 13/24 |
| GBPUSD | 40 | 14 | 26 | 35.0 | 14/52 | 27/40 | 14 | -25.8 / -7.70 / 8.10 / 25.6 | -0.62 / -0.25 / 0.18 / 1.08 | 8/14 |
| USDJPY | 53 | 10 | 43 | 18.9 | 10/60 | 32/53 | 10 | -59.6 / -42.3 / 6.20 / 78.1 | -0.57 / -0.39 / 0.01 / 1.65 | 6/10 |
| AUDUSD | 24 | 10 | 14 | 41.7 | 10/41 | 15/24 | 10 | -10.5 / 3.40 / 6.70 / 27.4 | -0.36 / 0.22 / 0.44 / 1.17 | 4/10 |
| NZDCAD | 78 | 23 | 55 | 29.5 | 23/92 | 41/78 | 23 | -11.0 / -5.20 / 4.10 / 71.0 | -0.80 / -0.03 / 0.09 / 6.22 | 14/23 |
| **Total** | 336 | 103 | 233 | 30.7 | 103/384 | 189/336 | 103 | not pooled (pip size differs) | -0.35 / -0.01 / 0.27 / 6.22 | 56/103 |

### V2 reversal candle

False alarm causes (total): pivotNotDrawn 2. Delay from the close of the C candle to the announcement: median 0 h, largest 0 h.

| Product | Announced | Verified | False alarm | Verified % | Real C caught | Entry still buyable at announcement | Verified with entry | Missed pip (p25 / median / p75 / max) | Missed R (p25 / median / p75 / max) | Still buyable at verification |
|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | 1 | 0 | 1 | 0.00 | 0/82 | 0/1 | 0 | – | – | 0/0 |
| EURUSD | 0 | 0 | 0 | – | 0/57 | 0/0 | 0 | – | – | 0/0 |
| GBPUSD | 0 | 0 | 0 | – | 0/52 | 0/0 | 0 | – | – | 0/0 |
| USDJPY | 1 | 0 | 1 | 0.00 | 0/60 | 1/1 | 0 | – | – | 0/0 |
| AUDUSD | 0 | 0 | 0 | – | 0/41 | 0/0 | 0 | – | – | 0/0 |
| NZDCAD | 0 | 0 | 0 | – | 0/92 | 0/0 | 0 | – | – | 0/0 |
| **Total** | 2 | 0 | 2 | 0.0 | 0/384 | 1/2 | 0 | not pooled (pip size differs) | – | 0/0 |

### V3 H1 fractal

False alarm causes (total): pivotNotDrawn 174, moreExtremeBar 109, candidateGone 10, cLegNull 1. Delay from the close of the C candle to the announcement: median 0 h, largest 3 h.

| Product | Announced | Verified | False alarm | Verified % | Real C caught | Entry still buyable at announcement | Verified with entry | Missed pip (p25 / median / p75 / max) | Missed R (p25 / median / p75 / max) | Still buyable at verification |
|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | 81 | 19 | 62 | 23.5 | 19/82 | 60/81 | 19 | -263.0 / -9.50 / 150.4 / 374.9 | -0.26 / -0.03 / 0.15 / 0.97 | 10/19 |
| EURUSD | 81 | 22 | 59 | 27.2 | 22/57 | 41/81 | 22 | -14.4 / -7.20 / 6.40 / 25.3 | -0.17 / -0.04 / 0.08 / 1.79 | 12/22 |
| GBPUSD | 50 | 10 | 40 | 20.0 | 10/52 | 33/50 | 10 | -25.8 / -7.70 / 8.10 / 25.6 | -0.62 / -0.25 / 0.18 / 1.08 | 5/10 |
| USDJPY | 59 | 11 | 48 | 18.6 | 11/60 | 34/59 | 11 | -59.6 / -5.10 / 8.50 / 78.1 | -0.57 / -0.01 / 0.06 / 1.65 | 6/11 |
| AUDUSD | 28 | 10 | 18 | 35.7 | 10/41 | 19/28 | 10 | -22.8 / -8.30 / 5.00 / 27.4 | -0.65 / -0.36 / 0.28 / 1.17 | 5/10 |
| NZDCAD | 90 | 23 | 67 | 25.6 | 23/92 | 42/90 | 23 | -11.0 / -5.20 / 6.55 / 71.0 | -0.80 / -0.30 / 0.09 / 6.22 | 14/23 |
| **Total** | 389 | 95 | 294 | 24.4 | 95/384 | 229/389 | 95 | not pooled (pip size differs) | -0.44 / -0.03 / 0.22 / 6.22 | 52/95 |


## Weak points of the definitions
- The fractal rule is the library rule (no neighbour closes beyond the extreme). A wick beyond the extreme does not break it. The request text said "lower than the two left neighbours"; the library rule was used.
- A probable C is only tested when the last pivot is B, or a same-side C that the candle replaces. A real C that the library selects from the last six pivots (`selectPoints`) in another way is not covered. 18 of 384 real C are outside K1 (fixed); the reason codes are listed above (depth above the upper limit 0.728 is the main one: the library still creates the block for it, because `cLegOf` tests only the lower depth limit).
- `pivotNotDrawn` is the largest false alarm cause: the candle is a valid fractal, but the trend model does not draw it as a pivot. The measurement does not look inside the trend rules for the reason.
- K2 needs values; real C blocks often have unmet required rows (the higher time frame trend row is unmet in most states), so K2 covers fewer real C than K1.
- Missed distance exists only for announcements with an entry value (K2 and its variants). The entry of a zone block is the near edge of the zone, a limit price; "buyable" compares the close to this price and does not test a fill between announcement and verification.
- The entry and stop of the announcement come from the data known at candle t. The real block at t+2 can have other values; the difference is not measured.
- V3 uses the extreme H1 candle inside the C candle by exact price. The price between the H4 close and the announcement time (up to two H1 bars) is used only for the "still buyable at announcement" count, not for the missed distance.
- V2 uses the same time frame only (H4). The C leg block itself also accepts a reversal candle in the lower time frame.
- The year has about 380 real C in total. Counts per layer are small for V2 and per product.
- Live feed: the bars at the end of the window change between runs; runs on the same bars gave the same counts.

## Open points
- The scan runs 310 to 430 ms per scan (AB=CD only).
- The zero-count result of V2 is a count, not a test of the rule: the Engulf rule needs a wide candle pair at the C point.
