---
date: 2026-11-24
author: Claude
type: decision
status: closed
pr: []
features: [FRM-08, FRM-18]
areas: [frontend]
---

# One trend run per time frame is not done: the trend is only about 6 % of the formation search (1124-G1)

## Request
The "Open" part of 2026-11-24-abcd-scan-speed said that about half of the AB=CD part was the trend of the entry environments. It also said that a lower value needs one trend run per time frame across searches. Halil said "Buna başla" (1124-A6.3). Task: measure the parts on the current `main` first, then design the change, then decide.

## Measurement
- Code: `main` at 50caadfc. Node CPU profile (`--cpu-prof`, interval 0.5 ms) of the USOUSD page run of `formation-scan-golden-lib.spec.ts` (`LOAD_DAYS`, `fakeNow` 2026-11-12T16:21Z). Two runs: 4 turns (load 77 to 83) and 6 turns (load 43 to 44). Other sessions ran e2e tests at that time.
- The load was very high, so the time of one turn (1.7 s to 13.8 s) is not usable. The parts are almost the same in the two runs. The browser median was not measured again; 376 ms is the value of PR 673.
- Page hash equal to the golden record (`840d8d1a06e6…`). Work counters of one turn: 113 260 trend candles, 3 full AB=CD measurements, `evaluated` 5 760, `keyBuilds` 58 766.

| Part of `scanFormations` (inclusive) | run 1 | run 2 |
|---|---|---|
| Harmonics (`analyzeXabcd`, nearly all in `shownAt`) | 64.1 % | 74.0 % |
| AB=CD (`analyzeAbcd`) | 25.9 % | 14.8 % |
| Trend, all analyzers (`formationTrendDir` + `prefixTrend`) | 6.8 % | 6.3 % |
| – `formationTrendDir` (new `buildTrend` for each view and candle) | 4.1 % | 3.9 % |
| – `prefixTrend` (entry environments, runs and `snapshot`) | 2.7 % | 2.4 % |

Inside AB=CD: zones (`analyzeFrz`) 36 % and 30 %, the Gartley/Bat verdict at the entry (`harmonicD`) 27 % and 28 %, the trend (`trendOf`) 11 % and 11 %.

## Correction
The statement "about half of the AB=CD part is the trend" in 2026-11-24-abcd-scan-speed is not correct for the current code. The trend is about 11 % of the AB=CD part and about 6.5 % of the full search.

## Design that was examined
- One `TrendRun` per context and time frame. The run records the direction after each candle, so `formationTrendDir` reads it and does not build a trend again. `prefixTrend` keeps one run with a copy of the state every 64 candles.
- Invariants: the state after n candles equals `buildTrend` of the first n candles; a step never changes an object of an earlier candle in place; the cache stays per context; the golden record stays 414 of 414.
- Risk: a checkpoint that copies `rejected` or `byPoint` incompletely changes results without an error.
- Expected gain: at most about 6.5 %, so at most about 25 ms of 376 ms in the browser (probably 15 to 20 ms). The browser runs of PR 673 spread from 370 to 402 ms.

## Decision
Not done (Halil, 2026-11-24, option A of 1124-G1.1). The gain is in the spread of the browser runs, and the checkpoint is a risk. No code change.

## Open
- Most of the search time is in the searches of earlier closes of the harmonics (`shownAt`, 64 to 74 %). That is step E (harmonic pre-pass); do it only when Halil asks.
- A smaller part: the Gartley/Bat verdict at the entry and the M15 zones of the AB=CD part, about 7 to 9 % of the search.
- Measure again with a browser profile when the load is low. If the trend is more than about 15 % there, examine the design again.
