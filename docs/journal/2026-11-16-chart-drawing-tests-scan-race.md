---
date: 2026-11-16
author: Claude
type: fix
status: open
pr: []
features: [UI-27, UI-28, UI-29]
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
| `frontend_nextjs/e2e/fixtures/chart-ready.ts` | New. `chartReady(page)` waits for `data-bars` on the chart, for `data-scan-ms` on the chart page, and then for 2 animation frames (the chart draws the new scale in the next frame). |
| `chart-drawing-menu.spec.ts`, `chart-fib-unsaved.spec.ts`, `chart-fib-settings.spec.ts`, `chart-fib-text-opacity.spec.ts`, `chart-floating-bar.spec.ts` | `drawFib` calls `chartReady(page)` before it selects the tool. |
| `chart-fib-unsaved.spec.ts`, `chart-floating-bar.spec.ts` | `chartReady(page)` after `page.reload()` and before the next click on the drawing. In `chart-floating-bar.spec.ts` it replaces a wait of 1500 ms. |
| `chart-fib-hit.spec.ts` | `chartReady(page)` replaces the wait for `data-bars` only. |
| `.claude/rules/tests.md`, `hooks/RULES.md` §4.17 | New rules (the owner asked for them on 2026-11-16). |

## Why
The tests wait for a signal that the app already gives. `chart-toolbar.spec.ts` and `chart-floating-bar-templates.spec.ts` used the same signal before, and they did not fail. A longer fixed wait was rejected: it only moves the race. A retry of the gesture was rejected: it does not help when the first click of the drawing is before the change of the scale.

The limit of ANA-27 (8 s for each page) did not change. A different session examines the time of ANA-27 since PR 570. A higher limit hides a slower chart.

The app did not change. See the open point about the view.

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
| CI of the PR and on `main` after the merge | not verified at the time of this entry |

## Open points
- [ ] The view changes when the formation search finishes. A user who draws in the first seconds sees the chart move, and the second point goes to the new view. Measured in the temporary test: the pixel rows that hit the drawing changed from 212–426 to 177–454 at the same x. The selection state of the drawing was different in the 2 measurements, so the size is approximate. The cause in the code is not known (`ChartCore.tsx`: scale margins, `autoscaleInfoProvider`, `focus`). The owner decides if this is a defect.
- [ ] ANA-27 takes 1.2 to 1.6 min since PR 570 (before: 47 s). A different session examines this.
- [ ] `chart-toolbar.spec.ts`, `chart-indicator-menu.spec.ts`, `chart-workspace.spec.ts`, `chart-trend-menu.spec.ts` and `chart-floating-bar-templates.spec.ts` also use pointer gestures on the chart. They did not change: no failure was measured, and some of them wait for the search.
- [ ] `main` was red from 2026-11-15 23:31 UTC to the second attempt at 2026-11-16 06:32 UTC. No session saw it: after the merge of a PR no session looks at the run on `main`.
- [ ] Local `precheck.sh` runs Playwright without a retry. CI uses 1 retry. A flaky test fails the local run and passes in CI.
- [ ] The Mac was slow on 2026-11-16: the e2e step of `precheck.sh` took 55.7 min. Seen, not measured as a cause: `mobileassetd` used 85 % of one core for 11 hours, and Spotlight indexes the volume of the worktrees.

## Lessons
A red test on the chart is not always a slow machine. Find the event that changes the picture, and wait for it. When a precheck fails in a test that the branch did not change, read the last run on `main` first.
