---
date: 2026-11-20
author: Claude
type: fix
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# Formation fixes: Not-SL history, early reversal look-ahead, Cypher TP basis, live checks

## Request
A review of the merged formation code found three defects. Halil asked to fix all of them and to add checks to the live scan.

## Solution
| File | Change |
|---|---|
| `lib/formation/abcdChecks.ts`, `tradeApply.ts` | The Not-SL of an entered trade is stop ± the ATR(14) that was known at the entry. An entry inside a candle (AB=CD level 1: `freezeIdx − 1`, harmonics: `run.entryIdx − 1`, re-entry: `reentry.idx − 1`, early reversal found in the lower timeframe: `early.idx − 1`) knows only the candle before, because the rest of the range of the entry candle is not known yet. An entry at a candle close (early reversal, engulf in the pattern timeframe) uses that candle (`early.idx`). Index below 0: no Not-SL, as before. `trade.emergencyStop` shows the same value. Before the entry (C leg, open pattern) the ATR of the last candle stays. `TradeInput.entryAtrIdx` carries the candle. |
| `lib/formation/earlyReversal.ts` | In the D candle, an engulfing candle of the lower timeframe counts only from the lower candle in which the price first reaches the band (−0.272). If the lower candles never reach it, the lower timeframe gives no hit. |
| `lib/formation/cypChecks.ts` | `tp2AtEntry` removed. TP1 and TP2 both run with Fib C → D, and the result box uses the running TP2. |
| `e2e/live/formation-history.spec.ts` | New violations: `statusWentBack`, `targetNotOnProfitSide`, `targetsNotOrdered`, `emergencyStopChanged`. |

## Rules
- The ATR of a Not-SL is the one known at the entry: no look-ahead into the entry candle (coordinator request, 2026-11-20).
- Past stays past: a later, bigger ATR must not turn yesterday's wick stop into "open".
- No look-ahead: a candle of the lower timeframe is valid only if the band was reached at or before its close.

## Assumptions
- "Reached" uses `>=` on the wick (equality counts). An engulf on the same lower candle that reaches the band counts, because the band is known at its close.
- Cypher: the journal of 2026-11-19 (harmonic trade block) does not record a decision for TP2 at the entry of Cypher. The code comment said TP2 runs like TP1, so the comment won.
- Early reversal takes the engulf candle as the entry candle for its Not-SL (close of the candle in the pattern timeframe; for a lower-timeframe hit, the pattern candle is not closed yet, so the one before).

## Tests
- Not-SL: `formation-harmonic-trade.spec.ts` (GAR, BAT, BUT, CRB, both sides) and `formation-abcd-lib.spec.ts` ("Not-SL (sell/buy)"). Red without the fix, green with it. "Not-SL … ATR der Kerze vor der Einfrierkerze": the freeze candle and the candle before have different ATR, the expected value is the earlier one (red with `freezeIdx`, green with `freezeIdx − 1`).
- Look-ahead: `formation-abcd-lib.spec.ts` ("Erken dönüş … ileriye bakma yok", "banda ulaşan mumun kendisinde", "band hiç görülmediyse", tie and "formation first" cases), both sides.
- Cypher: `formation-cyp-lib.spec.ts` ("Handelsblock … TP2").
- Not tested by a case: the re-entry Not-SL (needs the full zone setup); it uses the same helper.

## Live check (EURUSD H4, 400 candles, DEMO, read-only)
- Run 1: `targetNotOnProfitSide` x3549. Cause: the running targets (`tp1`, `tp2`) follow the extreme and are meaningless after the trade ended (stopped, rest at entry, TP1 and TP2). This was a defect of the check, not of the code. The check now looks at running targets only while they count.
- `fillOnLossSide` (TP1 or TP2 fill price on the loss side of the entry): 0 cases. A target that moved to the loss side never counted as filled in this sample.
- Remaining after the narrowing: `BUT.tp2AtEntry` and `CRB.tp2AtEntry` on the loss side x456, all in state `stopped`. Code defect: `harmonicTrade` computes `tp2AtEntry` for Butterfly and Crab from `d.price` (the running extreme), but their entry is the fixed touch wick. When the price runs on, the "at entry" value moves with D and can pass the entry. Not fixed here (out of scope); the live check stays red for it.
- `statusWentBack`, `targetsNotOrdered`, `emergencyStopChanged`: 0.

## Open
- `tp2AtEntry` of Butterfly and Crab must use the touch wick (`freeze.touchEnd`), not `d.price`. Needs a decision from the coordinator.
Out of scope and unchanged: early reversal zone priority before the time rule; the name `tp2AtEntry` for Butterfly and Crab; speed.
