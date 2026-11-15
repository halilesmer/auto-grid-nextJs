---
date: 2026-11-15
author: Claude
type: feature
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD trade: large AB=CD target and split in thirds

## Request
Plan 1114-A4.3 (design approved by Halil, 2026-11-15). When the D of the AB=CD is also the D of a harmonic formation, the trade gets a third target, the large AB=CD target, and the position is split in thirds from the start. Display only; no order.

## Solution
| File | Change |
|---|---|
| `lib/formation/abcdChecks.ts` | Finds X (the pivot before A) when ABCD-16 is met and passes `offset = A − X` and the activation price A on. Draws the target as one horizontal line (`Z-ABCD-09`) with a label (`Z-ABCD-10`, label `bigTarget`). |
| `lib/formation/tradeApply.ts`, `types.ts` | `Trade.tpBig`, `tpBigAtEntry`, `tpBigActivation`. TP3 (0.786) now needs a divergence, not only "from A". |
| `lib/formation/trade.ts` | `outcomesOf` and `realizedOutcomesOf` give four paths in thirds when the large target exists (`tp123`). |
| `lib/formation/tradeStatus.ts` | New state `tp123`; TP2 no longer ends the trade when the large target exists; activation by a close beyond A; `bigFill`, `bigActive`. |
| `components/formation/FormationTrade.tsx`, `i18n/messages/formation.ts`, `hints.ts` | Third target cell with share and activation text, four result boxes, status texts. tr, en, de, each with a hint. |

## Rules
- Large target (buy; sell is the mirror) = D + (A − X). It moves with the D extreme like TP1 and TP2. At the entry D is level 1, so `tpBigAtEntry = level 1 + (A − X)`.
- It exists only when the harmonic check of ABCD-16 is met and X is known. Without a harmonic D nothing changes: halves, and TP3 (0.786) as an extra target without a share when there is a divergence.
- Not active until one candle closes beyond A in the profit direction. Before that it is never counted as hit.
- Shares: one third each for TP1, TP2 and the large target. Results in R: stop −1; TP1 and the rest at the entry `⅓·r1`; TP1 and TP2 and the rest at the entry `⅓·(r1+r2)`; all three `⅓·(r1+r2+r3)`.
- After TP2 the stop of the last third stays at the entry. A close beyond the entry ends the rest at the entry. Stop before target in one candle, and no target on a candle with a new extreme, as before.
- The 0.786 level is shown only with a divergence. Before this change the block showed it whenever the target Fibonacci started at A, while the drawing showed it only with a divergence.

## Assumptions
- The D of the large target is the same D value the other targets use (the moving extreme), not the D of the harmonic formation alone.
- The candle that activates the target may also hit it (the target lies beyond A, so price passed A first).
- With a harmonic D and a divergence together, the large target is the third share and 0.786 is shown as a fourth extra target without a share.
- The harmonic check uses the current D, while the frozen stop anchor uses the D of the entry candle (as before).

## Verification
- Library tests (sell and buy mirror): status walk (open after TP2, activation, same-candle cases, rest at the entry, stop first), four paths in R with hand values, realized fills, a Gartley fixture for the target level and the drawings, no target without a harmonic D or before level 1.
- Block tests on a real Gartley fixture (open and after TP1), 375 px, and the unchanged block without a harmonic D.

## Open points
- [ ] The large target depends on the harmonic check of the current D. If a later wick makes that check fail, the block falls back to halves. Not frozen at the entry candle (found in review; not changed).
- [ ] Not checked on a live chart. No fixture covers harmonic D and divergence together.
