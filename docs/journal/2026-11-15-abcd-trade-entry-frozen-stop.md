---
date: 2026-11-15
author: Claude
type: fix
status: done
pr: []
features: [FRM-05, FRM-39, FRM-40]
areas: [frontend]
---

# AB=CD trade: entry at level 1, frozen stop

## Request
Plan 1114-A4.1. The AB=CD trade block moved its entry and its stop with the outermost wick. The rule book (rule ID HDL-14) fixes the entry at level 1 and keeps the 1:1 stop unchanged after the entry.

## Cause
`shapeOf` takes D as the outermost wick since C. `abcdChecks.ts` passed this D to `harmonicTrade`, which returns entry = D, stop = −0.382 of the target Fib `from → D` and TP1 = 0.382 of the same Fib. When price went past level 1, all three values moved.

Example (sell): A 1.0000, B 1.0100, C 1.0050, level 1 = 1.0150, wick to 1.0180.
- Before: entry 1.0180, stop about 1.0230, TP1 about 1.0130.
- Now: entry 1.0150, stop 1.01882, TP1 about 1.01303.

## Solution
| File | Change |
|---|---|
| `lib/formation/tradeApply.ts` | New `abcdTrade`. `harmonicTrade` stays unchanged for GAR, BAT, BUT and CRB. `TradeInput` has the optional fields `tp1AtEntry` and `missed`. CRV and SIG-29 use `tp1AtEntry` when it exists. |
| `lib/formation/abcdChecks.ts` | Find the first candle that reaches level 1 (with the ABCD-08 tolerance). `from` is A when divergence (ABCD-19) or a harmonic D (ABCD-16) holds on that candle, else C. Stop = −0.382 of the Fib `from → level 1`. TP1 and Z-ABCD-05 still use `from → outermost wick`. |
| `lib/formation/abcdChecks.ts` | Z-ABCD-05 loses the stop level. New drawings: Z-ABCD-07 (`hline`, stop) and Z-ABCD-08 (`label`, "Stop"). Z-ABCD-07 starts at the freeze candle. |
| `lib/formation/trade.ts`, `types.ts` | `tradeMetrics` uses `tp1AtEntry` when it exists. `Trade` has the optional fields `tp1AtEntry` and `missed`. |
| `components/formation/FormationTrade.tsx`, `i18n/messages/formation.ts` | When level 1 is reached only within the tolerance, the entry cell says how far the wick turned short of level 1. |

## Why
- The stop is fixed, so the risk does not grow with the move. The risk equals the TP1 distance at the entry, so CRV at the entry is 1 and SIG-29 does not fire only because price went on.
- Divergence and harmonic D are measured on the candle that first reaches level 1 (`divergenceOf` up to that candle, `harmonicD` with that wick as D). A simpler rule (always C) would give a different stop than the rule book when divergence holds.
- Rejected: change `harmonicTrade` for all harmonics. The other formations are a separate step.

## Verification
- New tests (`@FRM-05`, `formation-abcd-lib.spec.ts`) were red on the old code: entry 150 instead of 144 (D wick 150, level 1 144), entry 143 instead of 144 (tolerance case), missing Z-ABCD-07.
- After the change: 71 passed in the file. The review found a rounding mismatch at the tolerance limit (loop and `reached` used different formulas), a hard-coded unit in the new text and no test for the divergence branch. All three are fixed.
- Changed expectations in existing tests: Z-ABCD-05 levels lost `-0.382` (3 places); the drawing list gains Z-ABCD-07 and Z-ABCD-08 after Z-ABCD-05.

## Open points
- [x] GAR, BAT, BUT and CRB still move entry and stop with D. Separate step. (done: PR 580, 651)
