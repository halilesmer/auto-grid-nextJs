---
date: 2026-11-02
author: Claude
type: fix
status: open
pr: []
features: [FRM-04]
areas: [frontend]
---

# SIG: warm-up is unmeasurable, SIG-29 measures CRV

## Request
Fix the review findings 11, 13 and 2 for the signal checks (SIG) in `sigChecks.ts`. Finding 11: without RSI or Wave warm-up, SIG-01, SIG-09 and SIG-10 gave ☐. Finding 13: SIG-29 was always "not measurable". Finding 2: the test for SIG-29 had only the "not measurable" case.

## Cause
- SIG-01 and SIG-10 used `flag(value !== null)`, SIG-09 used `flag(a.wave !== null && b.wave !== null)`. A null value comes only from the missing warm-up of the indicator (first bars of a series). The checks are settings, so null means "no data", not "condition not met".
- SIG-29 was hard-coded to "not measurable". SIG itself defines no stop and no first target; these come from the trade rules and the formation. No formation passes them to SIG today.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/sigChecks.ts` | SIG-01, SIG-09, SIG-10: value present → ☑, null → not measurable; new list `SIG_NO_UNMET_IDS`. New option `SigOptions.trade` (entry, stop, TP1). SIG-29 (`crvCheck`): CRV = reward to TP1 / risk to stop, signed by the trade side; ☑ if CRV > 1 (tolerance 1e-9 for decimal prices), else ☑/☐ by the reversal candle in the next lower timeframe (same value as SIG-28). Not measurable without `trade` or `side`, when stop or TP1 is on the wrong side of the entry (also NaN), or at CRV ≤ 1 without the lower timeframe. Value = CRV. SIG-29 left `SIG_UNMEASURABLE_IDS`. |
| `frontend_nextjs/e2e/mocked/formation-sig-lib.spec.ts` | Synthetic cases "too few bars" (SIG-01, SIG-10) and "too few bars for the Wave" (SIG-09) now expect "not measurable". New SIG-29 cases: ☑ (CRV 2, with and without lower timeframe), ☑ (CRV 1 with lower reversal), ☐ (CRV 1 without; decimal prices exactly 1:1), not measurable (no lower timeframe at CRV 1, no trade, no side, target on the wrong side, risk 0), value tests (CRV 2 sell, CRV 0.5 buy). The coverage test asks "not measurable" instead of ☐ for `SIG_NO_UNMET_IDS`. |
| `docs/features/features.yaml` | FRM-04 sentence about SIG-29 and the settings checks. FRM-18: one `pruefung` item quoted, because its text contains `: ` and YAML read it as a mapping; `update_checklist.py` then failed with a TypeError on `main`. |

## Why
- The caller supplies entry, stop and TP1. SIG has no rule for the stop or the target, so a value derived inside SIG would be a new rule.
- Not done: `pointAt` in `sig.ts` takes the Wave maximum also when the search range of a pivot starts inside the warm-up. To mark such a point "not measurable" would make the base synthetic series `DIV_BEAR` (second high at bar 38, range from bar 26) unmeasurable and change many unrelated cases. The effect is limited to the first 35 bars of a series.

## Verification
- Before the fix: SIG spec 8 red, 73 green. After: 81 green. Review edge cases: 3 red before the change, after it 87 green.
- `npx tsc --noEmit` exit 0, `npm run lint` exit 0, `scripts/features/run.sh FRM` (see PR).
- Real price series (`e2e/fixtures/formation/*.json`): no expectation changed.
- Codex scan not run: weekly quota left 3 % (limit 5 %).

## Open points
- [ ] In the product SIG-29 stays "not measurable" until a caller passes `trade`.
- [ ] `pointAt` partial warm-up (see "Why").

## Lessons
- A YAML list item with `: ` in plain text becomes a mapping. Quote such items in `features.yaml`; `update_checklist.py --check` does not catch it, only the render step fails.
