---
date: 2026-11-02
author: Claude
type: fix
status: open
pr: [305]
features: [FRM-03, FRM-16, FRM-17]
areas: [frontend, tests]
---

# ENC and KEI use the TRD line measurement

## Request
Fix finding 28 of the formation audit (wave 2, package "Linie"). ENC, KEI and T618 must measure their sloped line like TRD (TRD-34 to TRD-36), not through raw wick tips. Follow-up of `2026-11-02-formation-trd-check-wick-anchors.md`. The project owner decided: ENC and KEI now, T618 later together with finding 7.

## Cause
- `lineChannel.ts` (ENC, KEI) and `t618.ts` / `t618Checks.ts` (T618) drew the counter line through the raw wick tips of two pivots. A spike wick (TRD-36) stayed an anchor.
- ENC-03, KEI-03 and T618-02 checked only the slope. The release by a close beyond the extreme before the second anchor (TRD-34) was not checked.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/trd.ts` | `lineThrough(m, posA, posB)` is taken out of `trendLines` (separate commit, no behavior change). `TrendLine.release` is the bar of the release. |
| `frontend_nextjs/src/lib/formation/lineChannel.ts` | `ChannelBase.line`, `channelBaseAt`, `counterLine`: the counter line is the TRD line; if it is not valid, the raw line. ENC-03 / KEI-03 counter part = the line is valid. Activation starts at the release bar at the earliest. |
| `frontend_nextjs/src/lib/formation/enc.ts`, `encChecks.ts`, `keiChecks.ts` | Own points use `channelBaseAt`. Z-ENC-01 and Z-KEI-01 start at the line anchor. |
| `frontend_nextjs/e2e/mocked/formation-{enc,kei}-lib.spec.ts` | New cases: no release (ENC-03 / KEI-03 unmet), spike at the first anchor, a close beyond the line before the release is not an activation. Four real series take the new measurement (approved by the project owner). |

## Why
- The coordinator chose variant B: before the release, the line does not exist, so a close beyond it is not an activation. The rule text gives no explicit order; this follows from TRD-34.
- Drawing anchors carry only time and price. The line anchor from `anchorOf` also has `replaced`; the drawings copy only the two values.

## Verification
- Each new case was red before its fix, then green.
- Measurement over 125 runs per formation (102 fixtures at the end, 23 spec times), `main` against the result: ENC 83 runs changed (7 verdicts), KEI 65 (8).
- Real series with new expectations (approved by the project owner): `enc-buy-h4-02` (invalid → forming, ENC-05 unmet), `enc-form-h4-01` (ENC-04 met, 5 touches), `kei-sell-h4-01` (KEI-07 unmet, 2 tops), `kei-bad-h4-03` (KEI-03 unmet, no release).
- `scripts/features/run.sh FRM`, `npm run lint`, `npx tsc --noEmit`: see the PR.
- Codex scan: not run, the weekly Codex limit was at 3 % left.

## Open points
- [ ] T618 still uses the raw line (`t618.ts`, `t618Checks.ts`). The change exists as a patch outside the repo; it changes 92 of 125 T618 runs (51 verdicts) and 5 real series. Main cause: the candidate search picks P without a release check, and P often goes beyond the extreme before it only with a wick, or not at all. Review it together with finding 7.
  - Decision 2026-11-04: yes, the TRD line is the rule for T618. Source: rule book T618-02 ("the sloped line … after TRD-34/TRD-35") and Z-T618-01 ("TRD-34/TRD-35, TRD-40/TRD-42"); the T618 rule book has no own line rule, it takes the TRD measure. So TRD-34 (no line before the release), TRD-36 (a spike is no anchor) and TRD-42 apply. A P that passes the extreme before it only with a wick, or not at all, has no line and is no T618 candidate. Code change that follows: `t618.ts` and `t618Checks.ts` use `lineThrough` (`trd.ts`) as ENC and KEI do (PR #305); the candidate search keeps only P after a release. Measure all fixtures before and after (the patch outside the repo changed 92 of 125 runs, 51 verdicts, 5 real series); the changed real series need the approval of the project owner as in PR #305. Run it in the same session as item 7 (same files). Finding 7 (real verdicts not proven against the acceptance list) stays with the acceptance cases, item 5.

## Lessons
- A TRD line object carries extra fields (`replaced`, `release`). Do not put it into a drawing anchor directly; copy time and price.
- A stricter line changes which base the candidate search selects, not only the check states. Measure all fixtures before you change a shared line helper.
