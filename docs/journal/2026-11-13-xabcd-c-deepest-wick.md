---
date: 2026-11-13
author: Claude
type: decision
status: done
pr: []
features: [FRM-12, FRM-13, FRM-14, FRM-03]
areas: [frontend]
---

# XABCD measures C at the extreme wick after the C-to-D leg is confirmed

## Request

`2026-11-13-xabcd-a-b-deepest-wick.md` moved X, A and B to the extreme wick. C stayed open: the range of C is open up to the last candle. If the shift has no limit, C changes with each new candle. The project owner decided (1113-A17.1) that C moves only after the C-to-D leg is confirmed.

## Decision

Source: project owner, 2026-11-13.

- `shiftC(bars, c, b, cSide, bSide)` in `xabcd.ts` runs last in `shiftBase`, after X, A and B.
- Range: from the candle after the moved B up to and including the pivot candle of C. Candles after the pivot belong to the C-to-D leg and do not count.
- Gate: C moves only if a candle after the pivot closes beyond B (`closesBeyond(bar, b.price, bSide)`, same test as `closedBeyondB`). No such close yet (the formation is forming): C stays on the pivot.
- Only a strictly more extreme wick replaces the pivot. A moved C keeps `pivotIdx`, as X, A and B do.
- Measurements use the moved C: ratios, levels, CYP-07 target, drawings. Structure checks use the pivot of C.

## Why the range ends at the pivot

The first version searched up to the confirming close. It moved C into the start of the C-to-D leg. Three real sell fixtures (`gar-sell-h4-01`, `but-sell-h4-01`, `bat-sell-h4-02`, the only valid sell examples of Gartley, Butterfly and Bat) changed from valid to a buy candidate that is invalid. In `bat-sell-h4-02` C moved one candle later and below A. Project owner decision: range to the pivot of C. With it, no real fixture changes its verdict (1830 formation lib tests green).

X, A and B search up to the next pivot, so they also use candles after their own pivot. C has no next pivot yet, so its range ends at its own pivot. This is narrower than X, A and B on purpose.

## Pivot identity

| Use | Choice |
|---|---|
| D search (`shapeOfX`) | starts at `max(c.idx, pivotIdx)`: a low before the pivot of C is not part of the C-to-D leg |
| `closedBeyondB` (BUT-06, CRB-05) | starts after `max(c.idx, pivotIdx)`, so the range of the shift and of the check are the same |
| CYP-11 `closedBeyondCLimit` | runs to `max(c.idx, pivotIdx)`: the closes up to the pivot of C count |
| Ratios, levels, `divergenceOf` with C, `rsi[c.idx]`, drawings | moved C: measurements |

## Verification

- `e2e/mocked/formation-x-deepest-wick-lib.spec.ts` (FRM-12): `shiftC` with a close beyond B, a deeper wick after the pivot (does not count), without a close (C stays), with equal wicks (C stays), `shiftBase` with `pivotIdx`, D search from the pivot of C. With a `shiftC` that returns C unchanged, the `shiftC` case and the `shiftBase` case are red.
- No real fixture of the formation lib tests changes its verdict.
- A scan series with a moved C is not possible. The trend chooses the highest fractal of a green wave as the pivot, so a higher wick before the pivot of C does not occur there. The cases use built candles and pure functions.
- The GBPUSD H4 Cypher from the outside chart: the repository has only four candles of it. The full series is not in the repository, so CYP-07 after the C shift is not measured here.

## Open points

- [ ] Measure the GBPUSD H4 Cypher (CYP-07) on the full candle series in the browser.
