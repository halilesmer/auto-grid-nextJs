---
date: 2026-11-16
author: Claude
type: feature
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD re-entry: two targets (nearest zone and last low or high zone)

## Request
Decision by Halil, 2026-11-16: the re-entry section shows two targets. This closes the open point "nearest vs last" in `2026-11-15-abcd-reentry.md`. Display only; no order. No chart drawing, no split, no result boxes, no status walk.

## Solution
| File | Change |
|---|---|
| `lib/formation/reentry.ts` | `reentryOf` takes `entryIdx` (entry candle of the first trade) and returns `target2` next to `target`. |
| `lib/formation/types.ts`, `abcdChecks.ts` | `Trade.reentry.target2: number \| null`; `target` stays target 1. |
| `components/formation/FormationTrade.tsx`, `i18n/messages/formation.ts`, `hints.ts` | With `target2`: two cells "Hedef 1" and "Hedef 2" and two ratio lines (the first with a bar, the second smaller, no bar); own footer text. Without `target2`: the old view, unchanged. tr, en, de, each new field with a hint. |

## Rules
- Target 1 = near edge of the nearest opposing zone from the re-entry price (as before).
- Target 2 = "last low zone" (sell) or "last high zone" (buy): find the most extreme price from the entry candle of the first trade to the re-entry touch candle (both included; sell: lowest low, buy: highest high). Take the opposing zones that this candle touches. Their near edge (sell: top, buy: bottom) is the target; the gain from the entry must be above 0.
- `target2 = null` when it is the same edge as target 1 (same zone), when no zone touches the extreme candle, or when there is no target 1.
- `earlyReversal.ts` is unchanged.

## Assumptions
- If several opposing zones touch the extreme candle, the near edge farthest from the entry is used.
- "Touches" is the existing `touches` test (the extreme candle overlaps the zone); the wick does not have to end inside the zone.
- Both ends of the range are included: the entry candle and the touch candle.

## Verification
- Library tests (sell and buy mirror, `formation-abcd-reentry.spec.ts`, tagged FRM-05 and FRM-39): near zone plus deep zone gives two targets; only the deep zone gives one target and `target2` null; a zone only in between gives one target; extreme in the same zone as target 1 gives null; several zones at the extreme take the farthest; no zone gives both null. Written first and seen red (12 failures), then green.
- Block tests (`formation-trade.spec.ts`): two cells, two ratio lines (one bar), own footer, 375 px without overflow; the one-target view and its tests are unchanged.
- No real fixture has two targets. The two-target block test uses the fixture `crb-form-h4-01` with the high of the touch candle (index 201) raised to 101.5, so that it reaches both resistance zones (synthetic data).

## Open points
- [ ] Not checked on a live chart.
