---
date: 2026-11-02
author: Claude
type: fix
status: open
pr: []
features: [FRM-20]
areas: [frontend, tests]
---

# Trade drawings carry a fixed rule marker

## Request
- Package "drawings" of the review: finding 41.
- 27 drawings `Z-*` had `rules: []`. Find out for each drawing if the rule book names a condition ID, or if the drawing only belongs to the trade (entry, stop, target).
- The coordinating session approved the plan and the new constant in `types.ts`.

## Cause
- `rules: []` had two meanings: "the drawing shows no condition" and "the mapping is missing". A test could not tell them apart.
- For the 27 drawings, the rule book names no checklist condition. 26 belong to the trade. Z-LIB-03 names LIB-05, but LIB-05 is a dropped condition without a checklist row. Thus Z-LIB-03 also gets the trade marker.

## Solution
| File | Change |
|---|---|
| `lib/formation/types.ts` | New constant `TRADE_RULES`: one shared empty list for drawings that only belong to the trade. |
| `lib/formation/{abcd,bat,but,cdt,crb,cyp,f2618,gar,lib,obo,tdf,t618}Checks.ts` | The 23 trade drawings use `rules: TRADE_RULES` instead of `rules: []`. |
| `e2e/mocked/formation-drawing-rules-lib.spec.ts` | Coverage test: no `rules: []` in `src/lib/formation`. On the real series of the page search and of T618, each drawing has condition IDs or is `TRADE_RULES` (identity). |

## Why
- The runtime does not change, because the list is empty. `drawingLayout.ts` keeps the target tone for Fibonacci levels. The checklist hover links nothing, as before.
- Rejected: a marker string such as `'TRADE'` in `rules`. It changes the length, the tone and the hover mapping.
- Rejected: a new field on `Drawing`. It changes the shared type for one test.

## Verification
- New test was red before the change: 20 places with `rules: []`, and 674 drawing occurrences on real series without IDs. T618 separately: 3 places and 3 drawings. After the change: 2 passed.
- After the merge of `origin/main`: `scripts/features/run.sh FRM` → 17 pytest passed, 1348 Playwright tests passed, 0 failed. `npx tsc --noEmit` → exit 0. `npm run lint` → exit 0.
- Review by the `reviewer` agent: no critical finding. Codex scan not done (weekly limit too low).

## Open points
- [ ] ENC and KEI (Z-ENC-02, Z-KEI-02, Z-KEI-03, Z-KEI-03b): another package changes these files now. After its merge, change them to `TRADE_RULES` and remove the `PENDING` list in the coverage test.

## Lessons
- An empty list cannot carry a reason. A shared constant can, and a test can check it by identity.
