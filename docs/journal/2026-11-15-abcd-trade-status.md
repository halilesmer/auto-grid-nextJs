---
date: 2026-11-15
author: Claude
type: feature
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD trade: state after the entry

## Request
Plan 1114-A4.2 step b. Walk the candles after the entry candle and show the state of the trade: open, TP1 hit, TP1 and TP2 hit, stopped, TP1 hit and the rest closed at the entry. After TP1 the stop moves to the entry, in the block and on the chart. Display only; no order, no lot size, only AB=CD.

## Solution
| File | Change |
|---|---|
| `lib/formation/tradeStatus.ts` (new) | Pure `tradeStatusOf`: walks the candles after the freeze candle and returns `kind`, the stop that applies now, the candle where the stop moved, the way the stop triggered and the end candle. |
| `lib/formation/types.ts`, `tradeApply.ts` | `Trade.status` (optional) and `TradeInput.status`. |
| `lib/formation/abcdChecks.ts` | Computes the state (same emergency stop as the block: close stop ± ATR(14)). `drawingsOf` draws Z-ABCD-07 and Z-ABCD-08 at the entry from the TP1 candle on. |
| `components/formation/FormationTrade.tsx` | Status row under the header, stop cell "Stop (breakeven)" with the old stop struck out, ✓ on hit targets, active result box, faded boxes with a line through the value. |
| `i18n/messages/formation.ts`, `hints.ts` | New texts in tr, en, de; one hint for the status row. |

## Rules (as approved)
- The stop works on a candle close; the emergency stop works on a wick touch.
- Each candle uses the targets from the extreme up to the previous candle.
- Stop and target in one candle: the stop counts. A new extreme and a target touch in one candle: the target does not count.
- TP1 and TP2 in one candle count both, unless that candle closes beyond the entry (then TP1 and the rest at the entry).

## Assumptions
- After TP1 the same close rule applies to the stop at the entry. The emergency stop applies only before TP1; after TP1 a wick alone ends nothing.
- The emergency stop uses the ATR of the last candle, like the value in the block. When new candles arrive, its level can change, so an old "stopped by wick" can turn back to "open".
- The entry candle itself is not tested against the stop (only the candles after it).
- The chart stop line starts at the TP1 candle once the stop moved; the old part is not drawn any more.
- The Fib start (`from`) of the targets is the current one (A with divergence or harmonic D, else C), not the one at the entry candle.
- The block still shows the moving TP1 value with a tick, not the value at which it was hit.

## Verification
- Red first: the new tests did not compile before `tradeStatus.ts` existed. Library tests in `formation-abcd-lib.spec.ts` (sell and buy: open, TP1, TP1 and TP2, close stop, wick emergency stop, rest at the entry, stop and target in one candle, new extreme and TP1 in one candle, moved chart line) and block tests in `formation-trade.spec.ts` (fixture `abcd-buy-h4-02`, 375 px).

## Open points
- [ ] The state is shown for the selected candidate only; the candidate list, alarm and favourites do not use it yet.
- [ ] Hit price per target (value at the moment of the hit) is not stored.
