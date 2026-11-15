---
date: 2026-11-15
author: Claude
type: feature
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD trade block: TP2, TP3 and results in R

## Request
Plan 1114-A4.2 step a (values only). The AB=CD trade block shows TP2, an extra target TP3, the distance to the entry under each value, the split of the position and three results in risk units (R). The block text loses rule IDs and unclear abbreviations. Step b (walk the candles: open, TP1 hit, stopped; move the stop to the entry) is a separate session.

## Solution
| File | Change |
|---|---|
| `lib/formation/types.ts` | `Trade` has the optional fields `tp2`, `tp2AtEntry`, `tp3` and `tp1StrongZone`. Only AB=CD sets them. |
| `lib/formation/tradeApply.ts` | `abcdTrade` returns TP2 = 0.618 of the target Fib (follows the outermost wick like TP1) and `tp2AtEntry` (Fib `frozenFrom → level 1`). TP3 = 0.786 of the same Fib, only when the Fib starts at A (divergence or harmonic D). `harmonicTrade` is unchanged. |
| `lib/formation/trade.ts` | `outcomesOf`: stop −1; TP1 and the rest at the entry 0.5 × TP1 distance / risk; TP1 and TP2 0.5 × (TP1 + TP2 distance) / risk. All distances come from the values at the entry. `strongZoneAt`: a very strong zone on the opposite side contains the TP1 price. |
| `lib/formation/abcdChecks.ts` | Passes `fromA` and the strong-zone flag (TP1 at the entry against `env.frz` zones with strength 2) to `abcdTrade`. |
| `components/formation/FormationTrade.tsx` | TP2 and TP3 cells, "½" share badge on TP1 and TP2, distance in pips (price difference when the symbol has no pip) under stop, TP1, TP2 and TP3. The "Distance" cell is gone. Result boxes in R and the strong-zone warning. |
| `i18n/messages/formation.ts`, `hints.ts` | New texts in tr, en, de. Rule IDs (HDL-41, HDL-02, ABCD-08), "CRV" and the veto ID are removed from the visible text of the block. The SIG-29 check row inside the block keeps its ID and rule text (it is a row of the check list). For AB=CD the ratio is always 1, so this row always shows. |

## Why
- TP2 and TP3 follow the same Fib as TP1, so the chart target Fib (Z-ABCD-05, levels 0.382 and 0.618, 0.786 with divergence) already shows them. No new chart line.
- The results use the values at the entry, as the ratio does. A moving TP2 would change the "TP1 and TP2" box with every new wick.
- The strong-zone warning only informs. The calculation does not change.
- Rejected: a fixed "+1.31" style value in the text. The values come from the current entry, stop and targets.

## Verification
- Red first: the new `@FRM-05` tests did not compile before the change (`outcomesOf` and `strongZoneAt` missing); the TP3 case returned `undefined`.
- Library tests in `formation-abcd-lib.spec.ts` and block tests in `formation-trade.spec.ts` (with 375 px).

## Open points
- [ ] Step b: state per candle (open, TP1 hit, stopped) and the stop moved to the entry.
- [ ] The level label ("0.382") and "level 1" under the values of the design are not in the block.
- [ ] The SIG-29 row in the AB=CD block always shows (ratio 1) and carries its ID and the text "CRV ≤ 1". Decide whether to hide or reword it in the block.
- [ ] The strong-zone warning is wired in `abcdChecks.ts` but only the pure function `strongZoneAt` has a test.
- [ ] Look at the block in a browser, in light and dark theme.
