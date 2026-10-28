---
date: 2026-10-28
author: Claude
type: decision
status: open
pr: []
features: [FRM-15, FRM-16, FRM-17]
areas: [frontend]
---

# Formation detection: Trend-618, Ending Channel and Reversal Wedge (step E14)

## Request
Add the last three pattern families of the formation library: Trend-618 (T618, 9 rule IDs), Ending Channel (ENC, 7 rule IDs) and Reversal Wedge (KEI, 9 rule IDs). One check per rule ID in both directions, the turning points from candles, and the drawings Z-T618-01 to Z-T618-04, Z-ENC-01 to Z-ENC-03 and Z-KEI-01 to Z-KEI-03.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/lineChannel.ts` | Shared line blocks: shrink test, leg lengths, the five-point candidate, line and activation, alternating touch count |
| `frontend_nextjs/src/lib/formation/t618.ts` | Line touches before the break and the return to level 0.618 after the impulse end |
| `frontend_nextjs/src/lib/formation/t618Checks.ts` | `analyzeT618`, `checkT618Candidate`, checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/enc.ts` | Measures that ENC and KEI share (trend at the window end, lower time frame, trend change after the activation, narrowing) and the search over the candidates |
| `frontend_nextjs/src/lib/formation/encChecks.ts`, `keiChecks.ts` | `analyzeEnc`, `checkEncCandidate`, `analyzeKei`, `checkKeiCandidate`, checks per ID, verdict, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `T618_PARAMS`, `LINE_CHANNEL_PARAMS`, `ENC_PARAMS`, `KEI_PARAMS`; almost every number refers to FIB, TRD, TDF or 2618 |
| `frontend_nextjs/e2e/fixtures/formation-lines.ts` | Helpers shared by the three specs |
| `frontend_nextjs/e2e/mocked/formation-t618-lib.spec.ts`, `formation-enc-lib.spec.ts`, `formation-kei-lib.spec.ts` | Hand-calculated cases, coverage test, mirror case, delimitation, no look into the future, real candles, tags `@FRM-15`, `@FRM-16`, `@FRM-17` |
| `frontend_nextjs/e2e/fixtures/formation/t618-*.json`, `enc-*.json`, `kei-*.json` | 23 files of real H4 candles |
| `docs/features/features.yaml` | New features FRM-15, FRM-16 and FRM-17 |

The existing patterns keep their behaviour. No UI.

## Why
- All three patterns are line patterns, not XABCD patterns. They use the trend pull (turning points, impulse and correction lengths, trend change) and straight lines through turning points, so they reuse `buildTrend`, the fractal zones, the Fibonacci legs and the signal blocks. No existing function changed.
- ENC and KEI share one candidate shape: five consecutive turning points. The two patterns differ only in the second line: ENC copies the trend line in parallel to the outermost extreme, KEI draws a line through the two extremes. So the shared code measures both and each pattern keeps its own rule list and verdict.
- The second low is a real test. The trend line runs through the starts of the last two impulses (first and second low), so the third low must reach it to count as the second touch at the bottom. Without this, the touch rule would be true by construction.

## Choices without a rule source
- **T6-1** The core rules are required, the filters are bonus. All IDs have the status "secondary" (only from secondary material), T618-03 is an assumption.
- **T6-2** P is a turning point of the trend pull. The search takes the last four turning points as P and every running extreme since P as I (newest first), as 2618 does for the impulse end.
- **T6-3** The line anchors are the two turning points of the opposite side directly before P (the last and the third-last point before P). They are wick tips; a spike replacement as in the trend line rule is not applied.
- **T6-4** The impulses of T618-01 are the legs that end at a P-side turning point up to P. Two in a row, each shorter than the one before (TRD-24 measure).
- **T6-5** T618-03 counts the two anchors plus later touches until the break. It is unmet when a close lies beyond the line before P, because then the line does not hold as support or resistance.
- **T6-6** T618-05 is met by the first trend change in trade direction after P. It does not have to come after the break.
- **T6-7** T618-06 needs the break bar at or before I and a finished fractal at I; the correction has begun when the fractal is finished.
- **T6-8** T618-08 uses the tie variant (equal or weaker wave) between the previous turning point on the P side and P. T618-09 is met when neither the touch candle nor the one before it is a wide candle against the trade direction.
- **T6-9** The verdict is "invalid" when T618-01, -02 or -03 is unmet. It is "forming" when the break, the trend change, the finished fractal at I or the touch is missing.
- **LN-1** The count of touches starts at the impulse end and is alternating (top, bottom, top, bottom). The trend line runs through the first and the second low; the third low is the second touch at the bottom.
- **LN-2** The touches on the ENC copy may miss it by 0.5 × ATR(14) (the number of the parallel rule in the continuation family). Touches on the trend line and on the KEI second line use no tolerance, except a rounding margin.
- **LN-3** ENC-01 compares the trend of the pattern time frame at the last bar before the activation with the trend of the next lower loaded time frame at the close of that bar. A counter trend in the lower time frame is a flag, not an ENC. Without a lower time frame the state is "not measurable". KEI-01 uses only the pattern time frame.
- **LN-4** KEI-04 compares the vertical distance of the lines at the bar of the last touch with the distance at the impulse end; it must be smaller. No minimum narrowing, because the rule names none.
- **LN-5** KEI-07 is met with at least three touches at the top (the two of the count plus one). It is a bonus rule, as the rule book decides.
- **LN-6** The activation is the first close beyond the trend line after the impulse end. A trend change counts when it comes at or after the activation.
- **LN-7** ENC-07 compares the last correction with the one before it (ratio 0.75 to 1.333). The corrections are the legs on the opposite side before the activation.
- **LN-8** Z-KEI-02 draws the Fibonacci on the last big leg of the pattern time frame (from the opposite-side point before the impulse end to the outermost extreme). The rule book does not name the start and talks about a higher time frame. Z-KEI-03 draws the stop zone at the second extreme and the first target zone at the first low.
- **LN-9** The verdict is "invalid" when the form rules (ENC-01 to ENC-03, KEI-01 to KEI-04) are unmet. Without an activation it is "forming". With an activation and unmet touches (ENC-04, KEI-05) it is "invalid".

## Test cases
- Hand-calculated series with 8 candles per leg after 40 flat candles. Each measurable rule has a met and an unmet case, and the mirror case (buy) has the same states. The series lie on lines with simple numbers (1.875 per candle); the notes in each spec give the line values at the touch points.
- Delimitation: T618 against 2618 (same return to 0.618, but no double top: 2618 is not valid, T618 is), ENC against KEI (parallel lines against converging lines) and KEI against a triangle with a flat second line (KEI-03 unmet). ENC-01 is unmet when a lower time frame trends against the channel.
- Real candles: the scan of 12 symbols on H4 (2025-10-03 to 2026-03-31) with about 810 candles each. Every candle from the 150th was a test time. 23 fixtures hold 200 candles before and 50 after the test time. They are measured finds, not course examples (the secondary material has no example with a symbol and a date). In the scan the three patterns gave 43 (T618), 65 (ENC) and 37 (KEI) different valid finds.

## Open points
- The rule book names no minimum size. Many real finds are small and fast (the points lie within one or two days on H4). A size filter needs a decision of the project owner.
- ENC-01 is "not measurable" on every real fixture because only H4 candles are loaded; it is covered by hand-made series with H1 candles. No real case with D1 or H1 is loaded.
- The ENC copy is anchored on the outermost extreme with a tolerance. A real channel whose second extreme lies beyond the copy by more than the tolerance fails ENC-04; the rule book gives no number for this.
- The Fibonacci of Z-KEI-02 uses the pattern time frame (LN-8). The rule book names a higher time frame.
