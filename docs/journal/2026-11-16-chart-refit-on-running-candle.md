---
date: 2026-11-16
author: Claude
type: fix
status: open
pr: []
features: [ANA-19]
areas: [frontend, chart]
---

# Chart keeps all candles when the running candle comes

## Request
1116-A28.1: when `/chart` opens, the chart fits all candles. When the running candle of the formation search comes after this first fit, the view moves by one candle and the first candle leaves the view. "Fit" then shows a different range. Fix it: a view that shows all candles stays "all", and the move is not stored as a zoom of the user. ANA-19 `chart-workspace.spec.ts:103` failed on the Mac because of this (journal `2026-11-16-chart-drawing-tests-scan-race`, open points).

## Cause

How the cause was found (measured, temporary spec and temporary log lines in `ChartCore.tsx` and `runtime.ts`, not committed; the spec holds the M15 request of the formation search, which holds back the running candle):

| Step | Result |
|---|---|
| Running candle held for 1 s after the first fit, 3 runs | 3 of 3: the visible range went from `1794268800,1794855600` to `1794272400,1794859200` (the first candle left the view). "Fit" then gave `1794268800,1794859200`. |
| Running candle not held, 3 runs | 3 of 3: the running candle was there before the first fit. The range was `1794268800,1794859200` from the start and did not move. |
| Logical range around `candles.update()` (held arm) | Before: `0 → 115` (116 candles). In the same millisecond as `update()`: `1 → 116`. The library sent the change synchronously, inside `update()`. |
| Library code (`lightweight-charts` 5.2.1, `_internal_updateTimeScale`) | When a new point is added on the right and the last candle is visible, the right offset stays the same (option `shiftVisibleRangeOnNewBar`, default `true`). The window moves by the number of new candles. |
| End of the search (held arm) | The price axis became 2 px wider (time scale width 1126 → 1124 px). The left edge went from `1.0` to `1.206`. `rememberChartView` skips this change (the width changed). |
| A change of the look after this (new test, held arm, 5 runs) | 5 of 5: `visibleTime = 1794272400,1794859200` was stored, although the user did not zoom. The change of the look writes the candles again (`setData`); the next range change has the same point count and width, so `rememberChartView` evaluates it, and a left edge above 1 is "not all". |

Root cause: `ChartCore.tsx` adds the running candle with `candles.update()`. When it comes after the first fit, the library moves the view by one candle (`shiftVisibleRangeOnNewBar`). `rememberChartView` (`runtime.ts`) correctly skips this change (the point count changed), but the moved view stays. A later change of the axis width moves the left edge more, and the next range change that is not skipped (for example `setData` after a change of the look) stores the moved view as a zoom. The next visit then opens a fixed window, not "all".

This explains the 2 failures of ANA-19 `:103`:
- line 141 (the usual failure): the test reads `fitRange` from the moved view; "fit" gives a different range.
- line 135 (seen 1 time in a loaded `precheck.sh`): the test changes the look before line 135. The new test reproduces this: the move, then the wider axis, then a change of the look store a zoom. In the earlier note the cause was an inference; it is now measured.

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/runtime.ts` | `rememberChartView` returns `{ showsAll, dispose }`. `showsAll()` is the result of the last range change that was not skipped (no zoom of the user); the start value comes from `restoreChartView`, which now returns `true` when it fitted all candles. Changes by new candles or a new width do not change `showsAll`. |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | New `writeLastBar`: it writes the running candle (formation search) and the live candle (stream). When the candle is new on the right and `showsAll()` is true, the chart calls `fitContent()` after `update()`. When the user zoomed, nothing changes (the library behavior stays). No refit while the correction of the view after a page of older candles waits (`viewFixPending`). |
| `ChartCore.tsx`, point count for `rememberChartView` | New counter `appendedBars`: the candles that `writeLastBar` added since the last `setData` (running candle and live candle). It replaces `runningCount` in the point count. Before, the live candle did not count, and a second new candle in the same period (a new running or live candle before the candles are loaded again) did not count either: the change by the library was then evaluated as a zoom. |
| `frontend_nextjs/e2e/mocked/chart-running-bar-fit.spec.ts` | New, ANA-19, 3 tests: (1) running candle after the first fit, then a change of the look: the first candle stays in the view, no zoom is stored, "fit" shows the same range. (2) The user zoomed first: the running candle changes neither the view nor the stored zoom. (3) A new live candle from the stream (`live_from` on the current hour): the view keeps all candles, no zoom is stored. |
| `docs/features/features.yaml` | ANA-19: description, `pruefung` and `erwartet` name the running candle. |

## Why

- The fix is in the application, not in the test. A comparison with a tolerance of 1 candle in ANA-19 `:103` would hide a visible defect and the stored zoom. `chartReady(page)` does not help: the move comes before `data-scan-ms`.
- `fitContent()` again instead of `shiftVisibleRangeOnNewBar: false`: with the option off, a new candle on the right would be outside an "all" view, and a view that the user zoomed to the last candle would no longer follow new candles.
- The decision "all or zoom" uses the state of `rememberChartView`, the same rule that decides what is stored. A second rule in `ChartCore.tsx` could disagree with it.
- The refit happens only when `update()` adds a new candle on the right (the time is after the last point, `dataByIndex`). An update of the same candle (each new price) does not refit. After each `setData` the running candle is added again through `writeLastBar` (the series of the request does not hold it). When `setData` added a page of older candles on the left (ANA-27), `ChartCore.tsx` corrects the view in the next frame (`keepViewFrame`); a refit in the same frame would hit that correction and move the view by the new candles. So `writeLastBar` does not refit while `viewFixPending` is set (finding of the review, 1116-A28.1.1).
- The live candle of the stream uses the same path. It has the same move by one candle when a new period starts. This is an assumption about the wish of the owner: the request names the running candle of the search, and "all stays all" is the same rule for both.
- Not changed: a change of the axis width (for example the end of the search, 2 px) still moves the left edge of an "all" view a little (0.2 candle in the measurement). `rememberChartView` accepts up to 1 candle as "all".

## Verification

All runs on the Mac under the heavy lock (SYS-11), mocked e2e, 3 Playwright workers.

| Check | Result |
|---|---|
| Temporary measurement, running candle held / not held, 3 runs each, code of `main` | held: 3 of 3 moved by one candle; not held: 0 of 3 |
| Same measurement with the fix, 5 runs each | held: 0 of 5 moved, range `1794268800,1794859200` = range after "fit", no stored zoom; not held: 0 of 5 |
| New spec, code of `main`, `--repeat-each=3` | test 1: 3 of 3 failed in line 58 (first candle `1794272400`, expected `1794268800`); test 2: 3 of 3 passed |
| New spec, code of `main`, `expect.soft`, `--repeat-each=5` | test 1: 5 of 5 failed in lines 58, 59 (stored zoom `1794272400,1794859200`) and 62; test 2: 5 of 5 passed |
| Test 3 (live candle), code of `main`, `--repeat-each=3` | 3 of 3 failed in line 102 (the first candle left the view) |
| New spec with the fix before the review (tests 1, 2), `--repeat-each=5` | 10 of 10 passed |
| Fix before the review: `chart-workspace.spec.ts` and the new spec, `--repeat-each=10`, load average 4.6 at the start, 15.3 at the end | 319 of 320 passed; ANA-19 `:103` 10 of 10; failed: ANA-20 `:526` 1 of 10 (see the open points) |
| ANA-20 `:526`, code of `main`, `--repeat-each=20`, load average 2.7 to 9.2 | 20 of 20 passed |
| Fix after the review without the `viewFixPending` guard, new spec `--repeat-each=3` | tests 1 to 3: 9 of 9 passed |
| Final code: `chart-workspace.spec.ts` and the new spec, `--repeat-each=10`, load average 2.9 at the start, 27.1 at the end | 328 of 330 passed; ANA-19 `:103` 10 of 10; ANA-20 `:526` 10 of 10; new spec 30 of 30; failed: ANA-27 `:805` and `:815`, 1 time each, in the same repeat, each with 1 candle more than expected (M1) |
| Final code: ANA-27 `:805` and `:815` alone, `--repeat-each=10` | 20 of 20 passed |
| Final code: `chart-scan-scale-tool`, `chart-latest-bar`, `chart-price-scale`, `settings-osc-scope`, `chart-older-heavy`, `formation-page`, `analysis-chart`, `chart-one-chart`, `chart-page` (1 time each) | 216 of 216 passed |
| `scripts/features/run.sh ANA-19` | e2e 22 passed; `results.json` updated. The render of `FEATURES.md` failed on a defect from PR 578 (an item of FRM-39 `pruefung` had `: ` and YAML read it as a map); the item now has `–`, then `run.sh render` and `run.sh check` passed |
| `npx tsc --noEmit`, `npx eslint` on the changed files | no output |
| `scripts/features/precheck.sh` (commit `82102b3e`) | PRECHECK OK in 1715s (Sperre 0s gewartet) · katalog ok (0s) worker ok (152s) lint ok (19s) tsc ok (2s) e2e ok (1542s) · e2e ran=3838 passed=3835 failed=0 flaky=3 skipped=0. Flaky: UI-26 `chart-latest-bar.spec.ts:7`, ANA-20 `chart-workspace.spec.ts:526`, `formation-prefs-draft-lib.spec.ts:8` |
| UI-26 `chart-latest-bar.spec.ts:7` on `main` | failed on the first try and passed on the retry in run 43910686873 (`0979a7f5`, before this change): flaky on `main` too |
| ANA-20 `:526`, 4 alternating arms of 10 runs (code of `main`, fix, code of `main`, fix), same session, load average 9.9 to 26.7 | code of `main`: 4 of 20 failed; fix: 2 of 20 failed. All failures: timeout of 90 s while the test waits for an item of an indicator menu. The flaky test is not caused by this change; it depends on the load |

## Open points
- [ ] PR merged and the run on `main` is green.
- [ ] ANA-27 `:805` and `:815` (M1) failed 1 time each in the same repeat of the 10-times run, each with 1 candle more than the test expected; alone they passed 20 of 20, and on `main` CI they pass on the first try. Inference, not measured: a new M1 candle at a minute boundary (the test expects ±1 only at the first load). The changed code is not on this path: on M1 there is no running candle of the search, and the test sends no live price, so `writeLastBar` does not run.
- [ ] ANA-20 `chart-workspace.spec.ts:526` (indicator menu) fails under load on the Mac with the code of `main` too (4 of 20 at load average 10 to 27; 0 of 20 at 3 to 9). On `main` CI it passes on the first try. The item of the menu does not come after the click on the menu button. Cause not examined.
- [ ] UI-26 `chart-latest-bar.spec.ts:7` failed on the first try and on the retry in the first CI run of this PR (run 43940040316); on `main` it failed on the first try in run 43910686873 (same line 30), and it passed on the first try in the 2 runs before. Locally, alternating arms (code of `main`, fix, 2 × 10 each, load average 5.7 to 10.4): 40 of 40 passed. Measured in the trace of the CI run: the toast "formation search finished" covered the button for 7 s (Playwright retried the click), then the click scrolled the view back, and the view stopped 3 candles before the last candle (`data-visible-range` ended at `1794855600`, the running candle is `1794866400`); the button stays while `scrollPosition() < -3`. Library code (`lightweight-charts` 5.2.1, `TimeScaleInvalidationType.Animation`): each frame sets the right offset only while the animation of `scrollToRealTime` (400 ms) is not finished, so the end position is not applied, and the view stays at the position of the last frame. Inference: the error depends on the time of the last frame, so the test fails at random on `main` too. Not changed in this PR (not caused by it); a possible fix is in `LatestBarButton.tsx` (set the end position after the animation).
- [ ] Not verified by a test: the `viewFixPending` guard (finding 1116-A28.1.1 of the review, from the code). Two attempts to get a page of older candles while the view shows all candles (H1, range "all", 5000 candles, 1600 px) did not send the request for the page: (a) zoom out with the wheel, the library did not change an "all" view; (b) a click on the chart, then the running candle (0 of 3 runs). The cause was not examined. The scenario is an inference from the code.

## Lessons
A move of the chart by one candle can come from the library, not from our code. Read the time scale code of `lightweight-charts` for the event (`shiftVisibleRangeOnNewBar`) before you add a guard in the test.
