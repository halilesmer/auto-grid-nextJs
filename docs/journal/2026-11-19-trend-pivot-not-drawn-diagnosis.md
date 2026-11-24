---
date: 2026-11-19
author: Claude
type: diagnosis
status: open
pr: [619]
features: [FRM-03, FRM-39]
areas: [frontend]
---

# Why the trend model skips a valid C fractal

## Request
Plan 1114-A4. In the probable C measurement (`2026-11-18-probable-c-false-alarm-measurement.md`), `pivotNotDrawn` is the largest false alarm cause: 197 of 386 in K2 (fixed definition). The candle is a valid fractal by the library rule (`probeFractal`), but the trend model does not draw it as a pivot. Find the rule in the code that skips it, and find the effect on the real C leg (later, never, or another point). No change of behavior. Do not run a live scan.

## Cause

### Which trend rule the measurement used
- The measurement creates `new FormationContext(symbol, input, { trend: DEFAULT_TREND_SETTINGS })` (`e2e/live/formation-history.spec.ts:835`). The scan in the app passes the trend settings of the user (`scanRun.ts:24`); without settings the context also uses `DEFAULT_TREND_SETTINGS` (`context.ts:51`).
- `DEFAULT_TREND_SETTINGS.rule` is `welle382` (EWO + Fibo 382) (`params.ts:150-155`). `TRD_PARAMS.trend.rule` is `groesse` (`params.ts:115-118`), but the formations do not use it when the context has settings.
- Each view builds its trend with `buildTrend(tf, bars, wave, view.trend)` (`trdFormation.ts:15`, called from `reasons.ts:74`).

### How a fractal becomes a pivot (`welle382`)
| Code | Rule | File:line |
|---|---|---|
| F1 | Candidate: a 2 + 2 fractal by close (no neighbor closes beyond the wick). A wick beyond the wick does not break it. | `frz.ts:41-54` |
| F2 | The candidate enters the trend model only at the candle that completes it (`doneAt = idx + 2`). | `trd.ts:87-97`, `trd.ts:189` |
| F3 | Outside bar (high and low fractal in one candle): at most one side becomes a pivot; the side that alternates with the last pivot goes first. | `trd.ts:191-195`, `trd.ts:231` |
| F4 | The rule gives an edit or nothing. Without an edit the candidate stays `accepted: false` and the model never tests it again. | `trd.ts:227-232` |
| W1 | `ewo[idx]` is null (fewer than 35 bars): skip. | `trdZug.ts:40` |
| W2 | EWO phase: a high needs EWO > 0 at the fractal candle, a low needs EWO ≤ 0. Else skip. EWO = SMA 5 − SMA 35 of `(high + low) / 2`. | `trdZug.ts:24`, `trdZug.ts:40`, `indicators.ts:33-46` |
| W3 | Same side as the last pivot: the candidate replaces the last pivot only when its wick is further out. Else skip. | `trdZug.ts:42-43` |
| W4 | Other side than the last pivot: the move back from the last pivot must be at least 0.382 of the last leg (wick to wick). Else skip. | `trdZug.ts:57-63` |

The other rules (`groesse`, `welle`, `geruest`, `filter`) are selected in `trdZug.ts:165-171`. Only `geruest` keeps rejected fractals (`open`) for a later decision (`trdZug.ts:103-127`).

### Which rules can cause `pivotNotDrawn`
The measurement marks `pivotNotDrawn` at t+2 (two bars after the C candle) when no bar after the C candle closes beyond C, A and B are still pivots, and candle C is not a pivot (`formation-history.spec.ts:411-415`). From the code:
- W4 cannot fail in the normal case. K1 takes B = last pivot and A = the pivot before it and asks depth ≥ `ABCD_PARAMS.minCorrection` = 0.382 (`params.ts:169`). W4 compares the same prices with the same limit (`TRD_PARAMS.fiboMinCorrection` = 0.382). The result is equal while the pivots at t+2 are the pivots at t.
- W3 cannot fail in the replacement case (`viaReplace`) for the same reason: K1 asks that C is beyond the last pivot.
- Thus `pivotNotDrawn` comes from W2, from W1/F3 (rare), or from a pivot that the model adds between t and t+2. The fractal of candle t−1 completes at t+1, one bar before the fractal of candle t. If candle t−1 has a wick further out on the C side and does not close beyond the wick of candle t, both are fractals (F1). The model draws t−1 at t+1. At t+2, candle t is on the same side and not further out, so W3 skips it.

### Sample
The records hold no bars. Repository fixtures (`e2e/fixtures/formation/*.json`, H4) hold the bars for some record times. A local script (not committed) ran `buildTrend` with `usableTrendSettings(DEFAULT_TREND_SETTINGS)` on the fixture bars: once up to candle C + 1 (the pivots before the decision on C) and once up to C + 2. It then applied the rules above to candle C. Note: in the records `side` is the C leg direction (`legSide`, `formation-history.spec.ts:503`), so a `buy` record has its C on the support side.

`pivotNotDrawn` records per product (K2, fixed definition), and the classified sample:

| Product | `pivotNotDrawn` | of them `viaReplace` | Sample (in fixtures) | W2 | W3 via neighbor |
|---|---|---|---|---|---|
| XAUUSD | 43 | 2 | 2 | 2 | 0 |
| EURUSD | 35 | 4 | 4 | 4 | 0 |
| GBPUSD | 22 | 6 | 15 | 10 | 5 |
| USDJPY | 37 | 2 | 8 | 4 | 4 |
| AUDUSD | 11 | 0 | 0 | – | – |
| NZDCAD | 49 | 0 | 0 | – | – |
| **Total** | 197 | 14 | 29 | 20 | 9 |

All 29 candles are 2 + 2 fractals on the C side in the fixture bars. No sample case is W1, W4 or F3.

Examples (record time = bar time of candle C, side = C leg direction):

| Product | C candle | Side | Rule | Detail | What the model draws next |
|---|---|---|---|---|---|
| XAUUSD | 2025-11-14 12:00 | buy | W2 | low, EWO +53.9 | another low 4 bars later, not further out |
| XAUUSD | 2025-11-14 16:00 | buy | W2 | low, EWO +30.9 | another low 3 bars later, not further out |
| EURUSD | 2025-11-17 20:00 | buy | W2 | low, EWO +35.4e-5 | deeper low 5 bars later |
| EURUSD | 2025-11-28 08:00 | buy | W2 | low, EWO +351e-5 | B is replaced after 9 bars (impulse continues) |
| GBPUSD | 2025-11-20 16:00 | sell | W2 | high, EWO −687e-5 | higher high 18 bars later |
| GBPUSD | 2025-11-24 20:00 | sell | W2 | high, EWO −110e-5 | higher high 5 bars later |
| GBPUSD | 2026-01-02 00:00 | sell | W2 | high, EWO −370e-5 | higher high 13 bars later |
| GBPUSD | 2026-11-10 00:00 | sell | W2 | high, EWO −95.7e-5 | higher high 2 bars later |
| GBPUSD | 2026-07-21 20:00 | buy | W3 | candle 16:00 has the deeper wick, drawn one bar earlier | the 16:00 low stays the pivot |
| GBPUSD | 2026-10-20 20:00 | sell (`viaReplace`) | W3 | candle 16:00 has the higher wick | the 16:00 high stays the pivot |
| USDJPY | 2025-11-25 20:00 | buy | W3 | candle 16:00 has the deeper wick | the 16:00 low stays the pivot |
| USDJPY | 2025-12-04 16:00 | buy (`viaReplace`) | W3 | candle 12:00 has the deeper wick | the 12:00 low stays the pivot |
| USDJPY | 2025-12-11 12:00 | buy | W2 | low, EWO +0.196 | deeper low 1 bar later |
| USDJPY | 2025-12-23 04:00 | buy | W2 | low, EWO +0.909 | not known: the fixture ends 2 bars later |

In all 9 W3 cases the neighbor candle t−1 is still a pivot at t+2.

### Effect on the real C leg
- **Never later on the same candle.** F4: a rejected fractal is never tested again with `welle382`. In the measurement no `pivotNotDrawn` record was born at t+3 to t+12 with the same A, B and C (`lateAfter` is empty for 197 of 197).
- **W3 via neighbor (9 of 29): another point, no delay.** The C is the neighbor candle t−1 with the wick further out. The probable C layer picked candle t, because the fractal rule is by close (F1). The trend model is consistent with "the C is the extreme wick". This is a weak point of the probable C definition, not a defect of the trend model.
- **W2 (20 of 29): delay and another point.** The C candle comes before the EWO zero cross, so the EWO still has the color of the A→B leg. The model waits for a C-side fractal in a matching EWO phase:
  - 14 of 20: a later C-side fractal further out (a deeper correction) becomes C, 1 to 18 bars after the skipped candle.
  - 2 of 20 (XAUUSD): a later C-side fractal that is not further out becomes C, 3 and 4 bars later. Then the drawn C is not the extreme of the correction.
  - 2 of 20 (EURUSD): the EWO does not change color, the A→B leg continues, B is replaced. No AB=CD with this A and B.
  - 2 of 20 (USDJPY): not known (end of fixture).
  - Delay from the skipped candle to the bar where the new C pivot is drawn (C + 2 of the new C), for the 16 cases with a new C: 3 to 20 bars, median 8 bars. Records of one correction share one later C (the GBPUSD records 2025-11-20 to 2025-11-24 are one correction).
- The open option of `2026-11-13-ewo-rule-pivot-one-bar-late.md` (accept the fractal when the EWO has the color of its side at any candle from `idx` to `doneAt`) changes the result of 5 of the 20 W2 cases (EWO has the C-side color at candle t+1 or t+2). In the other 15 the EWO gets the C-side color 3 or more bars after the C candle, or not in the window. Not verified: what the model draws after such a change.

## Verification
- Rules and line numbers: read in `trd.ts`, `trdZug.ts`, `frz.ts`, `params.ts`, `indicators.ts`, `context.ts`, `trdFormation.ts`, `scanRun.ts` at commit `552dbce1`.
- Counts per product: from `summary-<SYMBOL>.json` of the PR 617 runs (local, not committed). The sum is 197, equal to the K2 (fixed) cause count in the measurement journal.
- Sample: `buildTrend`, `fractalIndices` and `wave` of the library, run with Node on the fixture bars. Result: 29 of 29 classified (20 W2, 9 W3).
- Not verified: the fixture bars are equal to the live bars of the measurement. The fixture files do not record their source (`fixture.ts`). The 29 candles are fractals in the fixtures and left fractals in the live run, but no bar-by-bar comparison was made. W2 depends only on the bars (EWO needs 35 bars before C; all sample candles have 40 or more). W3 and the "next C" column also depend on the pivots before the fixture start, so they can differ from the live model.
- Not verified: the distribution of the 168 records outside the fixtures. The sample is not random (mostly November and December 2025, no AUDUSD and NZDCAD).

## Open points
- [x] Decision of the project owner (same as in `2026-11-13-ewo-rule-pivot-one-bar-late.md`): keep W2, or test the EWO color from `idx` to `doneAt`. In this sample it changes 5 of 20 W2 cases. A red test and a measurement over all records come first. (done: decision 1119-A6.1.2, PR 622, see 2026-11-19-ewo-color-window.md)
- [ ] Probable C definition (if the measurement runs again): skip a candle when its left neighbor has a wick further out on the C side. That removes the W3 cases.
- [ ] Classify all 197 records with the live bars (needs a scan; not done because of machine load).

## Uncertain against the source rule book
The coordinator compares with the source. The code does these things, and it is not clear from this work if the rule book asks for them:
- A correction point counts only when the EWO at the fractal candle has the color of its side (W2).
- The fractal rule is by close; a neighbor with a wick further out does not break the fractal (F1).
- A correction point needs a move back of at least 0.382 of the last leg (W4).
- A fractal that is rejected at its completion candle is never drawn later (F4).
- The drawn C can be a later fractal that is not the extreme of the correction (XAUUSD cases).

## Lessons
- In the probable C records `side` is the C leg direction (`legSide`), not the formation side. A `buy` record has its C on the support side. The first run of the script used the wrong side and found "not a fractal" for 20 of 29 candles.
