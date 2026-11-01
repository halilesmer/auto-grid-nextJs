---
date: 2026-11-01
author: Claude
type: fix
status: open
pr: []
features: [FRM-19, FRM-20]
areas: [frontend, tests]
---

# Formation page: texts and Z-BUT-04 match the measurement

## Request
- A review of the 39 open findings of the full formation check (2026-11-01) found four findings where the page shows something other than it measures: 40, N2, 43 and 46.
- The user decided on 2026-11-01 to start with these four. This entry covers findings 40, N2 and 46 (PR 1). Finding 43 follows in PR 2 and needs a design first.
- The verdict of the formation was right in every case. Only the text or the drawing was wrong.

## Cause
- **40:** `ruleTexts.ts` said 0.382 for `GAR-04` and 0.45 for `BAT-05`. The code measures 0.618 and 0.5 (`GAR_PARAMS.cLevel`, `BAT_PARAMS.bLevel`). The rule book says the same. `CDT-06` said "H1 and N follow in order". The code measures the trend direction on the approach to H2 (`cdt.ts`, `trendDirAt`).
- **N2:** `BUT-12`, `CRB-12` and `CYP-09` measure with distance 0 ("inside a zone"). Their text said "near". PR #239 changed the measurement and not the text.
- **46:** `drawingLayout.ts` treated `fibExt` like `fib`. It used the first two anchors only. `Z-BUT-04` has the anchors A, B, C and level 1. The line was at A and not at the projection from C. The price axis (`drawingPriceRange`) had the same fault.

## Solution
| File | Change |
|---|---|
| `lib/formation/ruleTexts.ts` | Texts for `GAR-04`, `BAT-05`, `CDT-06`, `CYP-09` corrected. New text `ZONE_D_IN` for `BUT-12` and `CRB-12`. |
| `lib/formation/drawingLayout.ts` | New `fibLevelPrice`. With a third anchor (`fibExt` only) the price is `C + level × (B − A)` and the line starts at C. `primsOf` and `drawingPriceRange` use it. |
| `e2e/mocked/formation-page-lib.spec.ts` | Six new tests (FRM-19, FRM-20). Five were red before the change. |
| `docs/features/features.yaml` | FRM-19 and FRM-20 name the new tests and the expected result. |

## Why
- `ZONE_D` stays for `GAR-10` and `BAT-11`. These two still measure with a distance of `zoneAtr × ATR` (finding N1, package C). Their text changes to `ZONE_D_IN` when the measurement changes.
- Only `fibExt` takes the third anchor. A plain `fib` with three anchors keeps the old formula.
- The rule book gives the formula for `Z-BUT-04` ("A → B, from C") and for `Z-T618-04` (same projection). It does not give a formula for `Z-TDF-07`.

## Open points
- `Z-TDF-07` (inverse Fibonacci, levels 1.618 and 2.0, anchors impulse start, H1, pullback low) now uses the projection from the pullback low. The rule book does not say that this is the intended formula. The old drawing gave prices below H1, which cannot be a target. The page does not show TDF, so nothing visible changed. Check the formula against the rule book before TDF goes on the page.
- Finding 43 (a valid Deep Crab shows `CRB-07` as a red exclusion) is not in this PR. The plan: a new field `inactive` on the check, a neutral row symbol and a legend line. The design needs the approval of the user first.
