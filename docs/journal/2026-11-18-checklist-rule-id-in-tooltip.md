---
date: 2026-11-18
author: Claude
type: feature
status: done
pr: []
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
See the PR description.
