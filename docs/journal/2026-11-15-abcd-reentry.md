---
date: 2026-11-15
author: Claude
type: feature
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD trade: re-entry state and "only first target" warning

## Request
Plan 1114-A4.4 (design approved by Halil, 2026-11-15, box 7). After the first trade hit TP1 and TP2, price can return to the Engulf zone at D. The trade block shows this as a separate re-entry section. If only TP1 was hit, it shows one warning line instead. Display only; no order.

## Solution
| File | Change |
|---|---|
| `lib/formation/reentry.ts` (new) | Pure function `reentryOf`: finds the Engulf zone at D, checks that no candle closed beyond it, and looks for the first touch after TP2 (re-entry) or after TP1 (warning only). |
| `lib/formation/earlyReversal.ts` | The "nearest opposing zone edge" step is now the shared helper `nearestEdgeFrom`. Early reversal uses it with the same result as before. |
| `lib/formation/tradeStatus.ts` | New field `tp2Idx` (candle that counted TP2). No existing result changes. |
| `lib/formation/abcdChecks.ts`, `tradeApply.ts`, `types.ts` | `Trade.reentry` (entry, stop, emergency stop, target) and `Trade.reentryTp1Only`. |
| `components/formation/FormationTrade.tsx`, `i18n/messages/formation.ts`, `hints.ts` | Separate section below the result boxes, own reward-to-risk ratio, warning line. tr, en, de, each with a hint. |

## Rules
- The state exists only when all of this is true: TP1 and TP2 of the first trade are hit; a candle after the TP2 candle touches the Engulf zone at D (same side as the trade, formed before D, touched by the D candle); no candle since the zone formed has closed beyond its far edge (sell: above, buy: below).
- Entry = near edge of the zone (the touch). Stop = far edge (works on a candle close) plus the usual emergency stop (`emergencyStopOf`, ATR of the last candle). Target = near edge of the nearest opposing zone in the trade direction, seen from the entry. No split, no result boxes, no status walk.
- A close beyond the zone makes the section disappear. The result of the first trade stays in the block.
- If only TP1 was hit (TP2 not hit, also when the rest closed at the entry) and a candle after TP1 touches the zone: no values, one warning line.
- No Engulf zone at D: neither the section nor the warning.
- No new chart drawing (the approved design has none).

## Assumptions
- "Hit TP1 and TP2" also holds when the position has a large target (thirds) and the last third is open or closed.
- "Last opposing zone in price direction" is taken as the nearest opposing zone edge from the entry, the same helper as target 1 of the early reversal.
- If several Engulf zones qualify, the one with the tightest far edge is used.
- The touch must come on a candle after the TP2 candle (after the TP1 candle for the warning).
- A zone that was consumed (a close beyond it) at any time up to the last candle is dropped, also if the close came after the re-entry touch (decision 3).

## Verification
- Library tests (sell and buy mirror, `formation-abcd-reentry.spec.ts`): state arises; no touch; close beyond on the touch candle; close beyond after the touch; touch before TP2; no opposing zone; only TP1 gives the warning; no warning after a close beyond; no state when TP1 is not hit; no Engulf zone at D.
- Block tests on real fixtures (`crb-form-h4-01` re-entry, `gar-buy-h4-01` warning, `abcd-buy-h4-02` neither), 375 px without overflow.

## Open points
- [ ] Not checked on a live chart. Only buy examples exist in the real fixtures; sell is covered by the library tests.
- [ ] Which opposing zone counts as the target ("nearest" vs "last") is an assumption; the ratio in the design (6.82) cannot decide it.
- [ ] "Engulf zone at D" is read as a zone formed before the D candle (as in ABCD-10 and the early reversal). The zone of an Engulf candle that wraps the D candle itself (zone index = D + 1) does not count. If Halil means that zone too, the state does not arise in those setups.
