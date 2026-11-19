---
date: 2026-11-19
author: Claude
type: feature
status: done
pr: []
features: [FRM-39]
areas: [frontend]
---

# Harmonic trade block: TP2, state and results

## Request
Plan 1114-A4, design approved by Halil on 2026-11-19 (1119-A8.1.1). The trade block of Gartley, Bat, Butterfly, Crab and Cypher showed only entry, stop and TP1. It now has the same parts as the AB=CD block: TP2, half share, state after the entry, stop at the entry after TP1, and the result box. Layout and texts are the same as in the AB=CD block; there is no new text. Display only; no order.

## Solution
| File | Change |
|---|---|
| `lib/formation/tradeApply.ts` | `harmonicTrade` gives `tp2` (Fib A → D 0.618) and `tp2AtEntry`. `withTrade` takes an optional `run` (freeze candle, Fib start, targets) and sets `trade.status` with `tradeStatusOf`. |
| `lib/formation/garChecks.ts`, `batChecks.ts`, `butChecks.ts`, `crbChecks.ts` | Pass the freeze candle and Fib start A to `withTrade`. |
| `lib/formation/cypChecks.ts` | Same for Cypher, with Fib start C (Fib C → D). The freeze candle is the first candle that touches the entry level. |
| `lib/formation/trade.ts` | `outcomesOf` uses `tp2` when `tp2AtEntry` is missing. |

`FormationTrade.tsx` and the texts did not change: the block already draws TP2, status and result box when `trade.tp2` and `trade.status` exist.

## Rules
- Targets: TP1 Fib 0.382, TP2 Fib 0.618 of the target Fib A → D (Cypher C → D). TP1 first. Two equal halves. After TP1 the stop of the other half moves to the entry and never against the position.
- Entry and stop rules do not change (Butterfly and Crab freeze at the first touch, PR 596; stop at most 1:1).
- `tradeStatusOf` runs from the freeze candle on, with the same rules as AB=CD: close stop, emergency stop on a wick, stop before target in one candle, no target on a candle with a new extreme.
- Results in R: stop −1; TP1 and rest at the entry ½ × r1; TP1 and TP2 ½ × (r1 + r2); the actual fill prices replace the entry values when known (1115-A21.1).
- The large target (thirds), early reversal and re-entry do not exist for harmonic formations.

## Assumptions
- The target runs with the extreme after the freeze candle, as for AB=CD. For Gartley and Bat the fill count uses the moving TP1 and TP2; the CRV and the "at entry" values use the entry level. For Butterfly and Crab the entry is the touch wick, and `tp2AtEntry` uses the D of the target Fib (the same basis as their TP1).
- The "stop moved" line is not drawn on the chart for harmonics; the block shows the moved stop.

## Verification
- Red first: `formation-harmonic-trade.spec.ts` failed 24/24 without the change (TP2 and status missing); green with it. Cypher in `formation-cyp-lib.spec.ts`; block images from `formation-harmonic-trade-ui.spec.ts`.
- Images (dark and light, block fully visible): `docs/journal/images/2026-11-19-harmonic-trade-gartley-{open,tp1,tp12,stopped}-{dark,light}.png`.

## Open points
- [ ] Chart: stop line moving to the entry after TP1 (Z-GAR-07/08 and the others) for harmonics.
- [ ] The state is shown for the selected candidate only (as for AB=CD).
