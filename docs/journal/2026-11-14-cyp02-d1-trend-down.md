---
date: 2026-11-14
author: Claude
type: diagnosis
status: done
pr: []
features: [FRM-12]
areas: [frontend]
---

# GBPUSD H4 Cypher: CYP-02 unmet, D1 trend down

## Request

The GBPUSD H4 Cypher from the outside chart now shows in the strip as "near" (required 5 of 7). The missing checks are CYP-02 and CYP-06. Find out why CYP-02 (higher time frame trend in trade direction) is unmet.

## Cause

There is no defect. The rule works as written.

- `cypChecks.ts` reads the trend of `higherTrendTf(env, tf)`. For H4 this is D1 (`neighborTf`; W1 only above D1).
- The Cypher is a buy. CYP-02 is met only when the D1 trend is `up`.
- The D1 trend is `down`. A run of `formationTrend` on the D1 candles of the worker (DEMO account A, 780 candles, default trend settings) gave this result:

| Evaluation time (UTC) | D1 `dir` | W1 `dir` |
|---|---|---|
| 2026-10-14 | down | — |
| 2026-10-24 | down | up |
| 2026-11-03 | down | — |
| 2026-11-10 | down | — |
| 2026-11-14 | down | up |

D1 pivots at 2026-11-14:

| Date | Kind | Price |
|---|---|---|
| 2026-07-15 | impulse | 1.35575 |
| 2026-07-28 | impulse | 1.32729 |
| 2026-08-21 | correction | 1.36751 |
| 2026-10-14 | impulse | 1.31364 |
| 2026-11-04 | correction | 1.35026 |

- The D1 trend changed to `down` at the end of September. The first D1 close below the low 1.32729 (2026-07-28) was on 2026-09-23 (1.32393).
- After that the structure has lower highs and lower lows: 1.36751, then 1.31364, then 1.35026.
- The D1 trend changes to `up` only after closes above 1.36751 (TRD-17).
- The W1 trend (built from D1, `splitDaily`) is `up`. On W1 the low 1.31364 is only a correction pivot.

## Why

No code change. The rule book defines CYP-02 as the trend of the next higher time frame (TRD-27, approved): D1 for H4.

The source of the rule explains the Cypher with a rising trend on a schema. It does not name a time frame.

The author of the outside chart probably reads the W1 rise as "the trend". That explains the difference.

Rejected: change CYP-02 to "D1 or W1". This changes an approved rule because of one example. In our measurement this Cypher is a buy against the D1 trend. A trade against the trend needs at least 3 reasons (TRD-32).

## Verification

- Temporary Playwright logic test with `FormationContext`, `formationTrend` and `splitDaily` on the worker D1 candles. Result in the tables above. The test file was deleted after the run.
- Browser check (localhost:3000, main v0.7.578): the strip shows "Cypher 5/7" with status "near". The panel lists "Geçersiz: CYP-02, CYP-06"; CYP-06 is RSI(7) 79.692 at C (limit 80).

## Lessons

- A difference to an outside chart can come from the time frame of the trend, not only from the broker data. Measure the trend of each time frame before you change a rule.
