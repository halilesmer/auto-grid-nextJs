---
date: 2026-10-30
author: Claude
type: feature
status: open
pr: [247]
features: [FRM-25, FRM-21, FRM-23]
areas: [frontend, tests]
---

# Formation page accepts any product

## Request
- Let the user select any product of the account on `/formasyon`, independently of a setup (for example gold or EURUSD).
- Search the formations again each time the user selects a product.

## Solution
| File | Change |
|---|---|
| `FormationSelectors.tsx` | `FormationSymbolSelect` replaces the setup field. It searches the name and the description. |
| `useFormationParams.ts` | New `?symbol=`. A new account removes it. |
| `page.tsx` | Order: `?symbol=`, setup from `?zone=`, first setup. Shows an error if the symbol list fails. |
| `SymbolAutoComplete.tsx` | New `aria-label`, because the bar has no visible label. |
| `ZoneSelect.tsx` | Two exports removed, because only this file uses them now. |

The worker did not change. `GET /market/{id}/rates` accepts any symbol. `useFormationScan` did not change, because its key contains the symbol.

## Why
The setup gave the search only the symbol, so the setup field had no other function on this page.

Old `?zone=` links continue to work and show the same symbol.

A new account removes the product, because symbol names differ between brokers (`XAUUSD`, `XAUUSD.m`).

The field accepts only a name from the list. A wrong `?symbol=` in the address is not checked; it shows the error of `GET /market/{id}/rates`.

## Verification
- `FRM-25`: 5 tests failed before the change. The test for lower-case broker names failed without its fix. All 7 tests pass now.
- `scripts/features/run.sh e2e FRM`: all passed. `@UI-07`, `@UI-08`, `@ANA-` and `@ACC`: 196 passed. `tsc` and `eslint` on the changed files: no errors.
- Desktop and 375 px with the open list, dark: examined in screenshots.
- Manual check against the live worker: not verified.

## Open points
- [ ] Check gold and one more product against the DEMO worker.

## Lessons
A text input always matches `:focus-visible`. A `Tooltip` around an input therefore opens on each click and can cover the list below it. Use `InfoHint` next to such an input. The tests did not show this defect; the screenshot did.
