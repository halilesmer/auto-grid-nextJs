---
date: 2026-11-20
author: Claude
type: change
status: done
features: [FRM-18]
areas: [frontend]
---

# Formation scan: faster, same result (plan 1114-A4, speed part)

## Request
The measurement of 2026-11-19 (`2026-11-19-formation-measure-new-code-h1-speed.md`) found that one `scanFormations` call grows faster than the square of the history length. Goal: faster scan, bit-identical results.

## Change
- `trd.ts` (`buildTrend`): the `folded` value (the outermost rejected correction of one side) came from a filter and reduce over all earlier candidates for each fractal. Now the rejected corrections stay in one list per side (`rejected`), filled when a candidate is not accepted. Tie rule is the same: the oldest one wins.
- `trd.ts` (`setDrawn`): the candidate of a pivot came from `m.cands.find` for each add and cut. Now a map by candle and side gives the same (first) candidate. The profile after the `folded` change showed this as the next hot spot (about 1.1 s of 5.3 s).
- `frz.ts` (`countTests`): the "an opposite fractal finished after the last test" check ran `counter.some` for each candle. Now the smallest opposite fractal after the last test is computed once for each test, not for each candle. The result is the same for any order of `counter`.
- Not changed: trend sharing between analyzers (`trdFormation.ts`, `reasons.ts`). The scan already builds the environment once for each time and timeframe. A trial that also shared the trend models between these environments gave no gain (5.0 s before, 5.4 s after, inside the noise), so it was dropped. `trdChecks.ts` `buildModels` is not on the scan path (`analyzeTrd` is only used by tests).

## Equality
Local harness, not committed: `scanFormations` output as JSON before and after, compared byte by byte.
- All 110 fixtures, 7 scan times each (candle 150 to the last): equal.
- Live candles of the DEMO account, read once, read-only, kept only on the Mac: GBPUSD H4 at 300, 500, 800, 1000, 1200, 1400, 1560 and 1900 main candles; EURUSD H1 at 500, 1000, 1500, 2000, 2500, 3000 and 3500 main candles: equal.
- The run before the change is deterministic (two runs gave equal files).
- Permanent test: `e2e/mocked/formation-scan-speed-lib.spec.ts` (tag FRM-18). `countTests` against the old calculation on 3000 random series. `buildTrend` against a checksum per fixture (`e2e/fixtures/formation-trend-digest.json`, made with the code before the change). Write the checksums again only after a wanted change of the trend rules (`TREND_DIGEST_WRITE=1`).

## CPU per scan (`process.cpuUsage`, user + system, ms, one process, one scan per row)
Before = two runs of the code before the change (the Mac was not idle, so runs differ). After = two runs of the final code.

| Series, main candles | Before run 1 | Before run 2 | After run 1 | After run 2 |
|---|---|---|---|---|
| GBPUSD H4, 800 | 373 | 442 | 183 | 164 |
| GBPUSD H4, 1200 | 775 | 804 | 251 | 230 |
| GBPUSD H4, 1560 | 1896 | 1976 | 486 | 459 |
| GBPUSD H4, 1900 | 2167 | 3322 | 585 | 485 |
| EURUSD H1, 1000 | 368 | 369 | 130 | 136 |
| EURUSD H1, 2000 | 3534 | 2962 | 686 | 908 |
| EURUSD H1, 3000 | 7090 | 7136 | 1569 | 1844 |
| EURUSD H1, 3500 | 14766 | 11613 | 2114 | 2610 |

EURUSD H1 at 3500 candles: about 11.6 to 14.8 s before, 2.1 to 2.6 s after (4.5 to 7 times faster). Steps on EURUSD H1 3500 (one run each): `folded` only 4.96 s; plus `countTests` and `setDrawn` 2.11 s.

## Remaining profile (EURUSD H1, 3500 candles, after `folded`, before the other two changes)
`countTests` about 2.0 s, `setDrawn` about 1.1 s, `scanZone` 0.43 s, `buildTrend` 0.34 s, `changeRef` 0.2 s. Not profiled again after the last change. The growth with history length is still above linear (zones times candles in `countTests` and `scanZone`); the next step would be to cache the scans of one zone between scan times.

## Lessons
- The first estimate put the trend rebuild (`buildTrend` called again by each analyzer) at the top. The scan already shared it per time and timeframe; the cost was inside `buildTrend` (`folded`, `setDrawn`). Profile after each change: the order of hot spots moves.
