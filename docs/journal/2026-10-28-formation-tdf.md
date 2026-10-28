---
date: 2026-10-28
author: Claude
type: decision
status: open
pr: []
features: [FRM-11]
areas: [frontend]
---

# Formation detection: trend continuation (step E11)

## Request
Add the trend continuation patterns (TDF) to the formation library: flag, rising (falling) triangle, bowl with handle, and consolidation box, in both directions. One check per rule ID, the points of each sub-form from candles, the activation (a body close beyond the edge of the pause), and the drawings Z-TDF-01a to Z-TDF-10.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/tdf.ts` | Shared blocks: impulse (H1, mast start S, previous peak), depth as a part of the mast, extreme wick of the pause, a straight line through two points, first body close beyond an edge, touch of a zone, touches counted in turn |
| `frontend_nextjs/src/lib/formation/tdfForms.ts` | Candidates of the four sub-forms from finished fractals |
| `frontend_nextjs/src/lib/formation/tdfChecks.ts` | `analyzeTdf`, `checkTdfCandidate`, checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `TDF_PARAMS`; every number refers to FIB, OBO, ABCD or LIB where the rule book reuses a number |
| `frontend_nextjs/e2e/mocked/formation-tdf-lib.spec.ts` | Hand-calculated cases, coverage test, mirror cases, delimitation, no look into the future, real candles, tag `@FRM-11` |
| `frontend_nextjs/e2e/fixtures/formation/tdf-*.json` | 9 files of real H4 candles |

The code reuses `trendDirUpTo` (`f2618.ts`), `fractalDone` (`xabcd.ts`), `peaksOf`, `innerExtreme`, `necklineAt`, `closesInRowBeyond` (`obo.ts`), `nearEdge` (`cdt.ts`), `zoneGeometry` and the wide-candle flag. FRZ, TRD, FIB, SIG, ABCD, CDT, GAR, BAT, 2618, LIB and OBO keep their behaviour.

## Why
- Everything is causal. H1, S and all points are finished fractals. A pattern is forming until a body close breaks its edge.
- The edge: for the flag it is the line through H1 and the second high F1 (a falling line). For the triangle, the bowl and the box it is the top of the zone of H1. A wick alone never breaks it.
- The four sub-forms share one logic (rule book: "same logic, other name"). Each sub-form has its own candidate; `analyzeTdf` returns the best candidate of each sub-form and a best one overall.
- Flag against triangle: F1 lies below the near edge of the zone of H1 (flag); H2 reaches it (triangle). The checks 11 and 16 enforce this for own points.
- Mirror cases (sell) run through the same code; the tests compare the states of a series and its mirror.

## Choices without a rule source
- TDF-19 and TDF-26 are entry rules (what the trader does inside the pattern), not facts about candles: always "not measurable". TDF-04 measures the close.
- TDF-10 has no minimum size (rule book E-9 a). It is met when a mast start exists; the value is the mast length.
- The box uses the top of the zone of H1 as its upper edge, counts H1 as the first touch at the top, and takes the zone of the first low after H1 as the lower zone. A close beyond that zone before the break is the counter-trend break (TDF-25).
- The bowl needs a finished fractal as its low. The depth is measured at the lowest wick of the pause. The handle is a low after a high after the bowl; it must stay above the 0.5 level of the fib from H1 to the bowl low.
- TDF-09: a tested zone is a zone with at least one test (including flipped zones) between the break close and the target, not counting the zone of H1.
- H1 is searched among the last five peaks, because a box has several tops after the impulse.
- `Z-TDF-01` is split in `Z-TDF-01a` (upper line) and `Z-TDF-01b` (copy at the first low). `Z-TDF-10` also shows the box height.

## Open points
- The real candles are scan results from the broker (13 symbols, H4, 2025-09-22 to 2026-04-01: 24 valid states, 18 of them bowls). The examples in the rule book have no usable date or lie before the H4 coverage. The mapping stays in the local test list.
- A bowl is easy to meet: the rule book gives no minimum length, so a pause of two candles with a turn between 0.236 and 0.382 counts. A minimum length is a decision for the project owner.
- A triangle and a bowl (or a box) can read the same pause. Both are returned; the order is flag, triangle, bowl, box.
- TDF-17 (rising lows) is only a bonus (rule book E-1 a), so a triangle with no low after H2 and a close above the zone is valid. The flag stays forming without its second low, because its two waves are a required rule.
- Own points (not found by `analyzeTdf`) are checked for fractals only at H1, H2, C1, F1, C2 and the bowl low; prices of other points are taken as given.
- The handle (TDF-23) and the checks 06, 15, 20, 25 have no real case. They are covered by hand-made series only.

## Verification
- `scripts/features/run.sh FRM-11`: 74 tests passed.
- `scripts/features/run.sh FRM`: 630 tests passed.
- `npm run lint` and `npx tsc --noEmit`: no output.
