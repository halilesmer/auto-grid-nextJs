---
date: 2026-11-15
author: Claude
type: feature
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD trade: early reversal

## Request
Plan 1114-A4.5 (rule book decision, Halil 2026-11-15). Leg D can turn before it reaches level 1: it passes the 0.272 extension, touches a zone against the trade, and an engulfing candle closes in the trade direction. The trade block shows this as its own state. Display only; no order.

## Solution
| File | Change |
|---|---|
| `lib/formation/earlyReversal.ts` (new) | Pure `earlyReversalOf`: tests the condition and returns entry, stop, target 1, target 2 and the gap to level 1. |
| `lib/formation/abcdChecks.ts` | Calls it when the candidate is not invalid and level 1 is not reached (with tolerance). The check list, verdict, alarm and favourites do not change. Z-ABCD-07 and Z-ABCD-08 draw the stop. |
| `lib/formation/types.ts`, `tradeApply.ts` | `Trade.earlyReversal` (`target2`, `gap`). |
| `components/formation/FormationTrade.tsx`, `i18n/messages/formation.ts`, `hints.ts` | Status row, note box, target cells, ratio to target 1, footer line. tr, en, de. |

## Rules
- Condition (sell; buy is the mirror): the tip of D reached the 0.272 extension and not level 1 (ABCD-08 tolerance included). A fractal zone or engulfing zone of the trade side lies in the band between the extension and level 1, and the candle of the tip touches it. An engulfing candle in trade direction closes at or after the tip, and one of its candles touches the zone.
- Entry = close of the engulfing candle. Stop = far edge of the zone (works on a candle close; emergency stop as usual). Target 1 = near edge of the nearest zone of the other side in trade direction from the entry. Target 2 = near edge of the zone at point C, only if it lies beyond target 1.
- No Fibonacci target, no split, no result boxes, no state after the entry. Ratio to target 1; without target 1 the value is "—".
- If level 1 is reached later, the state ends and the block returns to the normal entry.

## Assumptions
- The engulfing candle uses `engulfAt` like ABCD-20. A candle that is not volume-strong rejects it; unknown strength does not count (stricter than ABCD-20, which marks it not measurable).
- The first engulfing candle at or after the tip, for the zone with the nearest far edge, counts.
- Fractal zones of all loaded timeframes count, also reversed ones, like the zones of ABCD-10. Zones formed by the tip itself are not excluded for fractal zones; engulfing zones must be older than the tip.
- Target 2 is not shown if the zone at C is the same as, or nearer than, target 1.
- Ratio below 1 still shows the existing warning text (it names target 1 as "TP1").
- A candidate with an invalid verdict gets no early reversal.

## Verification
- Red first: the new tests did not compile before `earlyReversal.ts` existed.
- Library tests (sell and buy): full condition, extension not reached, no zone in the band, tip does not touch, no or wrong-direction engulf, level 1 reached with tolerance, no zone at C, no zone in trade direction, nearest target, engulfing zone. On real candles with a mirror: values, verdict "forming", drawings, return to the normal entry.
- Block tests on two real fixture moments (buy with targets, sell without a zone) and 375 px.

## Open points
- [ ] No case where a later candle breaks the stop after the early entry; the state is not walked.
