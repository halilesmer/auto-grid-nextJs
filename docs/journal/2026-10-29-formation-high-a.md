---
date: 2026-10-29
author: Codex, reviewed by Claude
type: fix
status: done
pr: []
features: [FRM-01, FRM-03, FRM-07, FRM-12, FRM-13, FRM-14, FRM-16]
areas: [frontend, tests]
---

# Correct formation limits and tolerances

## Request

| Item | Request |
|---|---|
| 9, 19, 20, 21, 27, 33 | Correct the limits and add boundary tests for both trade directions. |
| Delivery | Keep the changes local. Do not commit or push. |

## Cause

| IDs | Cause |
|---|---|
| TRD-22, TRD-39, ENC-07 | The upper limit was 1.333 instead of 1.33. |
| BUT-12, CRB-12, CYP-09 | A distance allowance accepted prices outside a zone. |
| GAR-03 | Six initial letters selected the Forex pip size without a currency check. |
| BUT-02/04/07/08, CRB-02/04/06/08, CYP-03/04 | A shared pip allowance accepted prices that missed a level. |
| ENC-04 | The touch count used an ATR allowance. |
| SIG-34 | A positive-span condition rejected the zero boundary. |

## Solution

| Files | Change |
|---|---|
| `params.ts` | Use 1.33. Remove the unused zone and channel allowances. |
| `butChecks.ts`, `crbChecks.ts`, `cypChecks.ts` | Require containment for the zone checks. Compare exact levels in price units. |
| `xabcd.ts` | Require two known currency codes before selection of the Forex pip size. |
| `lineChannel.ts`, `encChecks.ts`, `keiChecks.ts` | Remove ATR inputs from the channel measurement. Keep the floating-point slack for both line types. Keep the wedge calculation unchanged. |
| `indicators.ts` | Apply the comparison without a positive-span condition. |
| `formation-boundaries-lib.spec.ts` | Test the zone edges, symbol classes, exact levels and the retained CYP-07 allowance. |
| `formation-base-lib.spec.ts`, `formation-trd-lib.spec.ts`, `formation-enc-lib.spec.ts` | Test zero, ratio and line boundaries. |
| `formation-but-lib.spec.ts`, `formation-crb-lib.spec.ts`, `formation-cyp-lib.spec.ts`, `formation-enc-lib.spec.ts` | Correct expectations that accepted a missed level or line. Keep the candle data unchanged. |
| `formation-page.spec.ts` | Give the mocked zone the symbol of the candle fixture (EURUSD). The default zone symbol is an oil symbol. With the new pip rule, its pip size did not fit the EURUSD candles, and the Bat became valid. |

## Why

Price comparisons avoid loss of exact contact through division. A new test found this problem at 106.42.
The reported ratios remain available as check values.

The zone checks keep the projected D price. This change corrects containment only.
The current symbol context has no instrument metadata. Known currency codes provide a narrow fallback.
Unknown codes use the existing other-symbol pip size. Metal prefixes keep their existing sizes.

ENC uses no touch allowance. Its copy remains parallel by construction.
The floating-point slack (1e-9 relative) stays. It is far below one price point, so it is not a TRD-40 allowance. Without it, the anchor candle of the copy can lose its own touch through a rounding error.
The four real ENC series change from valid to invalid only because of the removed ATR allowance. A test run with and without the slack gave the same results.
The TDF parallelism allowance remains unchanged. CYP-07 retains its 1-pip allowance.
After 20 zero-span candles, a zero-span candle satisfies SIG-34 because both sides of the comparison are zero.

## Verification

| Check | Result |
|---|---|
| Boundary tests before each fix | Each defect produced failed assertions before its correction. |
| `npx tsc --noEmit` | Exit 0. |
| `npm run lint` | Exit 0. |
| `E2E_LIVE=0 npx playwright test --config=../research/bora/codex/lib.config.ts --workers=4` | Exit 0. 976 tests passed. |
| Diff privacy check | Exit 0. Clean, including new files through a temporary Git index. |
| Scope review | No UI, worker, version, catalog or candle-fixture changes. No live tests or network calls. |

## Lessons

Do not transfer a tolerance between IDs without a stated allowance.
Keep the line shape test separate from its touch count.
