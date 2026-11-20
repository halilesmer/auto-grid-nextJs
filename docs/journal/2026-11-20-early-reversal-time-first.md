---
date: 2026-11-20
author: Claude
type: fix
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# Early reversal: the earliest engulf wins, and three new live checks

## Request
Live, an early reversal entry first appeared in zone B and some candles later moved back to zone A (decision 1120-A14.1). Halil agreed that the engulf with the earliest close must win. The live history scan also had gaps (1120-A13.8).

## Cause
`earlyReversalRun` sorted the zones by far edge and returned the first zone that had an engulf. An engulf in another zone that closed earlier was ignored. When a later candle made an engulf valid in the nearer zone, the entry moved.

## Solution
| File | Change |
|---|---|
| `lib/formation/earlyReversal.ts` | All zones are scanned. The engulf (pattern timeframe or lower timeframe) with the earliest close is valid. With equal close time, the zone with the nearest far edge (the nearest stop) wins, as before. The rules inside one zone are unchanged: volume, touch, stop beyond the entry, `lowerFrom`. |
| `e2e/mocked/formation-abcd-lib.spec.ts` | Two tests: late engulf in the near-stop zone and early engulf in the other zone gives the early one; equal close gives the near-stop zone. The first test failed before the fix (entry candle 8 instead of 6). |
| `e2e/live/formation-history.spec.ts` | New violations `entryChanged` and `candidateVanished`. All loaded timeframes are tracked, not only the main one. |

## Rules
- Time first: the engulf that closes first is valid, in any zone.
- Equal close time: the zone with the nearest far edge wins.
- `entryChanged`: after the entry (`status` or `earlyReversal` set), entry, stop and entry kind (early or normal) stay fixed.
- `candidateVanished`: a candidate with an entry must appear in every later scan. A candidate whose first point leaves the history window of its timeframe (`HISTORY_DAYS`) is no violation.

## Assumptions
- "Entered" means `trade.status` or `trade.earlyReversal` is set and the entry is not null.
- The scan window is `HISTORY_DAYS[timeframe]` before the scan time. Candidates that drop out because newer pivots push them out of the pivot lookback still count as vanished.
