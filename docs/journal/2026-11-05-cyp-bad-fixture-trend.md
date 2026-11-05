---
date: 2026-11-05
author: Claude
type: fix
status: done
pr: []
features: [FRM-12, FRM-41]
areas: [frontend, tests]
---

# Negative Cypher case cyp-bad-h4-03 restored

## Request
PR 381 (FRM-41) made formations use the trend line of the user. For 13 golden test cases no trend setting kept the old expectation, so the expectations were regenerated. A read-only check against the rule book of Bora found one wrong case: `cyp-bad-h4-03`. Restore its documented negative result.

## Cause
- Symptom: the regenerated test said "invalid because of CYP-04 and CYP-06". The documented case is "B only at 0.239 (CYP-03 unmet)".
- With the global fixture setting (0.5 ATR, 2 closes) the trend gets a new start and X → A has only two H4 candles. The formation is a small form that Bora does not draw (TRD-06).
- The search for a trend setting before PR 381 did not find `{ minSize: 1.5, changeCloses: 1 }`. With this setting the documented points are on the trend line.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/formation-trend.ts` | Add `cyp-bad-h4-03: { minSize: 1.5, changeCloses: 1 }` to `FIXTURE_TRENDS`. |
| `frontend_nextjs/e2e/mocked/formation-cyp-lib.spec.ts` | Restore the negative expectation; remove the FRM-41 regeneration note. |

Values at 2025-12-05 20:00 with the new setting (measured, not copied):

| Item | Value |
|---|---|
| X, A, B, C, D | 2025-11-25 16:00, 2025-12-01 12:00, 2025-12-02 00:00, 2025-12-04 16:00, 2025-12-05 00:00 |
| CYP-03 … CYP-07 | unmet (B 0.239), met (0.442), met, unmet (RSI(7) 76.3), unmet (D 0.100 of X → C) |
| `invalidBy` | `[CYP-03, CYP-06]` |

C is now the real high 2025-12-04 16:00 (TRD-02). The rule-book check reports that before PR 381 C was at 08:00, which was not the high (not measured again here). Thus CYP-06 is unmet now; the old test had it met.

No other case, no global fixture setting and no `src/` file changed. No page test reads this fixture by name; the lib tests get the setting through `named()` and `trendOf()`.

## Why
- The documented negative case (B at 0.239) is a rule-book case for CYP-03. A regenerated small form hides it.
- Alternative "keep the regenerated case": rejected, it tests a form that Bora does not draw.
- The global fixture policy (G1 in the check) is a decision of the project owner and is not part of this fix.

## Verification
- Failing test first: with the restored expectation and without the new `FIXTURE_TRENDS` entry, the test failed (got `[met, unmet, met, unmet, unmet]`).
- With the entry: `formation-cyp-lib.spec.ts` 61 passed.
- `tsc --noEmit`, `npm run lint`, catalog check and the full mocked e2e: see the PR.
- Not verified: the images of Bora for this case.

## Lessons
- Before you regenerate a golden expectation, scan the trend controls (minimum size 0.5–3, 1 and 2 closes) for a setting that keeps the documented case.
