---
date: 2026-11-10
author: Claude
type: feature
status: done
pr: []
features: [ANA-21, FRM-03]
areas: [frontend, docs]
---

# Trend rule "EWO + Fibo 382" added

## Request

The owner found a trend point that the chart should not draw. With the rule "one point per EWO wave" (`welle`), a dip appeared although it did not retrace 0.382 of the previous leg. He asked for a new, separate trend rule for this. The four existing rules must not change. He also removed "double bottom / double top" from this topic.

## Cause

`welle` looks only at the sign of the EWO. A short EWO phase on the counter side gives one fractal, and the rule draws it. It never checks how deep the correction is. The owner's rule: a healthy trend corrects at least to 0.382 of the impulse (same limit as for AB=CD at point C).

## Solution

| File | Change |
|---|---|
| `lib/formation/params.ts` | New rule `welle382` in `TREND_RULES`; helper `ruleHasNoSize`; constant `TRD_PARAMS.fiboMinCorrection` (= `FIB_PARAMS.retrace[0]`, 0.382) |
| `lib/formation/trdZug.ts` | `wave382Rule`: runs `waveRule`, then drops a counter point that retraces less than 0.382 of the previous leg |
| `lib/formation/trd.ts`, `trdChecks.ts` | The ATR size ratio and the TRD-09 check treat `welle382` like `welle` (no minimum size) |
| `components/chart-workspace/TrendSettingsPanel.tsx`, `formation/FormationAlarmMenu.tsx` | New entry in the rule list; the minimum size control is disabled for this rule |
| `i18n/messages/*` | Name "EWO + Fibo 382" and the hint texts in tr/en/de |

### Decisions

- The old four rules are not changed. The new rule is a separate option. Saved settings stay valid.
- The leg is measured from wick to wick over the pivot prices, as the Fibonacci tool measures from the start of the impulse to its wick.
- The gate works in both directions (up and down).
- A counter point with no previous leg (first leg of the path) is drawn. There is no measure for it.
- The limit 0.382 is a constant, not a setting. Nobody asked for a slider.
- When a shallow counter point is dropped, the impulse goes on to the next higher (lower) extreme in one leg.
- The decision is made when the fractal completes, with candles up to that point only. No look-ahead. Trend change and color (1 or 2 closes) are unchanged.

## Verification

- `formation-trd-lib`: 4 new tests (shallow dip dropped, exactly 0.382 kept and just under dropped, no previous leg, no look-ahead) and all older rule tests pass (111 tests with `analysis-trend-lib`).
- `analysis-trend` e2e: rule list and disabled controls; ANA-21 run: 38 passed.
- `tsc --noEmit` and `npm run lint`: no errors.
- Not verified: a visual check on the owner's chart (the screenshot case).

## Open points

None.
