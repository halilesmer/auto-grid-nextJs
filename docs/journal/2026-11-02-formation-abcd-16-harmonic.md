---
date: 2026-11-02
author: Claude
type: feature
status: open
pr: []
features: [FRM-05, FRM-19, FRM-20]
areas: [frontend, tests]
---

# ABCD-16 measures a harmonic D, the target Fibonacci anchors at A

## Request
- Finding 15 of package D: ABCD-16 ("harmonic D in the same zone: Gartley D or Bat 88.6") was fixed to "not measurable" in `abcdChecks.ts`.
- The user chose variant A on 2026-11-02.

## Decision
- Decision: ABCD-16 is met when a Gartley or a Bat on the same A, B and C is not invalid and its D target lies in zone Z-ABCD-04. X is the turning point before A.
- Reason: rule book `abcd-ab-cd.md`, ABCD-16, and Z-ABCD-05 ("A to D with divergence or harmonic"; 0.786 only with divergence).
- Rejected: variant C (keep ABCD-16 "not measurable").
- Cost: the GAR and BAT checks run on the same points of each ABCD candidate.
- Look again: if the live test shows ABCD-16 "met" often where no harmonic is visible, tighten "not invalid" to "valid, or forming with B and C levels reached".

## Solution
| File | Change |
|---|---|
| `lib/formation/abcdChecks.ts` | New `harmonicD`. It takes X from the pivot before A. No X: "not measurable". X not in order: "not met". No ATR: "not measurable" (as ABCD-09, ABCD-10, ABCD-15). Otherwise it checks the D targets against the zone and then runs the GAR and BAT checks: Gartley D target is 0.786 of X to A (GAR-07; the -0.272 extension of GAR-05 equals the zone edge Z-ABCD-04 and would always match); Bat D target is 0.886 of X to A (BAT-07). The zone has the tolerance `HARMONIC_PARAMS.touchPips` (1 pip, as GAR-05). `ABCD_UNMEASURABLE_IDS` is removed. |
| `lib/formation/abcdChecks.ts` | Z-ABCD-05 starts at A when ABCD-16 is met or the divergence holds. Level 0.786 stays only with divergence. No new drawing, text or color. |
| `lib/formation/garChecks.ts`, `batChecks.ts` | `evaluate` is exported (no change of logic). |
| `docs/features/features.yaml` | FRM-05 text. |

## Tests
- `formation-abcd-lib.spec.ts` (`@FRM-05`): ABCD-16 met (Gartley), not met (B at 0.75 of X to A, C at 0.533 of A to B), not measurable (no turning point before A); Z-ABCD-05 anchors at A with a harmonic D and at C without.
- Two expectations changed because of decision A, not loosened:
  - "ABCD-16 is always not measurable" is now the "no X" case.
  - `formation-page.spec.ts` (`@FRM-19`): the fixture is a Gartley, so ABCD-16 is met there. The test for "not measurable" now uses row ABCD-14 of the same fixture, with the same icon and label checks.
- Run time of `analyzeAbcd` on the Gartley fixture, 20 runs each: 1.26 ms before, 0.98 ms after (no measurable increase; the D targets are checked before the GAR and BAT checks run).

## Verification
- Lib specs: see the final run in the PR text. Not covered by a test: the Bat branch (0.886), the sell side, the 1-pip tolerance edge.
- Codex scan skipped: weekly limit nearly used.

## Open points
- SIG-15 exception (rule book line 91): the divergence veto does not apply when the harmonic is complete. Not part of this change.
