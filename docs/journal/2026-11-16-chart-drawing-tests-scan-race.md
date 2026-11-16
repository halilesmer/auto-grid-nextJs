---
date: 2026-11-16
author: Claude
type: fix
status: open
pr: [574, 579, 582]
features: [UI-27, UI-28, UI-29, ANA-17]
areas: [tests, chart]
---

# Chart drawing tests: race with the formation search

## Request
On 2026-11-16 more than one session waited for the heavy lock (SYS-11). The owner asked for the cause and for a fix of each problem.

## Cause

Symptoms:

| Where | What |
|---|---|
| `main` CI, run 43773614864, "Frontend e2e (1/4)", attempt 1 | UI-27 (`chart-fib-unsaved.spec.ts:84`) failed 2 times. UI-29 and ANA-27 were flaky. |
| Same run, attempt 2 | ANA-27 (`chart-older-heavy.spec.ts:29`) failed 2 times. UI-27 and UI-29 were flaky. |
| The 5 green `main` runs before | UI-27 and UI-29 were not flaky. ANA-27 was flaky 1 time (after PR 570). |
| Local `precheck.sh` of a different branch | UI-27, UI-28, UI-29 and ANA-27 failed. |
| Idle Mac, the 4 spec files, 3 repeats | UI-28 failed 3 of 9 times. UI-27, UI-29 and ANA-27 passed. |

The heavy lock had no defect. One run held it and made progress. One ticket was in the queue. The sessions waited in a chain: a coordinator for its session, the session for its precheck, a different session for the lock.

How the root cause was found:

| Step | Result |
|---|---|
| Trace of a failed UI-28 run | All `/rates` answers were there 1.4 s before the first click. Missing chart data was not the cause. |
| Code | `ChartWorkspace.tsx` opens the context menu and the Fibonacci window only for `hoveredId()`. `lightweight-charts-drawing` calculates the hover on each `pointermove`, without a delay. |
| Temporary test with an event log, 16 runs | 1 failure. The page got each mouse event. The cursor stayed `crosshair`, and a second right click 1 s later also opened no menu. |
| Same test with a time line of `data-scan-ms`, 50 runs | Search finished before the first click of the drawing: 48 of 48 passed. Search finished between the 2 clicks: 2 of 2 failed. |
| Temporary test that holds the M15 request of the search, 5 runs | After the search finished, the pixel row of the 50 % level did not hit the drawing. The stored points (time, price) did not change. |

Root cause: the tests draw a Fibonacci retracement with 2 clicks at fixed pixels. Then they click at a fixed pixel on the drawing. They did not wait for the formation search. When the search finishes, the chart changes its price scale. The drawing keeps its time and price, but its pixels change. The fixed pixel then misses the drawing.

The time of the search depends on the speed of the machine and of the app. This explains failures that come and go.

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/chart-ready.ts` | New. `chartReady(page)` waits for `data-bars` on the chart, for `data-scan-ms` on the chart page, and then for 2 animation frames, to give the chart time to draw the new scale (this time was not measured). |
| `chart-drawing-menu.spec.ts`, `chart-fib-unsaved.spec.ts`, `chart-fib-settings.spec.ts`, `chart-fib-text-opacity.spec.ts`, `chart-floating-bar.spec.ts` | `drawFib` calls `chartReady(page)` before it selects the tool. |
| `chart-fib-unsaved.spec.ts`, `chart-floating-bar.spec.ts` | `chartReady(page)` after `page.reload()` and before the next click on the drawing. In `chart-floating-bar.spec.ts` it replaces a wait of 1500 ms. |
| `chart-fib-hit.spec.ts` | `chartReady(page)` replaces the wait for `data-bars` only. |
| `.claude/rules/tests.md`, `hooks/RULES.md` §4.17 | New rules (the owner asked for them on 2026-11-16). |
| `ChartCore.tsx`, `drawingBusy.tsx` (1116-B1) | The widening of the price axis waits while a drawing tool is active or the main button is pressed on the chart, then the last value applies. A right click does not count and a context menu, `pointercancel`, a move without a held button and window `blur` end a press. |
| `chart-floating-bar-templates.spec.ts` (1116-B1) | `chartReady(page)` after `page.reload()` in the test of the old Fibonacci templates (UI-29, line 100). It failed 2 times in the CI of PR 579 (first try and retry): the drawing is set at fixed pixels, and now the axis change comes after the tool ends. 12 of 12 passed after the change (2 tests, 6 repeats). |
| `chart-toolbar.spec.ts` (1116-B1) | `chartReady(page)` after `page.goto` in the test "Mehrere ausgewählte Zeichnungen…": it clicks the drawn lines at fixed pixels. |
| `chart-floating-bar-templates.spec.ts` (1116-B1) | `ready()` now calls `chartReady(page)` (it waited for `data-scan-ms` only, without the 2 frames). |
| `chart-scan-scale-tool.spec.ts` (1116-B1) | New, ANA-17. Red before the fix, green after (see Verification). |

## Why

- 1116-B1: the widening of the price axis waits during drawing instead of being removed, because the axis must reach the levels of the formation. If a tool stays selected for a long time, the widening comes only when the tool ends. This limit is accepted.
- 1116-B1: the search also adds the running candle (`runningBar`). The library then shifts the view by one candle to the left (measured: 0.32 px with all 3547 candles in view; about one candle width when zoomed in). This is the usual behavior of a new candle and is not changed.
- 1116-B1: the fix widens the race window of tests that draw at fixed pixels. Before, a search that ended while a tool was active changed the scale at once; when it ended before the first click, both points were set on the new scale and a later click at a fixed pixel still hit the drawing. Now the change waits for the end of the tool, so a search that ends at any time between the selection of the tool and the end of the drawing changes the scale right after the drawing. Measured on UI-29 (`chart-floating-bar-templates.spec.ts:100`, old version without `chartReady`, `--repeat-each=8`, same Mac, load average 4.67 at the start of the arm with the change and 8.94 at the start of the arm without it): with the `ChartCore.tsx` change 8 of 8 failed, with the `origin/main` version of `ChartCore.tsx` 1 of 8 failed. In the CI of PR 579 the test failed on the first try and on the retry.
- 1116-B1: audit of the specs that choose a drawing tool on `/chart` (grep for `tool-`, `rail.lines`, `rail.fib`, `cw.tool.`; the files with `chartReady` before: the 8 of the first PR). Needs `chartReady`, added: `chart-toolbar.spec.ts` (last test, clicks drawn lines at fixed pixels) and `chart-floating-bar-templates.spec.ts` (UI-29, line 100). Does not need it: `chart-toolbar.spec.ts` other tests (they select drawings through the rail buttons and the dialog, not through pixels), `chart-workspace.spec.ts` "Zeichnen, Rückgängig…" (reads the drawing through the dialog), `chart-trend-menu.spec.ts` "Bei aktivem Zeichenwerkzeug…" and `chart-indicator-menu.spec.ts` (tool active, no drawing exists; the RSI and trend lines are searched at the time of the click and the RSI pane has its own scale), `tools-grid-risk.spec.ts` (other page). `chart-floating-bar-templates.spec.ts` test 1 already waits and its `select()` searches 72 px up and down.

The tests wait for a signal that the app already gives. Some tests in `chart-toolbar.spec.ts` and `chart-floating-bar-templates.spec.ts` used the same signal before. A longer fixed wait was rejected: it only moves the race. A retry of the gesture was rejected: it does not help when the first click of the drawing is before the change of the scale.

The limit of ANA-27 (8 s for each page) did not change. A different session examined the time of ANA-27 since PR 570 and corrected the cause in PR 575 (see the open points). A higher limit hides a slower chart.

The app did not change in the first PR (574). The change of the view was fixed later in the PR of 1116-B1 (open point about the view, below).

## Verification

| Check | Result |
|---|---|
| UI-28 before the change, same Mac | 3 of 9 failed |
| The 6 changed spec files, 6 repeats, under the heavy lock, load average 6 to 13 (without the 2 frames) | 174 of 174 passed |
| The 6 changed spec files, 4 repeats, load average 17 to 30 (with the 2 frames) | 116 of 116 passed |
| `npx tsc --noEmit`, `npx eslint` on the changed files | no output |
| `scripts/features/precheck.sh` | FEHLER. Catalog, worker, lint and tsc were ok. e2e: 3789 of 3799 passed in 55.7 min (usual: 15 min). The 10 failures were timeouts of 30 s in 5 files that the branch did not change (`formation-prefs-draft-lib`, `spread-guard`, `system`, `test-scripts-lib`, `tools-grid-risk`). The load average was 158 at the end of the run. |
| The same 5 files alone, under the heavy lock, load average 32 to 40 | 34 of 34 passed |
| The last `tests.yml` run on `main` for these 5 files (RULES §4.17) | green (they are not in "Frontend e2e (1/4)", the only job that failed) |
| 1116-B1: `chart-scan-scale-tool.spec.ts` (2 tests) before the fix | red (the second click got another price) |
| 1116-B1: the same spec after the fix, `--repeat-each=10`, under the heavy lock | 20 of 20 passed |
| 1116-B1: the 6 Fib specs after the fix | 29 passed |
| 1116-B1: `npx tsc --noEmit`, `npx eslint` | no output |
| 1116-B1: `scripts/features/precheck.sh` | FEHLER in 2846s (Sperre 5009s gewartet) · katalog ok (1s) worker ok (321s) lint ok (39s) tsc ok (7s) e2e FEHLER (2478s) · e2e ran=3801 passed=3796 failed=5 flaky=0 |
| 1116-B1: the 5 failed tests alone | FRM-30: 1 of 1 passed. ANA-03 (`analysis.spec.ts:219`): 3 of 3 passed. ANA-27 (`chart-older-heavy.spec.ts:29`, `:95`) and ANA-19 (`chart-workspace.spec.ts:103`): see the next row |
| 1116-B1: ANA-27 and ANA-19, `--repeat-each=3`, with and without the `ChartCore.tsx` change | With: 5 failed, 7 passed (ANA-27:29 2 failed, ANA-27:95 1 failed, ANA-19 2 failed). Without: 4 failed, 5 passed (ANA-27:29 3 failed at 1.4 to 1.5 min, ANA-19 1 failed at 26.4 s, passed at 19.2 s and 14.7 s, ANA-27:95 0 failed). Load average 10.41 at 13:18, 21.02 at 13:45. Not measured: the times of the arm with the change (output cut), the load at the start and end of each run. Reading (inference, not measurement): the load causes ANA-27:29 and ANA-19, because they fail without the change too. The 1 of 3 against 0 of 3 of ANA-27:95 is too small to show a difference; the same test was flaky in a precheck of a branch without the change. The check is made on the CI times after the merge |
| 1116-B1: UI-29 old test (without `chartReady`), `--repeat-each=8`, load average 4.67 / 8.94 at the start of the arms | With the `ChartCore.tsx` change: 8 of 8 failed. With the `origin/main` version: 1 of 8 failed |
| 1116-B1: after the `chartReady` changes: `chart-floating-bar-templates.spec.ts` and `chart-toolbar.spec.ts`, `--repeat-each=6`, under the heavy lock, load average 17.09 at the start and 72.23 at the end | 78 of 78 passed |
| 1116-B1: first CI run of PR 579 (run 43869966669, "Frontend e2e (1/4)") | red: UI-29 (`chart-floating-bar-templates.spec.ts:100`) failed on the first try and the retry; `chart-dock-formation.spec.ts:95` was flaky; `settings-osc-scope.spec.ts:86` and `:101` were flaky in the same run (not changed by this branch). ANA-27 `:29` 34.9 s |
| PR 574: CI of the PR and the run on `main` after the merge (run 43832842813, `9a051ade`) | green |
| PR 579: last CI run of the PR (run 43874293527) | green, no retry and no flaky test |
| PR 579: test times in that run against the 3 runs on `main` before it (43836250040, 43850002630, 43858219661), all on the first try | ANA-19 `chart-workspace.spec.ts:103`: 19.3 s against 15.1 / 19.3 / 17.1 s. ANA-19 `:386`: 26.9 s against 23.9 / 28.0 / 24.4 s. ANA-27 `chart-older-heavy.spec.ts:29`: 33.4 s against 45.9 / 34.1 / 37.9 s. ANA-27 `:95`: 29.0 s against 38.5 / 27.5 / 32.1 s. No test was slower than on `main`. This is one run. |
| PR 579: run on `main` after the merge (run 43876765164, `05528bbb`) | red: UI-17 `chart-dock-formation.spec.ts:95` failed on the first try and on the retry (see the open points) |
| PR 581 (correction of that test): CI of the PR (run 43902743522) | green; `chart-dock-formation.spec.ts:95` passed on the first try (5.1 s) |

## Open points
- [x] The view changes when the formation search finishes (1116-A7.1, fixed in the PR of 1116-B1). A user who draws in the first seconds sees the chart move, and the second point goes to the new view.
  - Cause (measured with a temporary test that exposed the chart; four runs, each candidate switched off in turn): when the search ends, `hit` goes from none to a formation, so `priceRange` (`OneChart.tsx:270`, `drawingPriceRange`) goes from `null` to {94.69, 109.61}. The `autoscaleInfoProvider` in `ChartCore.tsx` then widens the price axis to the levels of the formation. The axis went from 101.77/93.66 to 117.38/91.48 (range x3.2), and the same price moved 135 px down. With the `priceRange` effect switched off the axis did not change (0 px). Scale margins (`marginsFor`) and `focus` have no part in it.
  - Fix: while a drawing tool is active or a pointer is pressed on the chart, the widening waits; when the user is free, the last value applies (`null` too). Files: `ChartCore.tsx`, `drawingBusy.tsx`. Test: `e2e/mocked/chart-scan-scale-tool.spec.ts` (ANA-17), red before the fix (98.317 against 106.345 for two points on one pixel row), green after.
  - The widening itself stays: the levels of a formation can lie outside the candles on purpose.
- [x] ANA-27 takes 1.2 to 1.6 min since PR 570 (before: 47 s). A different session corrected the cause in PR 575 (merged 2026-11-16 09:02 UTC): in the standard mode the indicator series keeps its identity. After PR 575 the 2 tests of ANA-27 took 27.5 to 45.9 s in the 3 runs on `main` (see Verification).
- [x] `chart-toolbar.spec.ts`, `chart-indicator-menu.spec.ts`, `chart-workspace.spec.ts`, `chart-trend-menu.spec.ts` and `chart-floating-bar-templates.spec.ts` also use pointer gestures on the chart. They did not change in PR 574: no failure was measured, and some of them wait for the search. PR 579 examined them (see Why): 2 tests got `chartReady(page)`, the others do not click a drawing at a fixed pixel.
- [x] `main` was red from 2026-11-15 23:31 UTC to the second attempt at 2026-11-16 06:32 UTC. No session saw it: after the merge of a PR no session looked at the run on `main`. Since 2026-11-16 the mod `pr-izleyici` also monitors the `tests.yml` run of the merge commit on `main` (1116-A8.3; `hooks/RULES.md` §1.8, `~/.claude/rules/pr-izleme.md`). The mod is not in this repository; its 25 tests passed. A session that started before the change of the mod runs the old version, so the merges of PR 576 and PR 579 had no monitor. First live record: after the merge of PR 581 (2026-11-16 16:22 UTC) the mod wrote the file for the merge commit `a72b59f3` into `~/.claude/pr-izleyici/main-watch/`. Not seen live: the wake-up after a failed run, and the takeover by a different session.
- [x] Local `precheck.sh` runs Playwright without a retry. CI uses 1 retry. A flaky test fails the local run and passes in CI. Corrected in PR 576 (1116-A8.4, journal `2026-11-16-precheck-retry-like-ci`).
- [x] The Mac was slow on 2026-11-16: the e2e step of `precheck.sh` took 55.7 min. Correction: the first version of this entry said that `mobileassetd` used 85 % of one core for 11 hours. That was wrong. The 85 % was a value of one moment; the process used 3 min 55 s of CPU time in 11 hours. Measurement (1116-A10.1, read-only, one `precheck.sh` run at a time):
  - Largest cause: the load of the run itself. 3 Playwright workers and their Chromium processes used approx. 412 % CPU on 8 cores; the load average was 156, then 78, then 20 during one run.
  - Second cause: the wait for the heavy lock (1101 s in the measurement, 2315 s and 5009 s later that day).
  - Possible, not shown: other load at the same time (Google Chrome 35 to 45 %, `ecosystemd` 21 to 25 %, `ecosystemanalyticsd` 18 to 22 %).
  - Not a cause: `mobileassetd`, the dev server, the disk. Spotlight used 2 to 3 % on average; `.next` and `test-results` are not in its index.
  - Memory: swap 3.1 of 4.1 GB in use during the measurement, 4.6 of 6 GB at 11:03 UTC. The effect of the swap on the test times was not measured.
  - Not explained: the run of 55.7 min.
  - The owner decides: run feature runs (`run.sh <ID>`) under the heavy lock too; try 2 Playwright workers; close Google Chrome during heavy runs.
- [x] UI-17 `chart-dock-formation.spec.ts:95` made `main` red after PR 579 (run 43876765164). In the first 4 CI runs with the change it failed in 3 of 6 attempts; in 9 runs without the change it passed on the first try. The layout was correct: the test measured at a fixed time (800 ms), and with PR 579 the result of the search came earlier, so the measurement was in the `margin-left` animation of the package. Corrected in PR 581 (journal `2026-11-16-dock-row2-gap-after-axis-defer`). The test was flaky in the first CI run of PR 579; the coordinator saw it and did not compare it with `main` (see Lessons).
- [ ] FRM-30 ("Zwei Tabs lösen nur eine Suche aus", `formation-page.spec.ts`) is flaky on the loaded Mac: it failed in a full `precheck.sh` (8 calls, 4 expected) and in 1 of 3 runs alone, on a branch that did not change application code (PR 576). It also failed on the first try and on the retry in a `precheck.sh` run of a branch with documents only. The cause is not known. 2 tabs share 1 search through a Web Lock (`FormationScanRunner.tsx`); 8 calls show that the second tab got the lock for a moment. No link to the price axis or the running candle was seen.
- [ ] ANA-19 `chart-workspace.spec.ts:386` takes 23.5 to 28.0 s in CI (9 runs on `main`, 2026-11-15 and 2026-11-16, each on the first try); the limit is 30 s. It failed with a timeout on the loaded Mac, also with the code of `main`. It was this slow before PR 570 too (23.5 s and 25.8 s).
- [x] ANA-19 `chart-workspace.spec.ts:103` fails on the Mac in some runs; in CI it passes on the first try (15.1 to 19.6 s). The failure is not a timeout: the range is different by 1 candle (3600 s). PR 579 is not the cause. Measurement (a temporary copy of lines 103 to 141 with a sampler for each animation frame, 10 runs for each arm, under the heavy lock, load average 16 to 7): `main` 2 of 10 failed, `ChartCore.tsx` from before PR 579 3 of 10 failed, each time in line 141.
  - Cause: in the 5 failed runs the running candle of the formation search came approx. 60 ms after the first fit of the chart (for example at 991 ms; first fit at 932 ms). The library then moved the view by 1 candle, and the first candle left the view (`…268800,…852000` became `…272400,…855600`). In the 15 passed runs the running candle was there at the first draw. The test reads `fitRange` from the moved view; the "fit" button then gives a different range.
  - `chartReady(page)` does not help: the move comes approx. 800 ms before `data-scan-ms`, and the view stays moved.
  - Effect for the user: after the page opens, the view can move by 1 candle, and "fit" shows a different range. In 1 loaded `precheck.sh` run the test failed in line 135: a range was stored although the user did not zoom, so the next visit opens a fixed window, not "all". This was not seen in the 20 runs. Assumption, not measured: `rememberChartView` (`runtime.ts`) stores the move when the change of the candle count comes in a separate event.
  - Not changed. A possible correction is in the application: when the view is "all" (no stored zoom) and the running candle comes, fit again. This changes visible behavior, so the owner decides (1116-A28.1). A comparison with a tolerance in the test was rejected: it makes the test weaker.
  - Correction of an earlier reading in this entry (Verification, row "ANA-27 and ANA-19, with and without the `ChartCore.tsx` change"): the load is not the cause of the ANA-19 failures.
  - Fixed in the application (1116-A28.1, journal `2026-11-16-chart-refit-on-running-candle`): when the view shows all candles, the chart fits again after the running candle is added. This replaces the sentence in "Why" (1116-B1) that the move by one candle stays. The stored range without a zoom of the user was reproduced and is fixed too.
- [ ] `settings-osc-scope.spec.ts:86` and `:101` (USR-17) were flaky in one CI run (43869966669). Not examined.

## Lessons
A red test on the chart is not always a slow machine. Find the event that changes the picture, and wait for it. When a precheck fails in a test that the branch did not change, read the last run on `main` first.

A fix that moves the time of a change in the picture can make a different test fail. When the local check is red because of the machine, compare each test in the CI run of the PR with the runs on `main` (first try or retry, time) before the merge, not after it. A test that is flaky in the CI run of the PR and was not flaky on `main` is a finding of that PR until the comparison shows a different cause.

One feature ID can be on more than one test. Name a test by its file and line, not by its ID only: on 2026-11-16 the CI times of ANA-19 `:386` were used for ANA-19 `:103`.
