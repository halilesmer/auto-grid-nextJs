---
date: 2026-11-01
author: Claude
type: fix
status: open
pr: [277, 278]
features: [FRM-19, FRM-20]
areas: [frontend, tests]
---

# Formation page: texts and Z-BUT-04 match the measurement

## Request
- A review of the open findings of the full formation check (2026-11-01) found four where the page shows something other than it measures.
- The user decided on 2026-11-01 to start with these four. This entry covers three of them (PR 1): wrong numbers in rule texts, "near" instead of "inside a zone", and the `fibExt` drawing with three anchors.
- The fourth one (a valid Deep Crab shows `CRB-07` as a red exclusion) is PR 2. It needed a design first. The user chose variant A of the design on 2026-11-01: the rows stay in their group, with a neutral symbol and the mark "does not apply".
- The verdict of the formation was right in every case. Only the text or the drawing was wrong.

## Cause
- **Wrong numbers:** `ruleTexts.ts` said 0.382 for `GAR-04` and 0.45 for `BAT-05`. The code measures 0.618 and 0.5 (`GAR_PARAMS.cLevel`, `BAT_PARAMS.bLevel`). `CDT-06` said "H1 and N follow in order". The code measures the trend direction on the approach to H2 (`cdt.ts`, `trendDirAt`).
- **"Near" instead of "inside":** `BUT-12`, `CRB-12` and `CYP-09` measure with distance 0. Their text said "near". PR #239 changed the measurement and not the text.
- **Z-BUT-04 at the wrong price:** `drawingLayout.ts` treated `fibExt` like `fib`. It used the first two anchors only. `Z-BUT-04` has the anchors A, B, C and level 1. The line was at A and not at the projection from C. The price axis (`drawingPriceRange`) had the same fault.
- **Red marks on a valid Crab:** `crbChecks.ts` always measures the conditions of both variants. A Deep Crab has B ≥ 0.786, so the Crab exclusion `CRB-07` is met. The checklist showed each met exclusion as a red cross. A valid Crab showed `CRB-08` as a red open box, and the required score was 5/6. `CRB-10` and `CRB-11` (the PRZ level of each variant) had the same fault in the bonus score. These conditions do not apply to the other variant.

## Solution
| File | Change |
|---|---|
| `lib/formation/ruleTexts.ts` | Texts for `GAR-04`, `BAT-05`, `CDT-06`, `CYP-09` corrected. New text `ZONE_D_IN` for `BUT-12` and `CRB-12`. |
| `lib/formation/drawingLayout.ts` | New `fibLevelPrice`. With a third anchor (`fibExt` only) the price is `C + level × (B − A)` and the line starts at C. `primsOf` and `drawingPriceRange` use it. |
| `e2e/mocked/formation-page-lib.spec.ts` | Eight new tests (FRM-19, FRM-20). |
| `docs/features/features.yaml` | FRM-19 and FRM-20 name the new tests and the expected result. |
| `lib/formation/types.ts`, `crbChecks.ts` (PR 2) | New optional field `Check.inactive`. `evaluate` sets it for the conditions of the other variant when one variant holds. |
| `components/formation/FormationChecklist.tsx`, `lib/formation/shotData.ts`, `shotImage.ts` (PR 2) | New row state `inactive` with a slash symbol. Inactive rows do not count in the scores or in the blockers of the note. The legend names the symbol only when such a row exists. |
| `i18n/messages/formation.ts`, `hints.ts` (PR 2) | New keys `formation.state.inactive`, `formation.mark.inactive`, `formation.legend.inactive`, `formation.mark.inactive.hint` (tr, en, de). |
| `e2e/mocked/formation-crb-lib.spec.ts`, `formation-page.spec.ts` (PR 2) | Five new lib tests and three new page tests (FRM-19). |

## Why
- `ZONE_D` stays for `GAR-10` and `BAT-11`. These two still measure with a distance of `zoneAtr × ATR`. The rule book says "inside". Their text changes to `ZONE_D_IN` when the measurement changes.
- Only `fibExt` takes the third anchor. A plain `fib` with three anchors keeps the old formula.
- The rule book gives the formula for `Z-BUT-04` ("A → B, from C") and for `Z-T618-04` (same projection). It does not give a formula for `Z-TDF-07`.
- `inactive` is a new field and not a new `CheckState`. Existing tests require `met` for `CRB-07` on a Deep Crab, and the verdict reads the states. The field changes the display only.
- `inactive` follows the variant, not the verdict. A forming Deep Crab and a Crab with another blocker get the same marks, so the note does not name conditions that do not apply.
- Inactive rows keep their drawings. A hover on `CRB-07` still shows where the level is. This does no damage, because the row itself says that the condition does not apply.

## Verification
- Five of the eight new tests failed before the change: the three-anchor line, the price axis, and the three text tests. Command: `playwright test` with a local config for `formation-*-lib.spec.ts`. Result before: 5 failed, 12 passed.
- After the change: 1321 formation lib tests passed, 0 failed. `tsc --noEmit` and `eslint` on the changed files: exit 0.
- `update_checklist.py --check`: `features.yaml ok (200 Features)`.
- The Codex scan and the review found two test gaps (a plain `fib` with three anchors, a missing pixel value of C). Both have a test now.
- PR 2: four of the five new lib tests failed before the change. The fifth test (no variant, no mark) passed before, because it is the negative case. The note test and the tooltip check came from the Codex scan. They failed when the code was temporarily broken: the blockers without the filter, and the tooltip with a different text.
- PR 2 result: `scripts/features/run.sh FRM` (only the tests with an FRM tag) 1132 passed, 0 failed. `tsc --noEmit` and `eslint` on the changed files: exit 0.
- PR 2 screenshots: I took screenshots of a real Deep Crab fixture against the mocked worker, in light and dark theme, at 1400 px and 375 px. The page has no horizontal overflow.

## Open points
- [ ] `Z-TDF-07` (inverse Fibonacci, levels 1.618 and 2.0, anchors impulse start, H1, pullback low) now uses the projection from the pullback low. The rule book does not say that this is the intended formula. The old drawing gave prices below H1, which cannot be a target. The page does not show TDF, so nothing visible changed. Check the formula before TDF goes on the page.
- [ ] The zone checks `GAR-10`, `BAT-11`, `BUT-12`, `CRB-12` measure at the target price of D, not at the real D. `CYP-09` measures at the entry level. The rule book says "D lies in a zone". For a D that overshoots the target, the text can be wrong. The earlier entry `2026-10-28-formation-but-crb.md` (BU-4) names the same point. The user decides: measure at the real D, or name the target price in the text.
- [x] `GAR-10` and `BAT-11` measure with `zoneAtr × ATR` distance, the rule book says "inside". When this changes, switch their text to `ZONE_D_IN`. Done in Package C, PR C-1: distance 0, text `ZONE_D_IN`, `zoneAtr` removed.

## Package C-1: zone timeframe and zone distance
- The zone checks `GAR-10`, `BAT-11`, `BUT-12`, `CRB-12` and `CYP-09` counted fractal zones of every timeframe. The rule book says "the formation timeframe or a higher one". New helper `zoneTfCounts` in `xabcd.ts` keeps a zone only if its timeframe is the formation timeframe or higher. `zonesNear` and `zonesNearOutsideX` use it.
- `GAR-10` and `BAT-11` measure with distance 0, like the other three. They are no longer `unmeasurable` when the ATR is missing. `HARMONIC_PARAMS.zoneAtr` and the text `ZONE_D` had no user left and were deleted.
- Tests in `formation-boundaries-lib.spec.ts`: edge cases (distance 0 and 0.001, buy and sell) for `GAR-10` and `BAT-11`, and five timeframe cases for each of the five checks. Nine of them failed before the change (four edge cases, five "zone only in H1"). `formation-page-lib.spec.ts` checks the `GAR-10` and `BAT-11` texts.
- Test data note: bars with equal open and close make a manipulation zone on H4 (`FRZ-16`), and a rising series makes a fractal of every bar. The new tests use a falling base series and a dip bar with a real body.

## Lessons
- A change of a measurement needs a change of the matching text in the same PR. PR #239 changed the zone distance and left "near" in `ruleTexts.ts`.
- A check that measures two variants needs a display state for the variant that does not apply. A correct verdict does not make the checklist correct.
