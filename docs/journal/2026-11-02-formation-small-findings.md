---
date: 2026-11-02
author: Claude
type: fix
status: done
pr: [300, 356]
features: [FRM-04, FRM-05, FRM-06, FRM-15, FRM-17]
areas: [frontend, tests]
---

# Six small formation findings fixed

## Request
- Package "small items" of the review: findings 22, 29, 30, 34, 35 and 36.
- The coordinating session approved the plan and the one-line change in `f2618.ts`.

## Cause
| Finding | Rule | Symptom | Root cause |
|---|---|---|---|
| 22 | CDT-15 | A small close beyond H1 in the first 20 bars did not violate the Double Top. | `view.wide[k] !== true` read a missing SIG-34 lead (`null`) as "not wide". |
| 35 | ABCD-11 | Without ATR(14) the row showed ☐. | `flag(near !== null)` gave `unmet` for a missing value. |
| 29 | Z-KEI-02 | The target Fibonacci used the move of the pattern time frame. | `drawingsOf` read only the bars of the pattern time frame (journal 2026-10-28, LN-8). |
| 30 | T618-05 | A trend change after the touch of 0.618 still gave ☑. | The search of `model.changes` had no upper limit. |
| 34 | Z-FIB-07 | Two separate correction bands showed the gap as an overlap band. | `Math.min`/`Math.max` turned an empty intersection into a rectangle. |
| 36 | T618-09 | Duplicate code. | `t618Checks.ts` had a copy of `wideAgainst` from `f2618.ts`. |

## Solution
| File | Change |
|---|---|
| `lib/formation/cdt.ts` | `violated()` returns `boolean \| null`. A sure violation gives ☑. Else an unknown volume gives `unmeasurable`. `abcdIsCdt` (ABCD-24) also gives `unmeasurable` then. |
| `lib/formation/abcdChecks.ts` | ABCD-11 is `unmeasurable` without ATR, else ☑. The exemption of ABCD-11 in `causesInvalid` is removed, because ABCD-11 is never ☐ now. |
| `lib/formation/keiChecks.ts` | Z-KEI-02 uses the last leg of the next higher loaded time frame in the trend direction of the wedge. Without that time frame or leg there is no Z-KEI-02. |
| `lib/formation/t618Checks.ts` | T618-05 counts a change only up to the touch bar of 0.618, without a touch up to the last bar. T618-09 calls `wideAgainst` from `f2618.ts`. |
| `lib/formation/f2618.ts` | `wideAgainst` takes `Pick<CdtShape, 'es'>`. The callers in `f2618Checks.ts` do not change. |
| `lib/formation/fibChecks.ts` | Z-FIB-07 only when the bands intersect. |

## Why
- 22: The rule exempts a close only when it is not wide. An unknown width cannot prove the exemption.
- 35: ABCD-11 defines the word "near". Without ATR the distance is unknown, not too large. The verdict does not change: without ATR, ABCD-10 (required) is already `unmeasurable` and holds "valid". The note now also names ABCD-11.
- 29: The rule book names the impulse of the higher time frame. The start point is not named. The current leg of the higher time frame is the nearest reading.
- 30: The rule order T618-04 → T618-07 puts the trend change before the entry at 0.618. T618-06 and T618-07 need the change first.
- 30: Without a touch, T618-05 counts up to the last bar. 2618-06 stops at the end of its measurement window. T618 does not use that window, because the analysis takes the newest impulse end as I.
- Older entries are replaced in part: `2026-10-27-formation-abcd.md` (ABCD-11) and `2026-10-28-formation-t618-enc-kei.md` (T6-6, LN-8).

## Verification
- New tests were red before the fix:
  - `formation-cdt-lib.spec.ts`: CDT-15 `unmeasurable` without SIG-34 lead.
  - `formation-abcd-lib.spec.ts`: ABCD-24 `unmeasurable` (was ☑), ABCD-11 `unmeasurable` (was ☐).
  - `formation-kei-lib.spec.ts`: Z-KEI-02 on the D1 leg 100 → 140, mirrored on 300 → 260; no Z-KEI-02 without D1 or against the trend.
  - `formation-t618-lib.spec.ts`: trend change after the touch gives ☐; without a touch the change counts up to the last bar.
  - `formation-cdt-lib.spec.ts`: a sure violation after an unknown close gives ☑.
- A mutation of each new branch turns its new test red.
  - `formation-fib-lib.spec.ts`: band 115.73 to 118.54 on overlap; no band for separate bands.
- Changed real-series test (approved by the project owner): `echte Reihe t618-buy-h4-01` expects "forming" and T618-05 ☐.
- Changed artificial tests:
  - The ABCD coverage test does not ask for an ABCD-11 ☐ case.
  - The KEI drawing test expects no Z-KEI-02 without a higher time frame.
  - The FIB drawing test expects no Z-FIB-07 for separate bands.
- Measurement over all fixtures in `e2e/fixtures/formation/` (end of each series, one time frame):

| Finding | Result |
|---|---|
| 22, 35 | CDT and ABCD: no change of verdict, badge, CDT-15, ABCD-11 or ABCD-24. |
| 29 | Z-KEI-02 is not drawn on 102 KEI hits (each fixture loads one time frame). States and verdicts do not change. |
| 30 | `t618-buy-h4-01`: the touch of 0.618 came at 2025-12-19 20:00, the trend change up at 2025-12-22 08:00. T618-05 ☑ → ☐, verdict "valid" → "forming". The project owner approved the new expected values. `tdf-flag-h4-02` shows the same case. Two other fixtures choose a different candidate; their verdict stays "invalid". |
| 34, 36 | No change. |

## Open points
- [x] When the touch of 0.618 came before the trend change, T618 stays "forming" for all time. The state cannot change after the entry. Examine whether "invalid" is correct. This PR does not change it.
  - Decision 2026-11-04 (Varsayım): "invalid". Source: rule book T618-06 ("after the trend-turning impulse a correction begins", with I = end of that impulse) and T618-07 ("in the correction the price touches 0.618"); the rule order T618-04 → T618-07 puts the trend change before the touch. A touch before the trend change is not the touch of T618-07 for this I, and `## Handel`, Entry, says "no entry in the middle of the turn". The candidate cannot become valid later; a new I after the trend change is a new candidate. Code change that follows: `t618Checks.ts`, verdict: when the 0.618 touch exists and T618-05 is unmet up to the touch bar, the verdict is "invalid" with T618-05 in `invalidBy`. The real series `t618-buy-h4-01` (and `tdf-flag-h4-02`, same case) change from "forming" to "invalid". Run it together with item 10 (same files).
  - Result 2026-11-04 (package A): `t618Checks.ts` puts T618-05 in `invalidBy` and the verdict is "invalid" when the 0.618 touch exists, T618-04 (line break) is met and T618-05 is unmet up to the touch bar (K2b, approved by the project owner: without a break there is no turn yet, so the candidate stays "forming"). `invalidBy` now also lists the unmet structure conditions T618-01 to T618-03. Different from the plan above: `t618-buy-h4-01` and `tdf-flag-h4-02` do not become "invalid". The line change of item 10 removes or replaces their P before the verdict rule applies (`t618-buy-h4-01`: no candidate; `tdf-flag-h4-02`: another P, still "forming"). The rule alone would have made both "invalid" (measured without the line change). The synthetic `NO_BREAK` stays "forming" with an empty `invalidBy`; `NO_CHANGE` and `LATE_CHANGE` become "invalid".

## Lessons
- Before you write a Fibonacci leg into a test row, calculate the correction depth. A correction below 0.382 extends the leg (FIB-07).
