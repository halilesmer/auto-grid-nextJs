---
date: 2026-11-26
author: Claude
type: decision
status: closed
features: [ANA-29]
areas: [frontend]
---

# After a split, the first counter move is measured against AB

## Request
The long-leg split (see `2026-11-26-trend-long-leg-split.md`) puts A, B and C on the red line when C comes. The first counter move after C was then measured by the base rule `wave382Rule` against the last leg, BC. BC is short, so the limit (38.2 % of BC) was very small. The ABCD of the split gave way to a small triple within a few hours in 5 of 5 periods. Halil's drawing of 23 to 25 Nov fell off the screen after 13 closes.

## Decision
1126-A13.1, option 2 (Halil, 26 Nov 2026): in the triple that the split built, with C still the last point of the line, the counter move from C is measured as 38.2 % of max(BC, AB). Since C is the end of a leg inside AB (depth 0.382 to 0.728), AB is the longer leg and the limit is 38.2 % of AB.
The rule ends when C is extended (a new extreme on the same side) or a new point comes. Later counter moves are measured as before.

## Change
- `trdSplit.ts` (`legSplitRule`): trigger 1 stores the key of C (`idx`, `side`) and the length of AB. A later counter fractal that the base rule accepts without a cut (`edit.cut === 0`) is rejected (`null`) while C is the last point and the move from C is smaller than `TRD_PARAMS.fiboMinCorrection × AB`.
- The rule returns `null` at once. If it went on, trigger 1 would attach the same fractal as a new point.
- Trigger 2 (fallback) does not mark its triple. The inner run (rule `welle`, measure off) is not affected. The rule reads only candles up to k, so nothing looks ahead.
- `trdZug.ts`, `abcdChecks.ts`, settings and UI are unchanged.

## Result
Default setting, `buildTrend('H1', …)`:

| | Points before | Points now | Trend changes before | now |
|---|---|---|---|---|
| XAUUSD, split | 221 | 219 | 43 | 43 |
| EURUSD, split | 256 | 254 | 44 | 43 |
| XAUUSD, off | 203 | 203 | 43 | 43 |
| EURUSD, off | 181 | 181 | 33 | 33 |

- XAUUSD: 4496.77 and 4520.40 (29 Dec) are no longer points. The line there is 4525.94, 4448.49, 4549.88, 4274.05, 4402.30. The trend change down with ref 4448.49 comes at 29 Dec 13:00 instead of 08:00.
- XAUUSD, 24 Nov 18:00: the last three points are 3886.69, 3502.81, 3689.66 (3607.51 is no longer added).
- EURUSD: 1.09798 and 1.09308 are no longer points. The change up at 25 Nov 19:00 is gone.
- The 5 XAUUSD and 7 EURUSD splits keep their points at the candle of the trigger.
- All formation lib tests pass (the golden fixtures did not change).

## Tests
`e2e/mocked/trend-long-leg-lib.spec.ts` (`@ANA-29`): the numbers above, the two prices tests, a positive control (the first counter move after C that enters the line is at least 38.2 % of AB), and the no-look-ahead test. The changed tests failed before the change.
