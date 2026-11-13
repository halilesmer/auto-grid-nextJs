---
date: 2026-11-13
author: Claude
type: decision
status: done
pr: []
features: [FRM-12, FRM-13, FRM-14, FRM-03]
areas: [frontend]
---

# XABCD measures A and B at the extreme wick of the swing

## Request

`2026-11-13-xabcd-x-deepest-wick.md` moved X to the extreme wick. The same shift appeared at A (9.4 %) and B (10.3 %) of the bases. The project owner decided to move A and B too. C stays open.

## Decision

Source: project owner, 2026-11-13.

- The trend rule does not change. Only `analyzeXabcd` (Gartley, Bat, Butterfly, Crab, Cypher) measures on moved points.
- Order X → A → B. Each point uses the moved position of the point before it.
- A (opposite side of X): from the candle after the moved X up to, not including, the candle of the pivot B. Highest high for a low X.
- B (same side as X): from the candle after the moved A up to, not including, the candle of the pivot C.
- Only a strictly more extreme wick replaces the pivot. C and D do not move. `checkXabcd` (user points) and the ABCD check that builds X from pivots do not move points.
- `extremeWick(bars, point, side, fromIdx, toIdx)` is the shared helper; `deepestWickX` calls it with unchanged behavior.

## Pivot identity

A moved point keeps `pivotIdx` (the candle of the trend pivot). Checks that ask "is this a trend pivot" use `pivotIdxOf(point)`. Checks that measure use `idx` and `price`.

| Use | Choice |
|---|---|
| `impulse` in GAR-01, BAT-01, BUT-01, CRB-01, CYP-01 (`trend.pivots` with `kind === 'impulse'`) | pivot of A: the kind exists only on the pivot |
| GAR-21 `xPos` and `oneStep` (X and A are neighbors in `trend.pivots`) | pivot of X and of A: the pivot list has no moved point (this also repairs the X case of the first change) |
| `fractalDone`, `oneMove`, `alternates`, ratios, levels, `zoneGeometry`, closing checks, drawings | moved point: measurements |
| `divergenceOf` (GAR-14, CRB, BUT with B; CYP-05 with A) | moved point: it measures the EWO range up to the wick |

## Effect on existing tests

Of 1824 formation lib tests, 2 changed because a real fixture has a lower low between pivot B and candle C:

- `but-buy-h4-01`: B moves from 0.93014 (2026-01-12 00:00) to 0.93007 (08:00). B is 0.905 of X → A instead of 0.879, over the exclusion 0.886 (BUT-03). The verdict changes from valid to invalid; BUT-09 changes to unmet. This is the correct result of the rule. The only real buy fixture of the Butterfly is now a negative case.
- `crb-deep-h4-01`: B moves from 1.37039 (2026-03-20 20:00) to 1.37002 (2026-03-23 04:00). States and verdict do not change; only the time of B.

## Verification

- New cases in `e2e/mocked/formation-x-deepest-wick-lib.spec.ts` (FRM-12): A and B on a built series (36 flat candles, X 100, A 125, B 113, C 133; EWO turns one candle after both wicks), CYP-01 and GAR-21 stay met with a moved A, `extremeWick` unit cases. Putting back `a.idx` in CYP-01 or GAR-21 turns the matching test red.

## Open points

- [ ] C and D still use the pivot and the open range to the end of the series. The project owner has not decided on C.
