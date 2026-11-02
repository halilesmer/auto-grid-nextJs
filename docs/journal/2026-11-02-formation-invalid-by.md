---
date: 2026-11-02
author: Claude
type: fix
status: done
pr: []
features: [FRM-19]
areas: [frontend, tests]
---

# The "invalid because of" note names only the rules that cause "invalid"

## Request
- Follow-up point N3: a Double Top showed "Geçersiz: CDT-12, CDT-13, CDT-15". Only the exclusion CDT-15 makes it invalid. Without CDT-15, a missing CDT-12 and CDT-13 give "forming".
- The user released the work on 2026-11-02. The note looks the same. Only its list of IDs changes.

## Cause
- `FormationChecklist.tsx` built the list itself: every unmet required rule and every triggered exclusion.
- Each of the seven checkers sets its verdict with its own rules. Waiting rules give "forming". Replaced and excused rules count for nothing. The component did not know these rules.

## Solution
| File | Change |
|---|---|
| `lib/formation/types.ts` | New optional field `Candidate.invalidBy`: the IDs that cause `invalid`. |
| `abcdChecks.ts`, `garChecks.ts`, `batChecks.ts`, `butChecks.ts`, `crbChecks.ts`, `cypChecks.ts`, `cdtChecks.ts` | Each checker has one predicate `causesInvalid`. `invalidBy` is the list of checks that match it, and the verdict is `invalid` when the list is not empty. The verdict logic is the same as before. |
| `components/formation/FormationChecklist.tsx` | The note reads `candidate.invalidBy`. The local `blockers` list is gone. |

Excluded from `invalidBy` (they wait or are replaced): GAR-05, BAT-07, BAT-01 with BAT-02 met, BUT-06/07, CRB-04/05, CRB variant rules when one variant fits, CYP-07, CDT-05, CDT-12/13 (signal), ABCD-03/08, ABCD-07, ABCD-11. For CRB with no fitting variant, `invalidBy` lists the missed variant rules (CRB-06/08 unmet, CRB-07/09 met).

## Why
- The checker sets the verdict and the list in the same place, so there is no second rule set in the component.
- A shared predicate (like `settle.ts`) would need one function per checker. The predicate inside the checker is smaller.
- The image and the export (`shotData.ts`, `shotImage.ts`) use only `verdict`, not a list of IDs. They need no change.

## Verification
- Red before the fix (checker and component logic removed, field kept): 7 new tests failed, one per checker plus the page test. Green after.
- `E2E_PORT=3106 scripts/features/run.sh FRM`: 1253 passed. `tsc --noEmit` and `eslint` clean.
- Real data: `cdt-top-h4-01` at 2025-10-08 04:00 has CDT-15 triggered and CDT-12 and CDT-13 unmet. The note names CDT-15 only.

## Lessons
- A list shown to the user must come from the code that sets the verdict, not from a copy of its rules.
- `features.yaml`: a `pruefung` line with a colon followed by a space becomes a mapping and breaks `update_checklist.py`. Before this change, one such line (FRM-19, "Nicht messbar: CYP-02") was not parsed as text; it is quoted now.

## Open points
- LIB, OBO, ENC, KEI, TDF do not set `invalidBy`. Their notes do not use the list today.
