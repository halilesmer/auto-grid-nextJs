---
date: 2026-11-17
author: Claude
type: fix
status: open
pr: []
features: [FRM-39]
areas: [frontend, formation]
---

# AB=CD stop moved after the entry candle

## Request
A one-year EURUSD H4 scan (candidate re-evaluated on every candle) broke the rule "entry and stop freeze on the first candle that touches level 1". In 112 scan states the same candidate (same A, B, C) kept its entry, but the stop moved two days later from 1.15596 to 1.15725. Gold and GBPUSD showed no violation.

## Cause
`evaluateFull` in `abcdChecks.ts` picks the stop anchor `frozenFrom` (A or C) with `divHolds || harmonicK` for the entry candle `k`. Both inputs are computed from the current environment (all candles up to now): `divergenceOf(trend, …)` reads wave values of the current pivots, and `harmonicD(env, …)` reads X, the zones and the Gartley/Bat verdict. A later candle can change these values, so `frozenFrom` flips between A and C and the stop moves (`tradeApply.ts`: `stop = fibPrice(frozenFrom, level1, -stop)`).

Proved with a synthetic Gartley case (`GARTLEY`): entry candle 32 gives anchor A, stop 97.3848. One extra candle that closes below X (GAR-18) makes `harmonicD` return "unmet", the anchor becomes C and the stop is 99.3177. Same entry. The `harmonicK` input is therefore proved. The `divHolds` input uses the same current environment and is fixed by the same change, but I did not build a separate synthetic case for it.

## Solution
`evaluateFull` now returns `frozenFrom` too. When an entry candle exists and later candles exist, the environment at the close of the entry candle (`atEntry`) is built once and one run in it gives both the big target (as before, PR 573) and `frozenFrom`. If that environment cannot be built, the old behavior stays. Tests: `formation-abcd-lib.spec.ts`, "Stop dondurulur" (two tests: one extra candle; five different tails, entry, stop, `tp1AtEntry` and presence of the big target stay equal).

## Lesson
Every value of a trade that "freezes at entry" must come from the environment at the entry candle, not only the value that was found first. Check all inputs of the frozen value, not just the one that failed in the scan.
