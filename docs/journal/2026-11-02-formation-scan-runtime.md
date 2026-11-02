---
date: 2026-11-02
author: Claude
type: fix
status: open
pr: []
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
| `e2e/mocked/formation-scan-share-lib.spec.ts` | Identity test for `shareEnv`. Equality test: the scan with the shared environment equals each formation alone on a fresh context (the old path), field by field, over all 102 fixtures and two re-timed series with four timeframes and W1. A second scan in the same scope gives the same result (no analyzer changes a shared environment). |

## Why
- A memo for each scan keeps the analyzers unchanged. The alternative, to give the environment to each analyzer as a parameter, changes eleven signatures.
- No analyzer writes to a finished environment (checked: no assignment, sort or `set` on its fields). The equality test proves it for all fixtures. With a deliberate defect (the shared environment loses its zones on reuse) 92 of the 105 new tests failed.
- No reference file with the old results (3.4 MB). It would become wrong with each rule change. The comparison with the unshared path stays valid.

## Measurement
- Equality before the change, old against new code: 108 of 108 scan results identical as JSON (102 fixtures and 3 series in two sizes, 1386 hits).
- Time, old and new code in turns, median of 11: see the table below.
- Finding 47 (`frz.ts`) closed without code. Before the change `frz.ts` took 39 % of the scan, 37.5 % of it inside `buildEnv`. The hot spot was `countTests` with `counter.some(…)` for each candle (`frz.ts:163`), about 25 % own time. The pair comparison `mergeGroups` named in the finding took less than 0.5 %. After the change: `frz.ts` 17.3 %, `countTests` 6.7 %, `mergeGroups` 0.1 %.
- Finding 48 (`sig.ts`) closed without code: 1.3 % of the scan before, 2.6 % after. The `trd.ts` part of the finding belongs to the line package: 8.8 % before, 15.1 % after (most of it called from `trendDirUpTo`, see open points).

## Verification
- New spec: 105 of 105 red before the change (`shareEnv` missing), 105 of 105 green after it.

## Open points
- `trendDirUpTo` (`f2618.ts:131`, called from TDF, 2618, OBO and Libra) and `trendDirAt` (`cdt.ts:120`) build the formation trend again up to an earlier candle. Before the change about 26 % of the scan, after it 63.8 %. This is the largest remaining part. Not in this change.
