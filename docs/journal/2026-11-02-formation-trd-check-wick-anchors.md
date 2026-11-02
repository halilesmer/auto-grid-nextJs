---
date: 2026-11-02
author: Claude
type: fix
status: open
pr: []
features: [FRM-03, FRM-16]
areas: [frontend, tests]
---

# TRD checks: wick for TRD-05, anchors for TRD-41

## Request
Fix findings 8, 10 and 28 of the formation audit (wave 1, package TRD/ENC). After measurement, the coordinator split finding 28 into its own step.

## Cause
- Finding 8 (TRD-05): the check line looked only for a close beyond the point in the N right candles. The rule asks for a new extreme before the fractal is finished. A wick beyond the point is a new extreme, also when the candle closes inside. The trend builder itself was not affected: it always keeps the outermost extreme.
- Finding 10 (TRD-41): `scanLine` counts touches after the second anchor. The check asked for 3 of these touches, so the anchors did not count. The rule asks for the third touch including the two anchors.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/trdChecks.ts` | TRD-05: a wick strictly beyond the point in the N right candles is enough. TRD-41: touches after the second anchor + 2 ≥ 3; the value shows the total. |
| `frontend_nextjs/e2e/mocked/formation-trd-lib.spec.ts` | New cases `RIGHT_WICK` (TRD-05) and `ONE_TOUCH` (TRD-41). |

## Why
Only the check line changes. TRD checks are read only by the TRD spec, so no other formation and no page changes.

## Verification
- Both new cases were red before the fix (TRD spec: 2 failed), then green (TRD spec: 88 passed).
- `scripts/features/run.sh FRM`, `npm run lint` and `npx tsc --noEmit`: see the PR.
- Codex scan: not run, the weekly Codex limit was at 3 % left.

## Open points
- [ ] Finding 28 (ENC-03, also KEI and T618): the channel line uses raw pivots instead of the TRD line (TRD-34 to TRD-36). This is a separate step in wave 2, after the small-fixes package is merged. A prototype exists: `lineThrough(m, posA, posB)` taken out of `trendLines` in `trd.ts`, and the TRD line in the channel base. It changes 70 of 118 ENC and 49 of 118 KEI runs over all fixtures, and 4 real-series tests become red (`enc-buy-h4-02`, `enc-form-h4-01`, `kei-sell-h4-01`, `kei-bad-h4-03`). The coordinator decides these 4 with the project owner. Also open in that step: the Z-KEI-01 start anchor and the T618 line (`t618.ts`, `t618Checks.ts`). Continued in `2026-11-02-formation-line-trd-measure.md`.

## Lessons
- Before you change a shared line helper, measure all fixtures: a stricter line changes which five-point base the channel search selects, not only the check state.
