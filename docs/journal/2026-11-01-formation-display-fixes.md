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
- A review of the open findings of the full formation check (2026-11-01) found four where the page shows something other than it measures.
- The user decided on 2026-11-01 to start with these four. This entry covers three of them (PR 1): wrong numbers in rule texts, "near" instead of "inside a zone", and the `fibExt` drawing with three anchors.
- The fourth one (a valid Deep Crab shows `CRB-07` as a red exclusion) follows in PR 2. It needs a design first.
- The verdict of the formation was right in every case. Only the text or the drawing was wrong.

## Cause
- **Wrong numbers:** `ruleTexts.ts` said 0.382 for `GAR-04` and 0.45 for `BAT-05`. The code measures 0.618 and 0.5 (`GAR_PARAMS.cLevel`, `BAT_PARAMS.bLevel`). `CDT-06` said "H1 and N follow in order". The code measures the trend direction on the approach to H2 (`cdt.ts`, `trendDirAt`).
- **"Near" instead of "inside":** `BUT-12`, `CRB-12` and `CYP-09` measure with distance 0. Their text said "near". PR #239 changed the measurement and not the text.
- **Z-BUT-04 at the wrong price:** `drawingLayout.ts` treated `fibExt` like `fib`. It used the first two anchors only. `Z-BUT-04` has the anchors A, B, C and level 1. The line was at A and not at the projection from C. The price axis (`drawingPriceRange`) had the same fault.

## Solution
| File | Change |
|---|---|
| `lib/formation/ruleTexts.ts` | Texts for `GAR-04`, `BAT-05`, `CDT-06`, `CYP-09` corrected. New text `ZONE_D_IN` for `BUT-12` and `CRB-12`. |
| `lib/formation/drawingLayout.ts` | New `fibLevelPrice`. With a third anchor (`fibExt` only) the price is `C + level × (B − A)` and the line starts at C. `primsOf` and `drawingPriceRange` use it. |
| `e2e/mocked/formation-page-lib.spec.ts` | Eight new tests (FRM-19, FRM-20). |
| `docs/features/features.yaml` | FRM-19 and FRM-20 name the new tests and the expected result. |

## Why
- `ZONE_D` stays for `GAR-10` and `BAT-11`. These two still measure with a distance of `zoneAtr × ATR`. The rule book says "inside". Their text changes to `ZONE_D_IN` when the measurement changes.
- Only `fibExt` takes the third anchor. A plain `fib` with three anchors keeps the old formula.
- The rule book gives the formula for `Z-BUT-04` ("A → B, from C") and for `Z-T618-04` (same projection). It does not give a formula for `Z-TDF-07`.

## Verification
- Five of the eight new tests failed before the change: the three-anchor line, the price axis, and the three text tests. Command: `playwright test` with a local config for `formation-*-lib.spec.ts`. Result before: 5 failed, 12 passed.
- After the change: 1321 formation lib tests passed, 0 failed. `tsc --noEmit` and `eslint` on the changed files: exit 0.
- `update_checklist.py --check`: `features.yaml ok (200 Features)`.
- The Codex scan and the review found two test gaps (a plain `fib` with three anchors, a missing pixel value of C). Both have a test now.

## Open points
- [ ] `Z-TDF-07` (inverse Fibonacci, levels 1.618 and 2.0, anchors impulse start, H1, pullback low) now uses the projection from the pullback low. The rule book does not say that this is the intended formula. The old drawing gave prices below H1, which cannot be a target. The page does not show TDF, so nothing visible changed. Check the formula before TDF goes on the page.
- [ ] The zone checks `GAR-10`, `BAT-11`, `BUT-12`, `CRB-12` measure at the target price of D, not at the real D. `CYP-09` measures at the entry level. The rule book says "D lies in a zone". For a D that overshoots the target, the text can be wrong. The earlier entry `2026-10-28-formation-but-crb.md` (BU-4) names the same point. The user decides: measure at the real D, or name the target price in the text.
- [ ] `GAR-10` and `BAT-11` measure with `zoneAtr × ATR` distance, the rule book says "inside". When this changes, switch their text to `ZONE_D_IN`.
- [ ] Deep Crab display (PR 2): a new field `inactive` on the check, a neutral row symbol and a legend line. The user approves the design first.

## Lessons
- A change of a measurement needs a change of the matching text in the same PR. PR #239 changed the zone distance and left "near" in `ruleTexts.ts`.
