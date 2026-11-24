---
date: 2026-11-24
author: Claude
type: fix
status: closed
pr: []
features: [FRM-08, FRM-18]
areas: [frontend, tests]
---

# AB=CD part of the formation search is 3 times faster, results unchanged (1124-C1)

## Request
After 2026-11-24-formation-scan-speed-harmonics the AB=CD part was the largest remaining part of the page search (Rule B of PR 650). Task: the same results, less work. Halil approved the plan on 2026-11-24 ("A+B+C onay"). Scope: `abcdChecks.ts`, `trd.ts`, `reasons.ts`, `context.ts`.

## Cause (Node CPU profile and work counters, USOUSD page run)
- Rule B looks at about 630 triples per page run. Each triple is measured once, so a cache does not help. The cost is in each measurement.
- The choice reads only the trade of a triple (entered, entry candle, entry, stop, status). Every triple was measured in full: zones, signals, reversal candle, CDT, drawings, harmonic D.
- For each entered trade, the environment at the entry candle was built again (the frozen big target and stop anchor, 2026-11-16). That built 774 trends from the first candle, about 336 000 trend candles with the old test input (`HISTORY_DAYS`).
- The Gartley/Bat verdict of the same shape was asked twice (346 calls, 183 different).
- A decision at the entry candle cannot be taken without the entry environment: only 13 % of the trades end the same way with the stop anchor A or C.

## Change (behaviour unchanged)
- `abcdChecks.ts`: `tradeOnlyOf` measures only the trade for the choice. `frozenFactsOf` is the one function that gives the entry candle, the stop anchor and the big target, for `evaluateFull` and for `tradeOnlyOf`. Only the shown candidate and the displaced one are measured in full. The searches of earlier closes record only the trade (as before).
- `abcdChecks.ts`: the second levels and the zone of `levelContextOf` are lazy; the Gartley/Bat verdict is stored per environment and shape (`harmonicHolds`).
- `trd.ts`: `TrendRun` is the loop of `buildTrend`, stoppable after each candle. `buildTrend` calls it. A step never changes a candidate, pivot or span of an earlier candle in place; it replaces it with a copy, so `snapshot()` shares the entries.
- `reasons.ts` / `context.ts`: `trendOf` takes the trend of a view that is the front part of the whole series from a stopped run (`prefixTrend`, at most 4 runs per context and time frame) and continues it. A run that already passed the view is not used. The cache stays per context (never global, see 2026-11-24-formation-scan-speed-harmonics).

## Evidence
- Golden record: 414 of 414 hashes equal, the three page hashes equal (Node). `formation-scan-golden-lib.spec.ts` and `formation-bases-sweep-lib.spec.ts`: 228 passed.
- New `formation-trend-run-lib.spec.ts` (@FRM-18): the state of `TrendRun` after n candles equals `buildTrend` of the first n candles, for 110 fixtures, 5 rules and every n (125 850 comparisons), compared after the whole run. Also the new `buildTrend` equals the old one of main in 42 105 comparisons (checked once, not a test).
- New `formation-abcd-trade-only-lib.spec.ts` (@FRM-18): `tradeOnlyOf` equals the full measurement in side, points, entered, entry, stop, status and entry candle for every triple of the choice. A one-off check on all 59 625 triples of the golden fixtures and the page runs: equal in these fields (the one difference found was the entry price of a trade that is not entered; the full measurement shows it, the choice does not read it, so the test compares entry, stop and status only for an entered trade).
- Work guard (work, not time): page run, at most 20 full AB=CD measurements and 200 000 trend candles. Old code (21210c5b): 655 to 669 and 874 000 to 916 000, so red. New code: at most 5 and 106 000 to 113 000, so green. The limit is 4 times under the old minimum and 1.8 times over the new maximum. (With `HISTORY_DAYS` as input of the first plan the numbers were 332 000 and 54 000; the page loads more candles since PR 670.)
- Trend specs: all `formation-*`, `analysis-trend*`, `chart-trend*` and `chart-tool-over-formation-line` specs: 3070 passed. The backtest code does not use `buildTrend`.
- Node CPU profile, same page run (`LOAD_DAYS`, 3 turns each, load about 5): AB=CD 481 to 489 ms before, 161 to 164 ms after (3.0 times).
- Browser, UI-17 set-up (1440 px, `fakeNow` 2026-11-12T16:21Z, USOUSD, one worker), `data-scan-ms`, old and new build in turns, 8 runs each, load 8 falling to 6:

| Build | scan ms |
|---|---|
| old (21210c5b + counters) | 518, 538, 632, 542, 535, 641, 539, 533 (median 538) |
| new | 374, 370, 402, 372, 383, 378, 373, 378 (median 376) |

## Open
- The AB=CD part is still 161 ms in Node with the larger page input. About half of it is the trend of the entry environments (`snapshot` and the run), the rest are the zones of the shown candidates. A lower value needs a design change (one run per time frame across searches), not a local one.
- The old level of about 60 ms (before PR 650) was measured with a smaller input; it is not the target for the larger input.

## Rule for the next change
A change in `trd.ts`, `reasons.ts` or `abcdChecks.ts` runs `formation-trend-run-lib.spec.ts`, `formation-abcd-trade-only-lib.spec.ts`, `formation-scan-golden-lib.spec.ts` and `formation-bases-sweep-lib.spec.ts`. A step of `TrendRun` must never change an object of an earlier candle in place.
