---
date: 2026-11-02
author: Claude
type: fix
status: open
pr: []
features: [FRM-19, FRM-12]
areas: [frontend, tests]
---

# A hit with an unmeasurable required rule is not "valid"

## Request
- Finding 23 of package C: a hit could show "valid" while a required rule was `unmeasurable`.
- The user chose option 1 (CYP-02 on D1 does not block) and design variant A on 2026-11-02.

## Cause
- The seven checkers on the page (`scan.ts`) set the verdict from `unmet` rules only. An `unmeasurable` rule never changed the verdict.
- Measurement over 102 fixtures: 1093 valid hits, 16 with an unknown required rule (14 Double Top on D1 with CDT-02 and CDT-12, 2 Cypher on D1 with CYP-02 and CYP-05). After the change: 1077 valid.
- CYP-02 on D1 is always unknown: `CONTEXT_TIMEFRAMES` has no W1.

## Solution
| File | Change |
|---|---|
| `lib/formation/settle.ts` (new) | `settle(verdict, checks, exempt)` turns `valid` into `forming` when a required rule is `unmeasurable` and not exempt. `exemptFor(code, tf, checks)` is the one exemption predicate. `blockingUnknowns` lists the blocking IDs. |
| `abcdChecks.ts`, `garChecks.ts`, `batChecks.ts`, `butChecks.ts`, `crbChecks.ts`, `cypChecks.ts`, `cdtChecks.ts` | Each calls `settle` after its verdict lines. |
| `components/formation/FormationChecklist.tsx` | New note `formation.note.unmeasurable` with an (i) hint. It uses `blockingUnknowns` and `exemptFor`, so it names only the rules that hold the verdict. `formation.note.forming` keeps priority when the end point is open. |
| `i18n/messages/formation.ts`, `hints.ts` | New keys `formation.note.unmeasurable` and `formation.note.unmeasurable.hint` (tr, en, de). |
| `e2e/mocked/formation-settle-lib.spec.ts` (new), `formation-cyp-lib.spec.ts`, `formation-page.spec.ts` | New tests. Five approved Cypher test changes: four get `D1: D1_UP`, `cyp-buy-h4-01` expects `forming`. |

Exempt rules (they stay as before): rules the checker already handles as pending or replaced (ABCD-07, ABCD-11, GAR-05, BAT-07, BAT-01 with BAT-02 met, BUT-06/07, CRB-04/05, CYP-07, CDT-05), rows marked `inactive`, and CYP-02 on D1.

## Why
- Option 1 and not a new verdict "unchecked": a new verdict would change badges, favorites, alarm and image export for 16 of 1093 hits.
- Favorites and alarm follow without code: they read the verdict, so a `forming` hit is not a favorite and gives no "valid" alarm.
- Checklist and checker share `exemptFor`, so there is no second rule set in the component.
- `formation.note.forming` is not dead code: `D1` or `H2` can be missing in the checker API. The scan measurement (5447 forming hits) always had the end point, so the note did not appear there.

## Decision
- **Decision:** CYP-02 on D1 does not block the verdict. The header still shows "(1 not measurable)".
- **Cost (Bedel):** On D1 one required Cypher rule stays unmeasured.
- **Revisit (Yeniden bak):** When W1 is in the context (package D, finding 16), remove the CYP-02 exemption in `settle.ts`.

## Verification
- `formation-settle-lib.spec.ts` and the two Cypher wiring tests were red before the checkers called `settle` (Cypher H4 without D1 gave `valid`), green after.
- `scripts/features/run.sh FRM` with `E2E_PORT=3105`: 1241 passed. `tsc --noEmit` and `eslint` clean. The new page test passed on its first run; it was not run red.
- Screenshots (mock worker, light and dark, 1400 and 375 px): no horizontal overflow, the (i) tooltip opens and fits inside the 375 px viewport.

## Lessons
- Build a verdict from `unmet` and `unmeasurable` together; a verdict from `unmet` alone calls unchecked rules fine.

## Open points
- CDT-12 (RSI extreme) blocks the verdict even when CDT-13 (reversal candle) is met. The decision listed CDT-12 as blocking; change `exemptFor` if the user wants the candle to count.
- LIB, OBO, ENC, KEI, TDF do not use `settle`. They follow with package E if finding 38 comes.
- The warning box has a contrast of 3.2:1 in light mode (existing style, not part of this change).
