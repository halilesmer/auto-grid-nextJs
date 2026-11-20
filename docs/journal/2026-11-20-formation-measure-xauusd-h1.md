---
date: 2026-11-20
author: Claude
type: diagnosis
status: open
features: [FRM-39]
areas: [frontend]
---

# XAUUSD H1 history scan with current main

## Request
Plan 1120-A13.5. Run the XAUUSD H1 live history scan again with current `main`, with the same settings as the EURUSD H1 run, and count the violations. No code change.

## Method
- Code: `main` at commit `f56a1f6c` (v0.7.677). It has PR 635 (scan speed) and PR 637 (stop from entry ATR, no look-ahead in the early return, Cypher target, live scan invariants).
- Spec `e2e/live/formation-history.spec.ts` (tag FRM-39). The run reads only, on the DEMO account.
- Settings: `FORMATION_HISTORY_TFS=H1`, `_SYMBOLS=XAUUSD`, `_BARS_H1=6240`, `_STEP_H1=4`. These are the settings of the EURUSD H1 run (1560 scans over 6240 candles).
- Machine lock `/tmp/gridrobot-heavy.lock` held for the whole run.

## Result
| Item | Value |
|---|---|
| Scans | 1560 (from 2025-10-31 to 2026-11-20) |
| Mean time per scan (wall clock) | 2365 ms |
| Scan time in total | 3689 s (61.5 min) |
| Candle gaps in the context | none (H4, H1, M15: 0 missing ranges) |
| AB=CD candidates / entered | 220 / 28 |
| AB=CD last state of the 28 entered | breakeven 9, TP1 4, TP1+TP2 7, stop 7, open 1 |
| C-leg sections born | 174 |
| AB=CD re-entry | 1 (with second target 1) |

Harmonic formations (the spec counts candidates that reached D, not a result distribution):
| Formation | Candidates | Reached D |
|---|---|---|
| Gartley | 157 | 29 |
| Bat | 152 | 27 |
| Butterfly | 205 | 22 |
| Crab | 159 | 9 |

`stopChanged`, `entryNotDLevel` and `abcdEntryStopChanged` are 0.

## Violations: 239 in two classes
The spec prints a violation only when its count is above zero. These have count 0: `statusWentBack`, `targetsNotOrdered`, `emergencyStopChanged`, `riskNotPositive`, `nonFinite`, `cLegWhileReached`, `tpBigPresenceChanged`, `abcdEntryStopChanged`.

| Class | Count | By label |
|---|---|---|
| `targetNotOnProfitSide` | 229 | Butterfly `tp2AtEntry` stopped sell 37 and buy 30; Crab `tp2AtEntry` stopped sell 141 and buy 20; AB=CD `tp1` open buy 1 |
| `fillOnLossSide` | 10 | AB=CD `tp1Fill` breakeven buy 10 |

The spec keeps only the first example of each class (not three). It is the only example in the data:
- `targetNotOnProfitSide`, Butterfly, sell, state at 2025-11-12 20:00: `tp2` 4057.84 and entry 4053.30. A sell target above the entry is not on the profit side.
- `fillOnLossSide`, AB=CD, buy, state at 2026-05-15 03:00: `tp1Fill` 4683.32 and entry 4683.41 (stop 4669.91). The fill is 0.09 below the entry of a buy.

## Reading
- 228 of the 229 `targetNotOnProfitSide` hits are Butterfly and Crab `tp2AtEntry`. This is the known defect in the Butterfly and Crab target, which another session fixes. They are not counted as new here.
- The other 11 hits are AB=CD and are new: 1 `tp1` open buy and 10 `tp1Fill` breakeven buy. The `tp1Fill` value lies 0.09 below the entry in the example. The cause is not found. The reading is open: this can be a spread or rounding share in the breakeven fill, or a defect. The example key is `buy|1778752800|1778756400|1778770800`.

## Open points
- Examples 2 and 3 of each class are missing, because the spec stores only the first. A change that keeps up to three examples per class is a small spec change for a later PR.
- Cause of the AB=CD `tp1Fill` breakeven and `tp1` open hits is not found.
- Re-run Butterfly and Crab after the target fix lands.
- The time is wall clock. The run took 61.5 min with the Mac in normal use; the old run needed about 6 hours at 14.5 s per scan, so PR 635 gives a factor of about 6.
