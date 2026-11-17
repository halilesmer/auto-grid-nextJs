---
date: 2026-11-18
author: Claude
type: diagnosis
status: open
pr: []
features: [SYS-11]
areas: [tests, scripts]
---

# Heavy lock for single-feature runs and 2 or 3 Playwright workers: measurement and advice

Question of the owner (1116-A30.2): (1) Should `run.sh <ID>` run under the heavy lock too? (2) Should Playwright use 2 workers instead of 3? Task: measure and advise. No default was changed: `playwright.config.ts`, `heavy_lock.sh` and `scripts/features/*` are the same as before.

## Method

- Mac with 8 cores, 16 GB. Every run was under `heavy_lock.sh` (one at a time), except the single-feature run in the "next to a big run" test.
- Subset for the worker test: `e2e/mocked/chart-d*`, `chart-f*`, `chart-i*` = 173 tests. Retries are off, so "failed" means "failed on the first try".
- The load average (1 min), swap use and top processes were recorded at the start, every 10 s and at the end of each run. Other sessions ran on the Mac at the same time, so each result shows the load at its start.
- Round A ran on 2026-11-17 on a busy Mac (load 8 to 55 at the start, one run had a mean of 114). Round B ran on 2026-11-17 night with a calm Mac (load 2.5 to 18 at the start). Round A is marked noisy. Order: 2, 3, 3, 2, 2, 3 in both rounds (the planned reversed order for round B did not apply; the order was the same).
- The single-feature test used a second worktree, because two runs in one checkout share the build folder.

## Result 1: Playwright 2 or 3 workers (173 tests)

| Run | Workers | Time | Load at start | Mean / max load in the run | First-try failures |
|---|---|---|---|---|---|
| B1 | 2 | 227 s | 2.5 | 7.1 / 10.5 | 0 |
| B4 | 2 | 236 s | 12.5 | 8.6 / 12.5 | 0 |
| B5 | 2 | 247 s | 6.3 | 11.4 / 20.6 | 0 |
| B2 | 3 | 211 s | 9.9 | 16.0 / 21.5 | 0 |
| B3 | 3 | 206 s | 17.8 | 18.0 / 25.7 | 0 |
| B6 | 3 | 224 s | 10.4 | 12.7 / 16.2 | 0 |
| A1 (noisy) | 2 | 550 s | 55.6 | 114 / 220 | 0 |
| A4 | 2 | 354 s | 30.2 | 20.5 / 30.2 | 0 |
| A5 | 2 | 472 s | 15.2 | 12.3 / 18.0 | 0 |
| A2 | 3 | 394 s | 23.4 | 27.7 / 35.2 | 0 |
| A3 | 3 | 436 s | 28.5 | 35.7 / 62.0 | 0 |
| A6 | 3 | 404 s | 8.7 | 15.8 / 22.5 | 4 |

- Round B (calm): 2 workers mean 237 s, 3 workers mean 214 s. 3 workers are 10 % faster (23 s). The mean load in the run is 9.0 with 2 workers and 15.6 with 3.
- Round A (busy, A1 without weight): 2 workers 354 s and 472 s, 3 workers 394 s, 436 s and 404 s. No clear difference; the load of other sessions is larger than the effect.
- Swap was 7.9 to 9.8 GB in use in all runs (the swap file was 9 to 11 GB). It did not fall between runs. No run stopped because of memory.
- First-try failures: 2 workers 0 of 6 runs, 3 workers 1 of 6 runs (A6: 4 tests: the content of row 2 of the dock, UI-27 visibility of `months`, UI-19 case 3, and the setting "Linienmenü"). A6 started at load 8.7 and had a mean of 15.8, so it was not the busiest run. One run in six is too few to say that 3 workers cause it.
- Wait for the lock (round A, from queue to start): 13 min, 84 min, 3 min, 0, 4 h 26 min, 0. Each wait is longer than the whole difference between 2 and 3 workers over many runs.

## Result 2: single-feature run (`run.sh UI-12`, `run.sh ENG-05`)

| Run | Time | Load at start | Mean / max load |
|---|---|---|---|
| ENG-05 alone (unit only) | 30 s | 8.7 | 8.4 |
| UI-12 alone, 1st / 2nd / 3rd | 16 / 17 / 17 s | 7.7 / 26.9 / 30.4 | 7.3 / 25.2 / 28.3 |
| UI-12 next to a big run, 1st / 2nd / 3rd | 92 / 89 / 82 s | 26.8 / 24.5 / 23.9 | 45.6 / 48.9 / 23.7 |
| Big run (3 workers, 173 tests) next to UI-12 | 248 / 245 / 241 s | 7.4 / 24.5 / 26.3 | 34.7 / 46.9 / 22.4 |

- UI-12 has 1 e2e test. It adds no visible load alone (mean load does not change from its start).
- Next to a big run it takes 5 times as long (82 to 92 s against 16 to 17 s). It passed every time.
- The big run took 241 to 248 s (mean 245 s) with a single-feature run next to it, and 206 to 224 s (mean 214 s) alone in round B: +14 %. The start loads differ (7 to 26 against 10 to 18) and run 2 had a peak of 95 from another session. So +14 % is an upper estimate, not a clean value. No test failed in the three runs.
- Not measured: a feature with many e2e tests (for example a category such as `ZON`, which already uses the lock) and a `run.sh <ID>` at the same time as a full precheck.

## Advice (no change made)

1. **Single-feature runs: no heavy lock.** A run of 16 to 30 s that waits 3 min to 4.5 h for the lock costs more than the 5 to 14 % it adds to a big run. The measured damage is small and the lock wait is large. Keep the rule in `run.sh` ("one feature = no lock"). If a rule is wanted: lock only a single feature with more than about 10 e2e tests, or wait while the load is above a limit. Confidence: medium-low (3 pairs, one light feature, other sessions in the noise).
2. **Playwright workers: keep 3 as default.** On a calm Mac 3 workers save about 10 % of the time and do not make the first try fail more often in a way that we can show (1 of 6 runs against 0 of 6). On a busy Mac the difference is hidden by the load of other sessions. For a run that starts when the load is above about 30, `E2E_WORKERS=2` is allowed by the owner of the run; it was not shown to be better. Confidence: low-medium.
3. The larger cost is the lock wait (up to 4 h 26 min in round A), not the number of workers. If the owner wants less wait, the first action is to find out why one holder kept the lock for so long, not to change the worker count.

What would change the advice:

- Advice 1 changes if 10 or more pairs with a heavy single feature (more than 10 tests) show more than +20 % for the big run or a failure in the big run.
- Advice 2 changes if 10 or more runs per arm at load above 30 show a difference in first-try failures (for example 3 workers fail in more than 3 of 10 and 2 workers in 0 of 10), or if 2 workers are faster at load above 30.

## Open points

- [ ] The owner decides advice 1 and 2. No default was changed.
- [ ] Reason for the lock wait of 4 h 26 min (round A, run A5) is not known. The measurement did not look at the holder.
