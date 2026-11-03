---
date: 2026-11-02
author: Claude
type: fix
status: done
pr: [306]
features: [FRM-18]
areas: [frontend, tests]
---

# Formation scan shares the environment

## Request
- Runtime findings 47 (`frz.ts`), 48 (`sig.ts`) and 49 (`scan.ts` does not share the environment) of the full check of the formations.
- The re-check of 2026-11-01 confirmed them, but without proof of an overload. Since trend continuation (#297) and 2618 (#301) the page scans eleven formations, so measure again.
- Rule of the coordinator: optimise only a part that costs more than 25 % of the scan time, and only if the result does not change. Otherwise close the finding with the measurement.

## Cause
- Measurement on `main` after #301: `scanFormations` with all eleven formations on the page size. Context: D1 400 days (286 candles), W1 from 1100 days of D1 (158), H4 120 days (516), H1 40 days (672), M15 10 days (720). Three price series, made from the real price steps of all 102 fixtures and re-timed (Monday to Friday). Median of 11 runs.
- Full scan: 645, 660 and 648 ms. With double the candles: 1806 to 2773 ms (factor 2.8 to 4.2, almost quadratic).
- CPU profile (24 scans): `buildEnv` with `envFor` costs 62.5 % of the scan. Each of the eleven analyzers built the same environment again (trends, Fibonacci, zones), and for M15 `envFor` built a second full environment. Cypher also runs Libra for `LIB-09`, which builds Gartley and Bat again.
- The machine had a high load during the measurement (load average 20 to 72, parallel sessions). The comparisons therefore run old and new code in turns in the same process.

## Solution
| File | Change |
|---|---|
| `lib/formation/reasons.ts` | New `shareEnv(ctx, fn)`. Inside the scope, `buildEnv` builds the environment once for each context, time and timeframe and gives the same object again. Only without `frzOptions`. A nested scope for the same context uses the outer one. |
| `lib/formation/scan.ts` | `scanFormations` runs its loop inside `shareEnv`. Outside the scan (one analyzer alone, chart) nothing changes. |
| `e2e/mocked/formation-scan-share-lib.spec.ts` | Identity test for `shareEnv`. Test that the scan itself shares: it asks the context for as few candle views as inside an outer scope. Equality test: the scan with the shared environment equals each formation alone on a fresh context (the old path), field by field, over all 102 fixtures and two re-timed series with four timeframes and W1. A second scan in the same scope gives the same result (no analyzer changes a shared environment). |

## Why
- A memo for each scan keeps the analyzers unchanged. The alternative, to give the environment to each analyzer as a parameter, changes eleven signatures.
- No analyzer writes to a finished environment (checked: no assignment, sort or `set` on its fields). The equality test proves it for all fixtures. With a deliberate defect (the shared environment loses its zones on reuse) 92 of the 105 new tests failed.
- No reference file with the old results (3.4 MB). It would become wrong with each rule change. The comparison with the unshared path stays valid.

## Measurement
- Equality before the change, old against new code: 108 of 108 scan results identical as JSON (102 fixtures and 3 series in two sizes, 1386 hits).
- Time, old and new code in turns in the same process, median of 11 scans (ms; load average 15 to 51, so compare the columns, not the rows):

| Size | Series | Old | New | Less |
|---|---|---|---|---|
| page | 1 | 1007 | 329 | 67 % |
| page | 2 | 986 | 335 | 66 % |
| page | 3 | 4529 | 2035 | 55 % (most noise) |
| double | 1 | 1983 | 689 | 65 % |
| double | 2 | 1765 | 572 | 68 % |
| double | 3 | 1884 | 606 | 68 % |

- With the quiet measurement of 645 to 660 ms before, this gives about 210 to 230 ms per scan on the page size. With double the candles the new scan grows by about 1.8 instead of about 3.
- Environments per scan: the four-timeframe series asks the context for 18 candle views with the shared environment and for 252 without it.
- Finding 47 (`frz.ts`) closed without code. Before the change `frz.ts` took 39 % of the scan, 37.5 % of it inside `buildEnv`. The hot spot was `countTests` with `counter.some(…)` for each candle (`frz.ts:163`), about 25 % own time. The pair comparison `mergeGroups` named in the finding took less than 0.5 %. After the change: `frz.ts` 17.3 %, `countTests` 6.7 %, `mergeGroups` 0.1 %.
- Finding 48 (`sig.ts`) closed without code: 1.3 % of the scan before, 2.6 % after. The `trd.ts` part of the finding belongs to the line package: 8.8 % before, 15.1 % after (most of it called from `trendDirUpTo`, see open points).

## Verification
- New spec: 105 of 105 red before the change (`shareEnv` missing), 105 of 105 green after it.
- The test for the scan itself (candle views without an outer scope equal those with one) was red with the scan wrapper removed: 252 instead of 18.
- After the merge of `main` (#302 to #304, new fixtures): 112 of 112 green.
- `features.yaml`: FRM-18 names the new spec. The FRM-20 coverage line has double quotes, as in the line package, because YAML read it as an object and `run.sh` stopped.

## Trend direction memo (second change)
- Open point of the first change: `trendDirUpTo` (`f2618.ts`) and `trendDirAt` (`cdt.ts`) build the formation trend again up to an earlier candle. Profile of the old code (24 scans, page and double size): 52.4 % + 12.9 % = 65.3 % of the scan.
- Cause: the trend up to candle `idx` depends only on the candle view and `idx`. The analyzers (TDF, 2618, OBO, Libra, CDT) ask for the same pair many times. One page scan calls `formationTrend` 291 times, but only 67 different (view, candle) pairs exist.
- Solution: `formationTrendDir(view, upTo)` in `trdFormation.ts` keeps the direction per view object and candle. `withTrendDirMemo` opens the scope; `shareEnv` calls it, so the memo lives exactly as long as the shared environment. Outside a scan nothing is kept. `trendDirUpTo` and `trendDirAt` call `formationTrendDir`. No analyzer signature changes. The memo keeps only a direction (a string or null), so no analyzer can change a shared object.
- Measurement: old and new code in turns in the same process, median of 11 scans (ms; load average 5 to 10). Results of old and new code are identical as JSON in all 6 cases.

| Size | Series | Old | New | Less |
|---|---|---|---|---|
| page | 1 | 162 | 84 | 48 % |
| page | 2 | 170 | 86 | 49 % |
| page | 3 | 153 | 80 | 48 % |
| double | 1 | 449 | 209 | 53 % |
| double | 2 | 488 | 233 | 52 % |
| double | 3 | 460 | 223 | 52 % |

- Profile after the change (same method): `trendDirUpTo` 23.0 % and `trendDirAt` 9.4 %, together 32.4 % (before: 65.3 %). What remains are the different (view, candle) pairs, each built once. A forward build with kept intermediate states would cut more, but it needs a change inside `trd.ts`; not done.
- Equality: `e2e/mocked/formation-trend-memo-lib.spec.ts` compares `formationTrendDir` in the scope with the old calculation `formationTrend(view, idx).dir` for every candle of every loaded timeframe of all fixtures, on the second call and in reverse order, and outside the scope (105 tests). The scan equality spec `formation-scan-share-lib.spec.ts` stays green (119 of 119 with the new spec).
- Deliberate defect (the memo key rounds `upTo` down to an even number): 105 of 105 tests of the new spec were red. The scan equality spec stayed green, because the verdicts do not change when only the direction of an odd candle is wrong in the fixtures. So the new spec is the one that guards the memo.
