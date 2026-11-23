---
date: 2026-11-23
author: Claude
type: diagnosis
status: closed
pr: [655]
features: [UI-13, UI-17, FRM-07, FRM-08]
areas: [frontend]
---

# UI-17 and UI-13 failed on every run: the formation search became 7 to 10 times slower (PR 647, 648)

## Symptom
- `chart-dock-formation.spec.ts` "Dar pencerede ..." (UI-17) and `chart-layers-menu.spec.ts` "UI-13 Setup 1440 px" failed 3 of 3 on `main`, on the Mac and (UI-17) on the Linux runner of PR 652.
- The page showed `data-scan-runs="0"` and `data-scan-ms=""` after the 7 s default wait: the search had not finished.
- In UI-17 the clock was already fixed (`fakeNow`). The cause was not the clock.

## Measurement
Same set-up in every run: mock candles of D1, W1, H4, H1 and M15, `fakeNow` 2026-11-12T16:21Z, one worker, load below 30. `data-scan-ms` of the page search:

| Commit | scan ms |
|---|---|
| 81f19ca8 (2026-11-20) | 191 to 534 |
| f5f8899d, 018818cf, b7ed7a3b, ce90772f, 7f0f0a3e | 186 to 219 |
| 4836adee (PR 647) | 927 |
| f5618d6c (PR 648) | 2197 |
| ea25bf57 (`main`) | 2629 |

PR 647 and 648 search all bases of the history window (`HISTORY_DAYS`) and test, for every running trade, what the search showed at its entry close (decisions 1122-A3.2, 1121-A1.3). Halil accepted this cost (1122-A31.1, 1122-A41.1). The cost is real: about 136 searches of earlier closes, each measures about 175 bases. 99 % of the measured candidates are trades that have ended and are dropped.

## Change (`xabcd.ts`, behaviour unchanged)
- `historicBases`: the live pivots per time come from a running sweep instead of a filter over all spans for each time. A tuple of five pivots that the previous time already processed is skipped by object identity (it is already in `seen`). Before: 2.73 million key builds for one page search. After: 26 809 (one per base).
- Searches of earlier closes keep the end candle of a finished trade (`endedStore`, only for searches without zones). A later search leaves that trade out and does not measure it again. Fewer measurements: 26 809 to 23 928.
- Result for the page search (USOUSD): 2098 ms to 1391 ms. The target of about 200 ms is **not** reached: the rest is the 136 searches of earlier closes, which measure different bases. A further speed-up needs a different design (for example, keep a result per close and extend it by one candle).

## Proof that the result is the same
- `formation-scan-golden-lib.spec.ts`: one hash of the full `scanFormations` result for each of the 110 fixtures at four times, a candle-by-candle walk over five fixtures of FRM-07 and FRM-39 (bat-sell-h4-01, abcd-breakc-h4-01, gar-buy-h4-01, but-sell-h4-01, crb-buy-h4-01) and three page runs. The recording was made on `main` (3688ac95, after PR 653) before the change. PR 653 changed the AB=CD results on purpose, so a recording from before it did not match.
- The full JSON of `main` and of the new code is identical (`diff -r` of both folders: no difference).
- The recording runs the paths of PR 647 and 648: page runs 135 to 182 running trades and 15 to 17 trade blocks; walks 3 535 to 14 796 running trades.
- Speed guard (work, not time): page runs may build at most 30 000 keys in `historicBases`. Red on the old loop (2 728 622, 1 972 698 and 2 359 653), green on the new one.

## Tests
- UI-13: the wait for the search in `openCard` is 30 s (was 7 s). The search takes seconds on a slow runner.
- UI-17: not changed here. PR 653 adds the same wait to it.
- Not solved: ANA-17 (`chart-scan-scale-tool.spec.ts`) fails 6 of 6 on `main` with a different sign (the price scale does not widen after the search). It is not caused by the scan time. Another session measures it.

## Rule for the next change
A change in `xabcd.ts` or `shownTrade.ts` runs `formation-scan-golden-lib.spec.ts`. New rules change the hashes on purpose: write them again with `GOLDEN_UPDATE=1 KEY_MAX=30000` and say why in the journal.
