---
date: 2026-10-29
author: Claude
type: fix
status: done
features: [FRM-02, FRM-04, FRM-05, FRM-06, FRM-13]
areas: [frontend]
---

# Formation detection: four critical findings fixed

## Request
An external review of the formation detection (49 findings) named four critical ones. The project owner decided to fix these four first.

## Cause
| Finding | Cause |
|---|---|
| FRZ-24 | `buildEnv` called `analyzeFrz` without `fibTargets`. The exception for a Fibonacci target at the middle zone never applied. |
| SIG-05 | The direct-entry branch used only the current RSI. An earlier extreme (SIG-04) did not open it. |
| SIG-12 | `divergenceOf` took the last two record points of the whole history. An old record before a trend change left less than two points. |
| BUT-16, CRB-16, ABCD-20, CDT-13 | The reversal check accepted every `engulfAt` candle after D. It ignored SIG-24, SIG-25 and SIG-26. |

## Solution
| File | Change |
|---|---|
| `reasons.ts` | New `fibTargetsOf` (edges 0.382 and 0.618, extensions of all legs of all loaded time frames). `buildEnv` passes it to `analyzeFrz`. |
| `sigChecks.ts` | SIG-05 is met also when the RSI at the earlier pivot of the side is extreme. |
| `sig.ts` | `divergenceOf` falls back to the records since the trend origin when the whole history has less than two records. |
| `reversal.ts` | New `reversalAt`: engulf structure, strong enclosed candle (SIG-24), strong candles for two-candle engulf (SIG-25), wick at the point (SIG-26). |
| `xabcd.ts`, `abcdChecks.ts`, `cdtChecks.ts` | BUT/CRB, ABCD and CDT use `reversalAt`. |

## Why
- Place (SIG-26) at D: a band of 0.5 × ATR (`ABCD_PARAMS.nearAtr`) around the point, plus fractal zones of the trade side within that distance. The number is an assumption.
- No time limit: the rule book names none. Open point for the project owner.
- Fibonacci target (FRZ-24): edges of the correction zone and the extensions. The choice of levels is an assumption.
- SIG-12: the first plan was to count only pivots since the trend origin. Two real series (`sig-diverg-h4-01`, `-02`) compare the last record with an older one before the origin, and the rule book gives no pair. So the old rule stays. The origin is only the fallback. Open point: which two ends the rule means.
- Test expectations changed: three real series (`sig-diverg-h4-01` twice, `cdt-top-h4-01`) had an engulf of a small candle. SIG-24 excludes it, so ABCD-20 and CDT-13 are now unmet. Synthetic engulf rows got a large enclosed candle.
- `sigChecks.ts` (SIG-05, SIG-28) still uses the structure-only engulf of the lower time frame. Follow-up.
