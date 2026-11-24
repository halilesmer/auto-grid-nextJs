---
date: 2026-11-24
author: Claude
type: fix
status: open
pr: []
features: [FRM-05, FRM-07, FRM-39]
areas: [frontend]
---

# Ended trade comes back on another base

## Request
An ended harmonic trade came back with the same identity but on a different base ("ghost"). Rules: the end shows one time (1120-A42.1), base and entry freeze at the entry (1122-A28.1), a running trade has priority (1122-A1.3), rule B (1122-A3.2), trade identity = side + entry candle + entry (1122-A3.4.1). Done criterion: an ended identity does not show again on a different base. Also examine AB=CD for the same gap.

## Cause
Case: XAUUSD M15, Butterfly buy. Base X 10-06 05:30, A 10-06 15:00, B 10-06 17:30, C 10-06 18:45; entry 4080.3 in the candle 10-07 15:15, stop 4042.356; shown at the close 10-07 15:30. TP1 and TP2 in the candle 10-08 04:45; the end shows at the close 10-08 05:00. From the close 10-08 05:15 the search showed a base X 09-28 17:45 with the same entry candle and the same entry, but with stop 4027.206 and state TP1, as a running trade.

Root cause in `analyzeXabcd` (`xabcd.ts`): after its end candle, the frozen base has no priority and leaves the list of open trades. The other base has the same trade key, and the key has no stop and no points. Rule B (`hiddenOf`) compares only the key with the key shown at the entry close, so it lets the other base through. Its trade had not ended (other stop, other targets), so it got priority as a running trade. The same base can also come back as the best recent base (`bestRecent`).

AB=CD (`analyzeAbcd`, `abcdChecks.ts`) has the same gap: the identity has no pivots (1122-A1.4 c), and an ended triple is skipped in the priority queue. Example: fixture `bat-buy-h4-01`, AB=CD buy, A 10-14 16:00, B 10-15 08:00, C 10-15 16:00, entry 150.464 in the candle 10-16 00:00, stop 149.980; TP1 and TP2 in the candle 10-16 08:00. At the closes 10-16 16:00 and 20:00 the search showed the triple A 10-10 00:00, B 10-10 20:00, C 10-14 00:00 with the same entry, stop 149.645, state TP1 and then breakeven.

## Solution
A candidate is a ghost when all of these are true: it entered before the last candle; a trade with the same key ended before the last candle; the points of that ended trade are the points shown at the entry close; the candidate has other points; and its stop or its end candle is different. A ghost is skipped in the priority search and in the choice without priority. The same outcome with a moved pivot (same stop, same end candle) is not a ghost: the existing test "but-bad-h4-01: the trade shown at the entry stays the same although the trend moves the C pivot" (1122-A3.2) keeps its result.

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/xabcd.ts` | The priority loop records each trade that ended before the last candle (key, points, stop, end candle), also from the cache of earlier closes (`endedStore`). `ghost` is skipped with `hidden`. The best recent base is computed at the same place as before; only when it is a ghost, it is computed again without ghosts. |
| `frontend_nextjs/src/lib/formation/abcdChecks.ts` | Ended trades per context (`endedTradesStore`: key → points, stop, time of the end candle; only ends before the last candle count). Before a queue candidate gets priority, the other triples of the same entry candle are measured, then `ghost` is checked. The choice without priority is computed again without ghosts when it is a ghost. |
| `frontend_nextjs/e2e/mocked/formation-harmonic-ended-ghost-lib.spec.ts` | New test (@FRM-07), the XAUUSD M15 case, candle by candle and in a fresh context. |
| `frontend_nextjs/e2e/mocked/formation-abcd-ended-ghost-lib.spec.ts` | New test (@FRM-05 @FRM-39), the `bat-buy-h4-01` case. |
| `frontend_nextjs/e2e/fixtures/formation-ghost-xau-rows.ts` | XAUUSD M15 candles 2026-09-25 01:00 to 2026-10-08 05:45 (848 candles, demo prices). |
| `frontend_nextjs/e2e/mocked/formation-but-lib.spec.ts`, `formation-crb-lib.spec.ts` | Two side assertions expected the ghost (see Why). |
| `frontend_nextjs/e2e/fixtures/formation-scan-golden.json` | 25 hashes re-recorded (23 fixture scans, 2 candle-by-candle walks). |

## Why
A first version hid every candidate with the key of the trade shown at the entry and other points ("base frozen" in the strict form). It changed 41 golden hashes and also hid an ended trade with a moved pivot and the same outcome, which the 1122-A3.2 test expects to stay. The final rule hides only a different outcome (other stop or other end) after the shown base ended. This is the case of the request: the ghost had another stop and another state.

Two existing tests asserted the ghost as the expected result:
- `but-buy-h4-02` (FRM-13): "in its place the running sell" (entry 1.32155, 11-13 16:00). The base shown at the entry (X 11-11 16:00, stop 1.32657) ended with TP1 and TP2 in the candle 11-14 08:00. From 11-14 16:00 main showed X 11-03 16:00, stop 1.32942, TP1, running until 11-19. Now the search shows the buy Butterfly of the fixture at 11-19 12:00. The hand-checked states of the buy are not changed.
- `gar-sell-h4-01` (FRM-14): "the search shows a running Crab sell" (entry 184.12, 12-19 08:00). The base shown at the entry (X 12-12 20:00, stop 184.995) ended at breakeven in the candle 12-23 20:00. From 12-24 04:00 main showed X 11-20 16:00, stop 185.786, state "open", verdict valid. Now the search shows the Gartley points of the test at 01-09 08:00 (forming, not valid). The hand-checked assertion "Gartley is not a valid Crab" is not changed.

Blast radius (`hooks/RULES.md` §4.10): 25 golden hashes in 1 file and 2 side assertions in 2 files. The golden is re-recorded in a separate commit of the same PR.

## Verification
- Red first: on main the two new spec files fail (4 tests: the harmonic case shows X 09-28 17:45 at 10-08 05:15 to 06:00, the AB=CD case shows A 10-10 00:00 at 10-16 16:00 and 20:00); on this branch they pass.
- Dump, 110 formation fixtures × GAR, BAT, BUT, CRB, CYP, ABCD, candle by candle from candle 10 (153,780 lines with XAUUSD H1 below), main 76d1d343 against this branch. Ghost check (key with a shown end, later shown with other points and other stop or end): main 106 trades (BUT 59, CRB 45, ABCD 2; 939 scans), branch 0. Lines different: 1,089 in 51 fixtures: 939 lines were a ghost on main (BUT 465, CRB 467, ABCD 7), 150 lines show a different trade on the branch (BUT 107, CRB 43). Each of the 150 is a trade that the search showed at its entry close (rule B check over the full dump: 0 trades shown late, main and branch). GAR, BAT and CYP lines are equal.
- XAUUSD H1, 1560 scans × 6 forms (year data from DEMO account A, read-only): 0 lines different, 0 ghosts on main and branch. XAUUSD M15 and H4, last 1560 scans, BUT and ABCD on main: 0 ghosts.
- `scripts/features/precheck.sh` (all mocked e2e tests, lib specs included): `PRECHECK OK · katalog ok worker ok lint ok tsc ok e2e ok · e2e ran=4264 passed=4264 failed=0 flaky=0 skipped=0` (waited 1613 s for the heavy lock).
- Cost, cold `scanFormations` (all forms), XAUUSD, 10 moments as in 2026-11-23-harmonic-base-freeze, each 3 times, main and branch in random order, the value of a moment is the smallest of the 3, D1 made from H4 by UTC day. Load average 6.2 at start, 5.6 at end. The full view of all forms at the 10 moments is equal on main and branch (both sets, 0 lines different).

| Timeframes | Version | Median | p90 | Worst case (moment) |
|---|---|---|---|---|
| D1 + W1 + H4 + H1 | main (76d1d343) | 1.19 s | 1.99 s | 2.08 s (11-10 00:00) |
| D1 + W1 + H4 + H1 | this change | 1.17 s | 1.96 s | 2.12 s (11-10 00:00) |
| H4 + H1 + M15 | main (76d1d343) | 9.81 s | 12.87 s | 13.44 s (09-18 20:00) |
| H4 + H1 + M15 | this change | 9.71 s | 12.16 s | 13.10 s (10-27 23:00) |

- Live check, DEMO account A, read-only (`e2e/live/formation-history.spec.ts`, XAUUSD H1, 1560 scans, step 1, 2026-08-20 06:00 to 2026-11-24 03:00): 0 violations; `endNeverShown` main/context 0/14; `vanishedOutsideWindow` running/finished 2/3 (running: M15 BUT 1, M15 CRB 1). Case 1 of 2026-11-23-history-scan-blind-spots (M15 BUT buy, X 09-28 17:45, stop 4027.21) is the ghost of this entry and is no longer counted.

## Open points
- [ ] An ended trade with the base shown at the entry can come back as the choice without priority with its end (same points, same stop). The fixture dump counts 17,513 such scans on the branch (17,325 on main); XAUUSD H1 2,130 on both. This is not changed here; it is a question for 1120-A42.1 ("the end shows one time").
- [ ] The two remaining running cases of `vanishedOutsideWindow` on M15 (BUT and CRB sell, X 10-29 23:00) are not examined here.

## Lessons
A trade key without stop and points cannot tell two bases apart after the shown one ends. A check that compares only the key with the key shown at the entry must also compare the outcome when the shown base is gone.
