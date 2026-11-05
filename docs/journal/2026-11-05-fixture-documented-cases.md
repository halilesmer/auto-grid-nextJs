---
date: 2026-11-05
author: Claude
type: decision
status: open
pr: [388]
features: [FRM-41]
areas: [frontend, tests]
---

# Fixtures keep documented cases or mark them unreachable

## Request
PR 381 (FRM-41) made the formations use the trend path of the user. For 13 test cases no fixture setting kept the old expectation, so the expectations were regenerated at the global fixture setting `FIXTURE_TREND` (0.5 ATR, the slider minimum). A rule book check found that many regenerated cases are micro formations of 1 to 3 H4 candles, which the rule book does not draw (TRD-06). Decision of the project owner (2026-11-05, plan 1105-A5): a fixture must use a setting that keeps the documented case. If no setting does, do not replace the case with a micro formation. Mark it as "unreachable on the user's path".

## Solution
For each case, a scan tried every setting that a user can select, and compared the result with the expectation from before PR 381 (base commit `5955b204`). A hit counts only if the formation has the same points as before.

Scan range: rules `groesse`, `welle`, `geruest`, `filter`; minimum size 0.5 to 3.5 ATR in steps of 0.25 (`TREND_LIMITS`); 1 and 2 closes for the change; EWO retreat 0.1 to 0.8; EWO fast 3/5/8/13 against slow 21/34/35/50/89; ATR period 14. That is 1288 settings for each case. A control case (`bat-sell-h4-02`, which passes today) gave 12 hits, so the scan can find hits.

| Case | Old expectation | Result | Setting or reason |
|---|---|---|---|
| `bat-buy-h4-01` | buy Bat valid, BAT-14/15/17 unmet | setting found, same points | `filter`, 0.75 ATR, 1 close, EWO 13/89 |
| `t618-form-h4-01` | no candidate; own P has T618-02 unmet | setting found, same result | `filter`, 1.25 ATR, 1 close, retreat 0.4 |
| `f2618-sell-h4-03` | sell valid, 2618-07 met | setting found; N moves to the deeper low between H1 and H2 (0.52464, was 0.52489) | `geruest`, 1.75 ATR, 1 close, EWO 5/50 |
| `bat-sell-h4-01` | sell Bat valid, BAT-14 unmet | unreachable | at 0.5 ATR, X to A is 2 candles; BAT-14 and BAT-17 exclude |
| `enc-buy-h4-01` | buy channel invalid, ENC-01 unmeasurable | unreachable | at 0.5 ATR, a sell channel of 6 candles (24 h) |
| `enc-bad-h4-01` | ENC-03 unmet on 2025-12-12 | unreachable | at 0.5 ATR, a channel of 16 candles on 2025-11-27 |
| `fib-counter-d1-01` | D1 impulse 0.89027 to 0.92262 | unreachable | at 0.5 ATR the impulse starts after a pullback of 2 candles (0.89513); at 1 ATR and more, a different leg |
| `abcd-double-h4-01` 11-13 | sell valid (ABCD-10 met) | reachable alone (`filter`, 0.5 ATR, retreat 0.4 to 0.7), not together with 11-18 | no change, see "Why" |
| `abcd-double-h4-01` 11-18 | ABCD-23 met, ABCD-10 unmet | unreachable | no change, see "Why" |
| 2618 badge (`f2618-open-h4-01`) | sample time 2025-10-15 | reachable only with `geruest` 1.5 to 1.75 ATR, EWO 3 or 5 against 21 | no change: a mechanism test, the fixture setting keeps its documented row |
| 2618 settle (`cyp-bad-h4-01`, 30 bars) | sample time 2025-11-03 | unreachable | no change: a mechanism test, not a documented case |

Unreachable cases keep the old expectation in the test. The test is marked as an expected failure with `test.fail` (strict: if the case becomes reachable again, the test fails). The reason is in `FIXTURE_UNREACHABLE`.

| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/formation-trend.ts` | 3 new entries in `FIXTURE_TRENDS`; new list `FIXTURE_UNREACHABLE` and helper `markUnreachable` |
| `frontend_nextjs/e2e/mocked/formation-gar-bat-lib.spec.ts` | `bat-buy-h4-01` old expectation back; `bat-sell-h4-01` old expectation, marked unreachable |
| `frontend_nextjs/e2e/mocked/formation-t618-lib.spec.ts` | `t618-form-h4-01` old row back |
| `frontend_nextjs/e2e/mocked/formation-2618-lib.spec.ts` | `f2618-sell-h4-03` old row back |
| `frontend_nextjs/e2e/mocked/formation-enc-lib.spec.ts` | `enc-buy-h4-01`, `enc-bad-h4-01` old rows, marked unreachable |
| `frontend_nextjs/e2e/mocked/formation-fib-lib.spec.ts` | `fib-counter-d1-01` old expectation, marked unreachable |

The page tests read the fixture setting through `named`/`trendOf` and `seedFixtureTrend`, so the new entries apply to them too.

## Why
- `test.fail` instead of `test.fixme` or `test.skip`: the test still runs with the documented expectation, and a change in reachability shows.
- `abcd-double-h4-01`: one fixture has one setting, and no setting keeps both statements. The old 11-13 result needs A = 175.869, which is not the wick end (175.696, TRD-02). The old 11-18 result is reachable with no setting. The new results are not micro formations (30 and 21 H4 candles), and the new 11-18 result (ABCD-10 met) agrees with the Telegram case of the rule book source. Thus the tests stay as they are. The project owner must decide (see open points).
- `bat-buy-h4-01`: the setting gives the same points as before, also B = 155.565, which is not the wick end (155.482, TRD-02). The policy keeps this case. The project owner must decide whether a case with this point is a documented case (see open points).
- The global `FIXTURE_TREND` stays at 0.5 ATR with 2 closes.

## Verification
- Scan: 13 scan tests ran (not zero), 1288 settings for each case; the control case had hits.
- Points before and after: the same analysis code ran on `5955b204` and on this branch, and the points were compared.
- The lib specs of BAT, BUT, CRB, T618, ENC, FIB, 2618, 2618 scan and ABCD: 412 expected, 0 unexpected; the 4 unreachable tests fail on the documented assertion (side, leg start, BAT-14), not on an exception.
- `scripts/features/precheck.sh`: catalog, lint and tsc pass; mocked e2e 2820 passed, 0 failed (the 4 unreachable tests count as expected failures). The worker step had 1 failure in `test_self_updater_hardening.py` (UPD-07, a timing test); this branch does not change `worker_python/`, and the test passed 1 of 3 times when it ran alone on the loaded machine.
- Count for the project owner: with `FIXTURE_TREND` = `DEFAULT_TREND_SETTINGS` (2.5 ATR, 1 close), see open points.
- Not verified: settings outside the scan range (other EWO pairs, ATR period other than 14); the images of the rule book source.

## Open points
- [ ] Project owner: `abcd-double-h4-01` keeps the regenerated expectations (no single setting keeps both old statements).
- [ ] Project owner: `bat-buy-h4-01` keeps the old Bat with B not at the wick end; the setting needs EWO 13/89.
- [ ] Project owner: the 4 unreachable cases (`bat-sell-h4-01`, `enc-buy-h4-01`, `enc-bad-h4-01`, `fib-counter-d1-01`) need a new fixture or must stay unreachable.
- [ ] Project owner: decide on the global `FIXTURE_TREND`. With `FIXTURE_TREND` = `DEFAULT_TREND_SETTINGS` (2.5 ATR, 1 close; the entries in `FIXTURE_TRENDS` unchanged), 83 of 2820 mocked e2e tests fail: CRB 18, OBO 7, 2618 6, ABCD 6, CDT 6, T618 6, GAR/BAT 5, KEI 5, trade page 5, formation page 4, CYP 3, ENC 3, LIB 3, 2618 scan 2, BUT 2, TDF 2.
- [ ] `cdt-top-h4-02` (other session): the old expectation on 2025-11-10 16:00 is reachable with no scanned setting.

## Lessons
- A scan that compares only check states can find a formation with other points and the same states (here N of `f2618-sell-h4-03`). Compare the points with the old code too.
- Scan all four trend rules, not only `groesse`: all hits came from `filter` and `geruest`.
- Do not put temporary scan specs below `frontend_nextjs/e2e/`: `next build` type-checks them, a type error stops the build, and the e2e web server times out with zero tests.
