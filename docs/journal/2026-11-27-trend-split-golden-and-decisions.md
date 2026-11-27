---
date: 2026-11-27
author: Claude
type: decision
status: closed
features: [FRM-08, ANA-29]
areas: [frontend]
---

# Trend split: default setting in the golden record, and two decisions

## Request
Task 1126-A20.4. The long-leg split (rule `welle382`, `legSplitRule`, PR 692) had three open points: the golden record never ran the chart default, the November ABCD was fixed only for the multiple 2.618, and two decisions (1126-A5.1, 1126-A20.3) had no written record. This entry covers all three. No change in `src/`.

## (a) This PR
1. **Golden record with the chart default.** `formation-scan-golden-lib.spec.ts` ran each fixture only with `fixtureTrend(name)` (rule `groesse`, EWO source `hl2`, `legMeasure` off). Now each fixture and time point also runs with `DEFAULT_TREND_SETTINGS` (`welle382`, EWO from the close, `legMeasure` `mult` 2.618). Key: `<name>@<share>#default`.
   - 409 new hashes. No old hash changed (`git diff --numstat`: 409 added, 0 removed).
   - Check before the hashes were written: no fixture threw an error in the default run. Work counters in the default run stay below the plain run for the scan (largest values: 782 measured candidates, 2 854 keys built, 2 full AB=CD measurements, 45 606 trend candles in `trd-ref-h4-ger40@1`). The limits of the page runs (`ABCD_FULL_MAX` 20, `TREND_STEPS_MAX` 200 000) are not near.
   - Duration of the spec (one worker, 118 tests): 28.5 s and 31.7 s before, 39.7 s and 31.9 s after. The change is far from 2×.
   - A hash shows that the result is stable. It does not show that the result is correct.
   - To rewrite the file: `GOLDEN_UPDATE=1 KEY_MAX=75000 EVALUATED_MAX=6000 npx playwright test e2e/mocked/formation-scan-golden-lib.spec.ts --project=mocked --workers=1`. With more than one worker each worker writes the file and the last one wins (the file loses keys). Without `KEY_MAX` and `EVALUATED_MAX` the two limits become 0.
2. **November ABCD with the other two default measures** (`trend-long-leg-lib.spec.ts`, `@ANA-29`). XAUUSD H1, ATR multiple 15 and 80 candles. Both find the hand-drawn ABCD. At the trigger candle the last four points are 3832.42, 3886.69, 3502.81, 3689.66 and the final line ends 4148.52, 3832.42, 3886.69, 3502.81, 3689.66, 3426.69. The trigger time is the same for all three measures: 2026-11-23 18:00 (measured; one candle before, the split does not exist).

## (b) 1126-A5.1 (Halil, 2026-11-26): H4 keeps its own EWO waves
Option 1, no code. The H4 split keeps the EWO waves of H4.

Facts (XAUUSD, November leg):
- The H4 leg is 721.83 points, the leg before is 278.34 points. Ratio 2.59, below the threshold 2.618.
- The H4 EWO stayed red from 10 to 25 November. There is no H4 wave inside.
- The trigger "C comes" does not work on H4, because the EWO does not turn green at C. The split comes only with the fallback trigger, at the new low 3426.69.
- Option 2 (H4 split uses H1 waves) does not change the November example. It changes 23–31 % of the H4 ABCDs shown elsewhere.
- Option 3 (H1 waves and a separate measure for H4, 1.618 or ATR 15) finds the ABCD on H4, but at 2026-11-26 00:00, after D. For a timely result the trigger "C comes" must look at H1 too. That copies the H1 line to H4 and conflicts with rulebook TRD-06 (moves of a lower time frame are not drawn above). A measure per time frame needs a new setting and a design first.

Reason: the ABCD appears on H1 in time.

## (c) 1126-A20.3 (Halil, 2026-11-26): ATR 15 and 80 candles stay the defaults
Option 1. Facts (main with PR 693; scanned range ATR 6–30, candles 20–500):
- The November ABCD is found for ATR 6–27 and for 20–260 candles. It disappears from ATR 28 and from 280 candles.
- Agreement with the 12 splits of the multiple 2.618:
  - ATR 15: 8 of 12, 6 extra splits.
  - 80 candles: 9 of 12, 8 extra splits.
  - Best agreement: ATR 9–10 and 20–60 candles, 10 of 12.
- These two measures use an absolute threshold and do not compare with the leg before. So they split earlier and more often. Example EURUSD, end of November: instead of the clean line of 2.618 (1.10231 → 1.08806 → 1.09922) the line shows seven small points.

Reason: the November ABCD is the only verified example and both defaults find it. The splits of 2.618 are not verified, so to look like them is not a criterion.

## Open
- The H1 line on other symbols for ATR 15 and 80 candles is not verified against hand-drawn examples. Only the XAUUSD November ABCD is.
