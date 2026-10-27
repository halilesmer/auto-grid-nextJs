---
date: 2026-10-27
author: Claude
type: decision
status: open
pr: []
features: [FRM-03]
areas: [frontend]
---

# Formation detection: trend (step E3)

## Request
Add the trend (TRD) to the formation library: one check per measurable rule ID, the turning points, impulse and correction, the trend per timeframe, the trend lines and the drawings Z-TRD-01 to Z-TRD-08.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/trd.ts` | Building blocks: one pass over the candles (turning points, 75 % filter, trend change, impulse start), trend lines, line scan |
| `frontend_nextjs/src/lib/formation/trdChecks.ts` | `analyzeTrd` (trend of each loaded timeframe), `checkTrdCandidate` (one fractal as turning point), checks per ID, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `TRD_PARAMS`: all TRD numbers in one place |
| `frontend_nextjs/src/lib/formation/types.ts` | `Drawing.side`: trend direction of a drawing (green or red) |
| `frontend_nextjs/e2e/mocked/formation-trd-lib.spec.ts` | Hand-calculated cases, one coverage test, tag `@FRM-03` |
| `frontend_nextjs/e2e/fixtures/formation/trd-up-d1-01.json`, `trd-line-d1-01.json` | 136 and 102 real D1 candles |

## Why
- The pass is causal. At candle k, only candles up to k flow in. A fractal is a turning point only after 2 closed candles on its right.
- Same-side fractals: only the most extreme one stays in the trend path.
- A correction is drawn if its length is at least 0.75 of the reference. The reference is the smallest drawn correction since the last trend change. The first correction after a change has no reference and is drawn.
- A trend change needs 2 closes in a row beyond the last turning point of the opposite side. The change counts from the second close.
- A state means "the condition holds" for event rules (TRD-05, TRD-08, TRD-18, TRD-19, TRD-43). Point rules (TRD-01 to TRD-09) check the chosen turning point, otherwise the newest fractal that was drawn or rejected as a small correction.
- TRD-14 and TRD-26 are display rules and have no check. TRD-25 and TRD-29 are always `unmeasurable`.
- A trend line needs two rising lows (falling highs) and, after the second anchor, one close beyond the extreme before it. The candles right after the anchor are not a new touch.
- Mirror symmetry is tested: an uptrend and its mirror image give the same states.

## Choices without a rule source
- TRD-23 and TRD-24 "from 2 in a row": the newer of the last 2 corrections (impulses) is shorter.
- TRD-21 levels 0.382 and 0.272 stand in `TRD_PARAMS` until the FIB step delivers them. The extension is measured from the old extreme.
- TRD-48: at least 8 lower-timeframe candles count, at most 3 do not count. Between them the rule is `unmeasurable`.
- TRD-27, TRD-31 to TRD-33 need the side of the trade (`options.side`) and, for the count, `options.reasons`. Without them they are `unmeasurable`. A rule that does not apply to the trade (counter-trend rule for a with-trend trade) is `met`.
- TRD-36: a spike candle (FRZ-16, H4 only) is replaced by the most extreme wick end of its two direct neighbours.
- TRD-30: any close beyond the newest extreme in the last 50 candles counts as a running impulse.
- TRD-47 is also checked mirrored for a change to up.
- A second, weaker fractal on the same side behind a rejected correction is not a correction of its own.
- An outside candle is a high and a low fractal at once. Only the side that alternates with the last turning point counts.
- At a trend change, the legs from the reference point on swap their kind (impulse and correction), and the reference correction starts new.

## Open points
- The broker has no H4 candles for the H4 test case of the plan (EURUSD, 16 September to 2 October 2025). The query returned 18 candles from 3 October. That fixture is not part of this step.
- On real D1 candles the path has finer swings than the drawings in the test list. The EURCAD D1 case matches the six expected states, but the lines anchor on the later lows of 19 and 26 September, not on the lows of 31 July and 2 September. Reason: the reference is the smallest drawn correction, and small early corrections let small swings pass.
- The USDCHF D1 case does not match the expectation of the test list (TRD-35 and TRD-42 met). With the broker data, the last low is lower than the earlier lows, so the lows do not rise. The test list is not confirmed. The case checks only the shape of the path.
- Without a test: the lower-timeframe side of the close time in TRD-28. A change of the own side turns a test red.

## Verification
- `scripts/features/run.sh FRM-03`: all tests passed (see the run in the PR).
- Mutations: ten changes to numbers and comparisons each turned at least one test red (75 % filter, number of closes, line tolerance, 50 candles, "similar" range, gap start, number of reasons, lower-timeframe counts, first-touch rule, change counter). The close time of the lower timeframe in TRD-28 stays green, see open points.
- `npm run lint` and `npx tsc --noEmit`: no output.
