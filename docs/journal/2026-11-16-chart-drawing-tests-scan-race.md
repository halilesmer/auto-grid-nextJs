---
date: 2026-11-16
author: Claude
type: fix
status: open
pr: [579]
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

The limit of ANA-27 (8 s for each page) did not change. A different session examines the time of ANA-27 since PR 570. A higher limit hides a slower chart.

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
| CI of the PR and on `main` after the merge | not verified at the time of this entry |

## Open points
- [x] The view changes when the formation search finishes (1116-A7.1, fixed in the PR of 1116-B1). A user who draws in the first seconds sees the chart move, and the second point goes to the new view.
  - Cause (measured with a temporary test that exposed the chart; four runs, each candidate switched off in turn): when the search ends, `hit` goes from none to a formation, so `priceRange` (`OneChart.tsx:270`, `drawingPriceRange`) goes from `null` to {94.69, 109.61}. The `autoscaleInfoProvider` in `ChartCore.tsx` then widens the price axis to the levels of the formation. The axis went from 101.77/93.66 to 117.38/91.48 (range x3.2), and the same price moved 135 px down. With the `priceRange` effect switched off the axis did not change (0 px). Scale margins (`marginsFor`) and `focus` have no part in it.
  - Fix: while a drawing tool is active or a pointer is pressed on the chart, the widening waits; when the user is free, the last value applies (`null` too). Files: `ChartCore.tsx`, `drawingBusy.tsx`. Test: `e2e/mocked/chart-scan-scale-tool.spec.ts` (ANA-17), red before the fix (98.317 against 106.345 for two points on one pixel row), green after.
  - The widening itself stays: the levels of a formation can lie outside the candles on purpose.
- [ ] ANA-27 takes 1.2 to 1.6 min since PR 570 (before: 47 s). A different session examines this.
- [ ] `chart-toolbar.spec.ts`, `chart-indicator-menu.spec.ts`, `chart-workspace.spec.ts`, `chart-trend-menu.spec.ts` and `chart-floating-bar-templates.spec.ts` also use pointer gestures on the chart. They did not change: no failure was measured, and some of them wait for the search.
- [ ] `main` was red from 2026-11-15 23:31 UTC to the second attempt at 2026-11-16 06:32 UTC. No session saw it: after the merge of a PR no session looks at the run on `main`.
- [ ] Local `precheck.sh` runs Playwright without a retry. CI uses 1 retry. A flaky test fails the local run and passes in CI.
- [ ] The Mac was slow on 2026-11-16: the e2e step of `precheck.sh` took 55.7 min. Seen, not measured as a cause: `mobileassetd` used 85 % of one core for 11 hours, and Spotlight indexes the volume of the worktrees.

## Lessons
A red test on the chart is not always a slow machine. Find the event that changes the picture, and wait for it. When a precheck fails in a test that the branch did not change, read the last run on `main` first.
