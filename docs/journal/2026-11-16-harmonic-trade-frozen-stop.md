---
date: 2026-11-16
author: Claude
type: fix
status: done
pr: [PRNR]
features: [FRM-39, FRM-07, FRM-13, FRM-14]
areas: [frontend]
---

# Harmonic trade: entry at the D level (Gartley, Bat) and a frozen stop (all four)

## Request
Decision owner: user, 2026-11-16. The AB=CD fix of plan 1114-A4.1 (entry at level 1, stop frozen at the first touch) now also applies to Gartley (GAR), Bat (BAT), Butterfly (BUT) and Crab (CRB). Harmonics were left out on purpose in 1114-A4.1.8.

## Root cause
`harmonicTrade` took `entry: d.price` and `stop: fibPrice(from, d.price, -stop)`. `d` is the most extreme wick since C (`extremeAfter`), so each new extreme candle moved the entry and the stop. Proof before the fix (test `Stop bleibt nach einer Kerze jenseits des D-Levels stehen`, 8 cases: 4 harmonics, buy and sell): 8 of 8 failed. After one more candle beyond the D level the stop moved (buy side, expected frozen → old result: BAT 93.27 → 89.92, BUT 77.21 → 74.72, CRB 62.83 → 60.90; GAR 97.41 → 94.07 by hand, because its first assertion already failed on the entry). The GAR entry was the wick (106.41), not the D level (106.417).

## Rules
Decision owner: user, 2026-11-16.
- Gartley and Bat: entry at the price of the D level (GAR-05 level, BAT-07 level 0.886), on touch, never before. Not the extreme wick.
- All four: the stop is fixed and never widens. It is the 1:1 stop of the target fib at the first candle that reaches the D level.
- All four: if price goes beyond D and turns without a stop-out, the target fib is redrawn from A to the new extreme (TP1 moves with the extreme). This stays as it was.
- Butterfly and Crab: the entry stays as it was (extreme wick). Only the stop is frozen.
- The shown profit/loss ratio is the ratio at entry (`tp1AtEntry`, as in AB=CD, A4.1.7).

## Solution
- `tradeApply.ts`: `harmonicFreeze` finds the first candle after C (same start as the D search) whose wick reaches the D level, with the touch tolerance of the formation (GAR, BAT: 1 pip; BUT, CRB: none). Without a hit (own D off the wick) the D candle counts. `harmonicStop` = `fibPrice(A, anchor, -stop)`; anchor = D level (GAR, BAT) or the wick of the touch candle (BUT, CRB). `harmonicTrade` takes the freeze. GAR and BAT also set `tp1AtEntry = fibPrice(A, D level, tp1)`.
- GAR and BAT: stop and TP1 at entry are 1:1 around the D level. BUT and CRB: no `tp1AtEntry` (entry is the moving extreme, so the ratio uses the current TP1).
- Drawings: the level `-stop` left the target fib (it ran with the extreme). A line and a label `stop` (like Z-ABCD-07 and Z-ABCD-08) start at the touch candle: Z-GAR-07/08, Z-BAT-07/08, Z-BUT-07/08, Z-CRB-06/07. Visible text did not change.

## Assumptions
- Stop reference for BUT and CRB is the wick of the touch candle (= the extreme at that moment). The rule gives no entry level for them.
- The touch candle search starts at the same candle as the D search, so it never finds a candle before C.

## Changed expectations
| Test | Old | New | Reason |
|---|---|---|---|
| GAR drawings (`formation-gar-bat-lib`) | ids 01–06 | ids 01–08 | new stop line and label |
| GAR `Z-GAR-06` levels | 0.382, 0.618, −0.382 | 0.382, 0.618 | stop is a separate line |
| BAT drawings | ids 01–06 | ids 01–08 | same |
| BUT drawings, `Z-BUT-05` levels | …06, 05; 0.382, 0.618, −0.382 | …06, 05, 07, 08; 0.382, 0.618 | same |
| CRB drawings, `Z-CRB-04` levels | …05, 04; 0.382, 0.618, −0.382 | …05, 04, 06, 07; 0.382, 0.618 | same |

Trade values of the existing fixtures did not change (their D is the first touch): the base fixtures only check shape, and the new test checks the values.

## Open points
- BUT and CRB: ratio at entry is not defined while the entry moves with the extreme.
- Cypher (CYP) and 2618 are not part of this change. TP2, split, status line and re-entry for harmonics are not part of it.
