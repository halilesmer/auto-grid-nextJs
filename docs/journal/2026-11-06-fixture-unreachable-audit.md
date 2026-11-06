---
date: 2026-11-06
author: Claude
type: fix
status: open
pr: []
features: [FRM-41, FRM-07, FRM-12, FRM-16, FRM-18]
areas: [frontend, tests]
---

# Four "unreachable" fixture cases were reachable

## Request
An audit (R3) of PR 388 found that four cases marked "unreachable on the user's path" are reachable, and that `cyp-bad-h4-03` came back with other points than PR 385 claimed. The owner approved the fixes (2026-11-06).

## Cause
- The 388 scan used one ATR period (14) and five EWO pairs. The user can select ATR 2 to 100 and EWO 2 to 50 against 3 to 200 (`TREND_LIMITS`). Three cases need an ATR period or an EWO pair outside the scan (see the table). The text "1288 settings for each case" in `2026-11-05-fixture-documented-cases.md` counted only that small range. It does not mean "every selectable setting".
- `fib-counter-d1-01` was reachable inside the 388 scan range too (ATR 14, EWO 8/50, retreat 0.7). The 388 scan missed it; the cause was not found.
- `markUnreachable` used `test.fail`. `test.fail` accepts every error, also a missing fixture file or a `TypeError`. Two negative trials ended with "2 passed".

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/formation-trend.ts` | 4 entries in `FIXTURE_TRENDS`. `FIXTURE_UNREACHABLE` and `markUnreachable` removed. New `trendProblems()` checks that a fixture file exists and that a setting is selectable (limits, step, EWO fast < slow). |
| `frontend_nextjs/e2e/mocked/formation-{fib,gar-bat,enc}-lib.spec.ts` | The four cases run on their own setting with the original expectations, no `test.fail`. `bat-sell-h4-01` also checks the five point times. |
| `frontend_nextjs/e2e/mocked/formation-follows-trend-lib.spec.ts` | 2 tests (FRM-41): every `FIXTURE_TRENDS` entry is selectable and has a file; a broken entry (missing file, value outside the controls, wrong step, EWO fast ≥ slow) gives problems. |
| `frontend_nextjs/e2e/mocked/formation-cyp-lib.spec.ts` | `cyp-bad-h4-03` marked as not reachable with explicit checks (see below). |

Settings (all `rule: filter`):

| Case | Setting | Points against the state before FRM-41 (`5955b204`) |
|---|---|---|
| `bat-sell-h4-01` | ATR 7, 1.25 ATR, 1 close, EWO 8/50, retreat 0.6 | X, A, B, C, D same |
| `fib-counter-d1-01` | ATR 14, 0.5 ATR, 2 closes, EWO 8/50, retreat 0.7 | D1 leg and the D1 and H4 candidates same |
| `enc-buy-h4-01` | ATR 14, 1 ATR, 2 closes, EWO 13/21, retreat 0.6 | 5 of 6 points same; H1 is 12-11 16:00 (103.179), was 12-11 04:00 (103.181) |
| `enc-bad-h4-01` | ATR 28, 1.75 ATR, 1 close, EWO 8/50, retreat 0.6 | 4 of 5 points same; L0 is 11-21 16:00 (100.351), was 11-24 08:00 (100.956) |

The original expectations of all four tests hold unchanged (side, verdict, check states, leg prices). The ENC tests check states, not point times. For the two channels no scanned setting gives all points: this is open point 1.

`cyp-bad-h4-03`: no scanned setting gives the five points of the documented case (X 11-25 16:00, A 12-01 12:00, B 12-02 00:00, C 12-04 08:00, D 12-04 12:00; CYP-03 unmet, CYP-06 met, CYP-07 unmet). The reason is in the candles: on the user path, C is at the wick extreme (TRD-02). The H4 candle at 12-04 16:00 has a higher high (0.66235) than the candle at 08:00 (0.66187), so 08:00 is not a vertex of any path that keeps the 16:00 high in the same leg. The case is marked as not reachable. The test keeps the nearest form on the path (trend 1.5 ATR, 1 close; C 12-04 16:00, CYP-06 unmet) and states: C is not 08:00 and CYP-06 is not met. A second test runs 1872 settings (4 rules, 13 sizes, 1 and 2 closes, ATR 7/14/28, 3 EWO pairs, retreat 0.2/0.5) and checks that none gives the documented five point times.

## Why
- Keep the original expectations. A setting that keeps the case is better than a new expectation (decision 1105-A5).
- `test.fail` removed, not repaired: an expected failure hides every error. A positive check of the nearest form plus explicit `not.toBe` on the differing fields shows what is different and fails on a broken fixture.
- `enc-buy-h4-01`: the chosen setting has the most identical points of all hits (5 of 6). It has a "wrong" EWO pair (13/21) but the ATR period is the default.

## Verification
- Reproduced first: with only the four settings added (and the old `markUnreachable`), the three lib specs gave 3 of 4 "Expected to fail, but passed" (the fib test used a fixed setting, so it still failed as expected). Before: 144 passed in the three files.
- Scan (new): `groesse`/`welle`/`geruest` and `filter`, ATR 2/3/5/7/10/14/20/28/35/50/70/100, EWO fast 3/5/8/13/21 against slow 21/34/35/50/89/144 (30 pairs), size 0.5 to 3.5, 1 and 2 closes, retreat 0.1 to 0.8. 82 440 settings. Points compared with `5955b204`.
- `fib-counter-d1-01`: 370 settings with identical points (all `filter`). `enc-*`: no setting with all points. `cyp-bad-h4-03`: none.
- After the fix: all `formation-*-lib.spec.ts` files, 1792 passed. A broken `FIXTURE_TRENDS` entry (renamed key) turned 2 tests red (the new guard and the case itself).
- `tsc --noEmit` and `eslint` on the changed files: no errors. Precheck: see the PR.
- Not verified: ATR 2 to 100 only at 12 values, EWO fast/slow only at 5 and 6 values; the point comparison for `enc-*` and `cyp-bad-h4-03` may find a hit outside this grid. The rule-book source images.

## Open points
- [ ] Owner: `enc-buy-h4-01` (H1) and `enc-bad-h4-01` (L0) keep the documented states but not every point. Decide whether that is enough or whether a new fixture is needed.
- [ ] Owner: `cyp-bad-h4-03` is not reachable. A new fixture with the same negative case (B at 0.239, D far from 0.786) on the user path would restore the coverage.
- [ ] The text "1288 settings" in `2026-11-05-fixture-documented-cases.md` is corrected here. Do not read it as "all selectable settings".

## Lessons
- A scan range is a claim about a range, not about the user's controls. Write the range in the claim and compare it with `TREND_LIMITS`.
- Do not mark a case unreachable from a scan that varies only some controls. Vary all of them (ATR period, EWO pair), or write the range.
- `test.fail` hides any error. Use an explicit check on the field that differs.
