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
- `candidateVanished` (decision 1120-A42.1): a candidate with an unfinished trade (open, TP1 reached and the rest still running, early reversal, waiting for re-entry) must appear in every later scan. A finished trade (`status.endIdx` set: stopped, rest at entry, all targets) may drop out of the look-back: the past is not rewritten. Those are counted as `finishedVanished` (information, no violation). A candidate whose first point leaves the history window of its timeframe (`HISTORY_DAYS`) is no violation.

## Assumptions
- "Entered" means `trade.status` or `trade.earlyReversal` is set and the entry is not null.
- The scan window is `HISTORY_DAYS[timeframe]` before the scan time. Candidates that drop out because newer pivots push them out of the pivot lookback still count as vanished.

## Open finding: unfinished trades vanish from the scan (live, not fixed here)
EURUSD, scan of 400 H4 candles, `FORMATION_HISTORY_TFS=H4`. 19 candidates with an entry vanished. 16 had a finished trade (`finishedVanished`: stopped 7, rest at entry 8, TP1 and TP2 1). 3 had an unfinished trade. Entry, stop and entry kind did not change (`entryChanged` 0). The live spec stays red for these 3 until a diagnosis is done in a separate session. The check is not relaxed.

| Case | A / B / C | Entry / stop | Entered | Last state | Last seen | Vanished |
|---|---|---|---|---|---|---|
| H1 Bat, buy | 1.17109 / 1.16507 / 1.16792 | 1.15827 / 1.15337 | 2026-08-29 00:00 | open | 2026-08-31 16:00 | 2026-08-31 20:00 |
| H4 Gartley, buy | 1.16537 / 1.15918 / 1.16226 | 1.15750 / 1.15449 | 2026-09-11 16:00 | TP1 reached | 2026-09-12 00:00 | 2026-09-14 04:00 |
| H4 Bat, buy | 1.16537 / 1.15918 / 1.16226 | 1.15758 / 1.15461 | 2026-09-11 16:00 | TP1 reached | 2026-09-12 00:00 | 2026-09-14 04:00 |

The H4 Gartley and the H4 Bat come from the same pivots. The first point of each case is inside the history window of its timeframe, so the window rule does not explain the loss. Cause not known; likely the pivot look-back or a newer pivot.
