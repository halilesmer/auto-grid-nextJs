---
date: 2026-11-18
author: Claude
type: feature
status: done
pr: [609]
features: [FRM-19]
areas: [frontend, tests]
---

# Checklist rule ID moves into the row tooltip

## Request
The rule of the owner (2026-11-15): the visible UI shows no rule ID. PR 601 cleaned only the trade block. The formation checklist still showed the ID (for example `ABCD-06`) in the right column of each row. On 2026-11-18 the owner approved the design: the ID leaves the row and shows in the row tooltip. Rule texts also name Fibonacci values with the word "Fib".

## Solution

| File | Change |
|---|---|
| `src/components/formation/FormationChecklist.tsx` | The row sits inside a `Tooltip` (side bottom). The right column holds only the measured value. `data-rule-id`, `data-testid`, `data-state` and the hover/focus highlight are the same. |
| `src/i18n/messages/formation.ts` | New key `formation.rule.id.hint`: "Kural: {id}" / "Rule: {id}" / "Regel: {id}". |
| `src/lib/formation/ruleTexts.ts` | "Fib" before Fibonacci levels in 26 rule texts (tr, en, de). |
| `e2e/mocked/formation-page.spec.ts` | New test: no row text holds the rule ID; hover and keyboard focus show the tooltip with the ID. |
| `e2e/mocked/formation-page-lib.spec.ts` | GAR-04 and BAT-05 expect the new texts. |
| `docs/features/features.yaml` | FRM-19 description and test steps. |

## Why
The row tooltip opens on the whole row, so a keyboard user gets the ID too. The badge tooltips (veto, assumption, not active) stay as they are. They open above their badge, the row tooltip opens below the row, so the two do not cover each other.

## Not changed
Percent tolerances ("5 % of AB"), reward-to-risk values, RSI/ATR/candle counts and the name "Level 1" have no "Fib". GAR-08 and BAT-08 name the range 0.382 to 0.728. The value 0.728 looks like a typo (0.768?). The text now says "Fib 0.382 to 0.728", and the value is not verified against `params.ts`.

## Verification
Run `tsc`, lint, FRM-19 (59 tests) and `precheck.sh` (4099 e2e tests, 0 failed). Screenshots: `images/checklist-light.png`, `images/checklist-dark.png`.

## Follow-up: row width regression (fix)

### Defect
PR 609 put the row `div` inside a `Tooltip`. The tooltip wrapper is `inline-flex`. The `div` became a flex item without `w-full`, so it shrank to its content. Rows with a short text were narrower than the list. The value stood next to the text, and the hover background ended in the middle of the row. Before the change, all values were on the right edge.

### Fix
`FormationChecklist.tsx`: the row `div` has `w-full min-w-0`. Tooltip, `data-*` attributes and badge hints are the same.

### Test
`formation-page.spec.ts` (FRM-19): in rows with texts of different length, the row width equals the section width, and the right edge of the value column is on the same x (1 px tolerance). The test failed before the fix (row 41.6 px narrower than the section) and passes after it.

### Lesson
A wrapper element around a layout child changes the layout of the child. When a wrapper is added, check the width of the child with a measurement test, not only with the text content. The screenshots `images/checklist-light.png` and `images/checklist-dark.png` are renewed (mocked data, 1440 px, tooltip open). The app default theme is dark, so the light image needs the stored theme `light` (`grid-robot-theme` in `localStorage`); the `<html>` class was checked for each image.
