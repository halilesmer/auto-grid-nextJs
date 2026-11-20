---
date: 2026-11-20
author: Claude
type: fix
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# Butterfly and Crab: TP1 and TP2 at entry stay at the entry wick

## Request
The live scan of PR 637 found `BUT.tp2AtEntry` and `CRB.tp2AtEntry` on the loss side 456 times (EURUSD H4, 400 candles), always in state `stopped`. The coordinator decided (1120-A10.1): a value named "at entry" does not change after the entry. This is a defect fix, not a rule change.

## Cause
`harmonicTrade` (`tradeApply.ts`) computed `tp2AtEntry` as Fib `from → (entryLevel ?? d.price)`. Butterfly and Crab enter at the wick of the touch candle (`freeze.touchEnd`). `d.price` is the running extreme wick. When price went on, the "TP2 at entry" moved with D and could cross to the loss side of the entry.

## Solution
| File | Change |
|---|---|
| `lib/formation/tradeApply.ts` | `tp2AtEntry` uses `freeze.entryLevel ?? freeze.touchEnd`, the same anchor as entry and stop. `tp1AtEntry` is now always set with the same anchor (Decision 1120-A10.2). Gartley and Bat (`entryLevel` set) give the same values as before. |
| `e2e/mocked/formation-harmonic-trade.spec.ts` | New test (BUT and CRB, buy and sell): a later candle makes a new extreme wick; `tp1AtEntry` and `tp2AtEntry` must stay Fib `A → touchEnd`, and the CRV (`tradeMetrics`) and `outcomesOf` must not change. It failed before the fix (4 cases) and passes after it. |

## Decision 1120-A10.2
Butterfly and Crab now also give `tp1AtEntry` (Fib `A → touchEnd`); the conditional spread is gone and the field is always set. `outcomesOf` says "all distances apply at the entry", and `tradeMetrics` uses `tp1AtEntry ?? tp1`. Without the field the CRV moved with the running D, and when D ran far the reward fell to 0 or below and the CRV disappeared. The fill prices of TP1 and TP2 (the running `tp1` and `tp2`) do not change.
