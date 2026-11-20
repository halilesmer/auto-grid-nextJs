---
date: 2026-11-19
author: Claude
type: diagnosis
status: open
pr: []
features: [FRM-39, ANA-21]
areas: [frontend]
---

# Formation scan on live candles with new code, scan time, and the points that PR 622 changed

## Request
Plan 1114-A4. Three measurements, no code change:
- A: scan live candles with the new code (H4 for five products, H1 for EURUSD).
- B: find out why one scan takes 1 to 15 seconds.
- C: look at the points that PR 622 (EWO color window) changed in the `welle382` trend rule.

## Method
- Code: `main` at commit `4db837d5` (v0.7.666). It has PR 596, 600, 622 and 625. It does not have PR 628.
- A: spec `e2e/live/formation-history.spec.ts` (tag FRM-39), one run per product, full scan (all harmonics), one year, `scanFormations` per candle. The run reads only, on the DEMO account. H1 used `FORMATION_HISTORY_STEP_H1=4`: one scan for each four H1 candles (1560 scans over 6240 candles). H4 used step 1.
- B: local scripts, not committed. They call `scanFormations` and each analyzer in Node with the library as it is. CPU time comes from `process.cpuUsage`. The profile comes from `node --cpu-prof`. The real context is the same as in the spec (H4: D1, H4, H1 and W1 from D1; H1: H4, H1, M15), loaded with the same read-only rate requests.
- C: local scripts, not committed. Old code = `trdZug.ts` and the library at `2472d185^` (before PR 622). New code = this branch. Same fixtures `e2e/fixtures/formation/*.json` (100 H4, 1 H1), rule `welle382`, default trend settings.

## A: live scan, new code
| Product | TF | Scans | Candidates | Entered | Violations | Harmonic `stopChanged` | Result of entered AB=CD (last state) |
|---|---|---|---|---|---|---|---|
| XAUUSD | H4 | 1560 | 84 | 8 | 0 | 0 | stop 4, breakeven 1, TP1+TP2 2, open 1 |
| GBPUSD | H4 | 1560 | 83 | 6 | 0 | 0 | stop 2, breakeven 2, TP1 2 |
| USDJPY | H4 | 1560 | 71 | 4 | 0 | 0 | stop 1, TP1+TP2 2, open 1 |
| AUDUSD | H4 | 1560 | 62 | 9 | 0 | 0 | stop 3, breakeven 2, TP1 2, TP1+TP2 2 |
| NZDCAD | H4 | 1560 | 105 | 6 | 0 | 0 | stop 4, breakeven 2 |
| EURUSD | H1 | 1560 | 188 | 20 | 0 | 0 | stop 8, breakeven 5, TP1 2, TP1+TP2 5 |

- The counters of PR 596 and 600 are zero on all six runs: no `riskNotPositive` violation for Butterfly or Crab, no `abcdEntryStopChanged`. The spec prints a violation only when its count is above zero, and every run printed none.
- Harmonic candidates (GAR / BAT / BUT / CRB): XAUUSD 44 / 42 / 59 / 60, GBPUSD 65 / 63 / 80 / 62, USDJPY 72 / 66 / 118 / 109, AUDUSD 38 / 34 / 38 / 29, NZDCAD 64 / 68 / 73 / 51, EURUSD H1 128 / 139 / 247 / 147. The summary has no result distribution for harmonics, only the count of candidates that reached D (GAR / BAT / BUT / CRB: XAUUSD 7 / 5 / 3 / 3, GBPUSD 13 / 11 / 16 / 6, USDJPY 5 / 4 / 6 / 1, AUDUSD 7 / 7 / 8 / 7, NZDCAD 6 / 9 / 8 / 3, EURUSD H1 28 / 30 / 18 / 13).
- "Result" is the state of the entered AB=CD candidates at the end of the scan. "Open" means no stop and no TP1 yet at that moment.
- XAUUSD H1 was not finished. The coordinator stopped it after 1 hour 41 minutes because the run takes about 6 hours and held the machine lock. Its violation check is not done. The five H4 products and EURUSD H1 have no violation. EURUSD H4 was not run again here (it was clean on PR 596/600/601 code).
- Run time in the spec (wall clock): XAUUSD 1039, GBPUSD 1216, USDJPY 1275, AUDUSD 2292, NZDCAD 8647, EURUSD H1 14459 ms per scan. The NZDCAD value is not valid: the Mac went into sleep many times during the run, and the timer ran on. The Node process had 34 minutes of CPU time when last checked, that is about 1.3 s per scan or a little more. The worker answer and the account were not the cause. The other values may contain small sleep or load shares, because other sessions ran on the same machine.

## B: scan time
### Result in one sentence
One scan takes time that grows faster than the square of the history length, and the main cost is the trend line that every analyzer builds again from the first candle (`buildTrend`). The cost is not in one formation.

### Growth with history length (real candles, CPU time of one `scanFormations` call)
| Product, TF | Main candles visible | CPU per scan |
|---|---|---|
| GBPUSD H4 | 300 | 0.1 to 0.4 s (3 scans) |
| GBPUSD H4 | 800 | 0.5 s |
| GBPUSD H4 | 1200 | 1.0 s |
| GBPUSD H4 | 1560 | 1.8 s |
| GBPUSD H4 | 1900 | 3.4 s |
| EURUSD H1 | 1000 | 0.65 s |
| EURUSD H1 | 2000 | 2.9 s |
| EURUSD H1 | 3500 | 10.2 s |
| EURUSD H1 | 5000 | 40 s (wall 76 s: memory pressure) |
| EURUSD H1 | 6800 | 89 s (wall 208 s) |

- H4: 300 to 1900 candles (6.3 times) gives about 21 times the time: exponent about 1.7. H1: 1000 to 6800 candles (6.8 times) gives about 137 times: exponent about 2.6; between 3500 and 6800 it is above 3. This is more than quadratic. One scan per candle makes a year about cubic.
- The year averages in the spec are consistent: the H4 scans cover 510 to 2070 candles (about 1 to 2 s average). The H1 scans cover 650 to 6890 candles (14.5 s average).
- Fixtures are too short for the real cost. `trd-ref-h4-ger40` (780 H4 candles, only the H4 context) takes 55 ms per scan. The same candle count in the real context takes 0.5 s, because the context also holds 1040 D1 and 6895 H1 candles and the scan runs on three timeframes. Fixture scans from 150 to 780 candles: 5 to 55 ms, exponent about 1.5.

### Time per formation (CPU, own time, one scan; `GAR` and `BAT` first, so `CYP` and `LIB` do not count them again)
| Formation | GBPUSD H4, 800 | GBPUSD H4, 1900 | EURUSD H1, 3500 | EURUSD H1, 6800 |
|---|---|---|---|---|
| 2618 | 157 ms | 909 ms | 3328 ms | 33561 ms |
| ABCD | 154 ms | 1232 ms | 3028 ms | 30601 ms |
| TDF | 104 ms | 436 ms | 1942 ms | 10639 ms |
| OBO | 36 ms | 135 ms | 683 ms | 6281 ms |
| CYP | 47 ms | 108 ms | 442 ms | 3887 ms |
| CDT | 25 ms | 305 ms | 822 ms | 3562 ms |
| GAR, BAT, BUT, CRB, LIB | 6 to 10 ms each | 11 to 20 ms each | 21 to 30 ms each | 96 to 155 ms each |

Three formations (2618, ABCD, TDF) hold about 80 percent of the time. AB=CD alone is the most expensive formation at 1900 H4 candles and the second one at 3500 H1 candles.

### First three hot spots (CPU profile, self time; EURUSD H1 at 6800 candles, GBPUSD H4 at 1900 candles)
| # | Place | Share (H1 / H4) | What it does |
|---|---|---|---|
| 1 | `src/lib/formation/trd.ts:216` (arrow function in `buildTrend`, the `folded` filter and reduce over `m.cands`) | 46 % / 34 % | For every fractal it filters all earlier candidates again. The work per scan grows with candles times candidates. |
| 2 | `src/lib/formation/trd.ts:150` (`buildTrend`) | 20 % / 20 % | Builds the whole trend line from the first candle for every call. Callers: `trdFormation.ts:15` (`formationTrend`) and `trdChecks.ts:121` (`buildModels`), once for each timeframe and analyzer. |
| 3 | `src/lib/formation/frz.ts:163` (loop in `countTests`; with `frz.ts:149` and `frz.ts:128` `scanZone`) | 11 % / 15 % | Goes over all candles from the zone start to the scan time, and for each candle checks the opposite fractals again (`counter.some`). |

`trd.ts` in total is about 75 percent of the time. `frz.ts:41` (`probeFractal`) and `obo.ts:28` (`peaksOf`) are the next ones, 5 to 8 percent each at 780 fixture candles (fixture profile).

### Expected time on the chart page
Not measured in the browser. From the numbers above: the page loads `HISTORY_DAYS` (H4 120 days, H1 40 days, D1 view range), which is about 720 H4 or 960 H1 candles, and runs one scan. That is about 0.3 to 0.6 s of CPU on this Mac for H4 and about 0.5 to 1 s for H1. The history scan on the page (one scan per candle over a year) is the expensive path: 25 to 60 minutes of CPU for H4, hours for H1.

## C: points that PR 622 changed (`welle382`)
The numbers match the journal of PR 622: 755 points before, 806 after, 187 points that only one of the two rules has (119 only new, 68 only old), 41 of 101 fixtures without a change.

Classes (per point; a replaced point counts twice, once as the old one and once as the new one):
- (i) the new point is the more extreme wick (the old point on the same side within 30 candles is replaced by a more extreme one).
- (ii) a new extra correction point whose leg to the previous point is shorter than 2.5 × ATR.
- (iii) everything else.

| Set | (i) | (ii) | (iii) |
|---|---|---|---|
| All 187 changed points | 112 | 16 | 59 |
| Random sample of 12 (fixed seed 1119) | 10 | 0 | 2 |

The two points in class (iii) of the sample: `but-bad-h4-01` candle 34 (an old point with no counterpart that the new rule dropped) and `abcd-breakc-h4-01` candle 442 (an extra new point with a leg longer than 2.5 × ATR). The 16 points in class (ii) are the only ones that can be noise. The sample has none, so the class stays unchecked by eye.

Plots (local, not committed; blue dashed = old, orange = new, circle = the changed point; 60 candles):
`/private/tmp/claude-501/fh-out/u4/pivots/` with files `01-lib-buy-h4-01-33-new-i.png`, `02-obo-buy-h4-02-58-old-i.png`, `03-abcd-breakc-h4-01-442-new-iii.png`, `04-but-bad-h4-01-34-old-iii.png`, `05-but-form-h4-01-130-new-i.png`, `06-cyp-sell-h4-01-54-old-i.png`, `07-lib-buy-h4-01-36-old-i.png`, `08-obo-sell-h4-01-138-old-i.png`, `09-lib-zigzag-h4-01-184-new-i.png`, `10-t618-sell-h4-02-204-new-i.png`, `11-frz-resist-h4-02-165-old-i.png`, `12-abcd-neg-h4-01-74-new-i.png`.

## Open points
- XAUUSD H1 has no violation check (stopped at 1 hour 41 minutes).
- The measurement used code before PR 628. It was not run again after PR 628.
- Result distribution of harmonic trades is not in the spec summary. The AB=CD distribution is.
- Page time is an estimate, not a browser measurement.
- Speed: all three proposals are for a later PR and need a test that the results stay the same (compare hits on the fixtures and on one live year):
  1. Build the trend once per scan and timeframe and share it between analyzers, or build it step by step per new candle (`trd.ts:150`, `trdFormation.ts:15`, `trdChecks.ts:121`).
  2. Replace the `folded` filter and reduce (`trd.ts:216`) with a value that is updated when a candidate is added.
  3. In `countTests` (`frz.ts:149`), compute the "an opposite fractal finished after the last test" value once per interval, not per candle (`frz.ts:163`).
- The 16 class (ii) points are worth a look with a chart sample.

## Lessons
- A fixture with one timeframe and 780 candles shows 5 to 55 ms. The same scan in the real context takes 0.5 s and in the one-year H1 case 90 s. Measure speed on the real context.
- The wall-clock value of the spec includes sleep and load. Use CPU time for speed questions.
