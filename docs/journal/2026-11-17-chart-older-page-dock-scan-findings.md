---
date: 2026-11-17
author: Claude
type: fix
status: done
pr: [598, 603]
features: [ANA-27, ANA-19, ANA-17, UI-17]
areas: [chart, frontend]
---

# Four chart findings: second older page, dock package moves, PR 584 guard, earlier scan result

## Request
Step 5 of the coordinator 1117-A2 (test infrastructure: open points). Measure the root cause of five small findings. Separate the causes outside the code from the causes that need code. Fix the code causes in one PR. For visible UI, send a design with options and do not change the code.

1. ANA-27: the chart requests a second older page at once.
2. Dock: the formations package moves two times while the page opens, and the note "no formations" shows for a short time.
3. PR 584 `viewFixPending`: the guard was not examined by a test. Try to reproduce the case.
4. Dock journal: since PR 579 the scan result comes earlier. Find out why. Decide: defect or expected side effect.
5. 1117-A6.3: the toast "scan finished" covers controls. Design only.

## Method
All measurements: Mac, mocked e2e, production build in `.next-e2e` with temporary log lines (`[DBG …]`, not committed) and temporary specs (`zz-dbg-*.spec.ts`, not committed), under the heavy lock (SYS-11), 3 Playwright workers. The build had runtime switches in `localStorage`, so both arms of each comparison ran in the same build and alternated in the same run (same load):

- `__dbgArmB`: the price range effect of `ChartCore.tsx` from before PR 579 (no wait for a drawing tool or a pressed pointer, no `DrawingToolBridge`).
- `__dbgNoFix27`: the ANA-27 fix off (run 2). In run 1 a first switch set the guard `viewFixPending` before `candles.setData()`; it did not change the result (see item 1).
- `__dbgNoGuard`: the `viewFixPending` guard of PR 584 off in `writeLastBar`.

| Run | Content | Result | Load (1 min) |
|---|---|---|---|
| 1 | ANA-27 copy (fix not yet present) ×16, scan timeline arm A/B ×32 (1440 px and 375 px), guard by zoom out ×16 | `64 passed (3.9m)` | 126 → 72 |
| 2 | ANA-27 copy fix on/off ×16, new ANA-27 test ×8, guard after a click ×16 | `40 passed (1.7m)` | 5 → 22 |
| 3 | guard after a click, with and without indicator series ×24 | `24 passed (1.2m)` | 13 → 49 |

## 1. ANA-27: second older page (code, fixed)

Measured sequence (log of the check in `ChartCore.tsx`, M1, "All", fixed clock, the first page held until the drag ended):

| Time (ms) | Event |
|---|---|
| 8877 | check: logical range `20003.8 … 20353.8`, `barsBefore: 3` → second page requested |
| 9011 | `candles.setData()` of the first page starts; the logical range is already `20003.8 …` |
| 9063 | `setData` ends (52 ms) |
| 9313 | view correction: `wanted = shown = 20003`, no change |

Root cause (measured): the request comes before `candles.setData()`, not inside it (correction of journal `2026-11-16-flaky-tests-ana27-ui26-ana20-frm30-usr17`, row "Log of the older-page check"). The indicator series share the time scale and get the new candles first, in the effect of `ChartWorkspace` (a child component; its effects run before the effects of `ChartCore`). The time scale is then 20 000 points longer and reports the moved range. `check()` reads `barsBefore` from the candle series, which still has the old 4 461 candles, and gets 3 instead of 20 003. The guard `viewFixPending` is set only later, in the candle effect.

| Arm | Runs | Older-page requests | Candles added |
|---|---|---|---|
| Code of `main` (run 1, with and without the first switch) | 16 | 2 in 16 of 16 | 40 000 |
| Fix off (run 2) | 8 | 2 in 8 of 8 | 40 000 |
| Fix on (run 2) | 8 | 1 in 8 of 8; the check was skipped once per run (`older-skip stale`) | 20 000 |
| New test `chart-workspace.spec.ts` "Eine Seite pro Zug", fix on (run 2) | 8 | passed 8 of 8 | |

The new test has the same steps and the same count as the "fix off" arm, which got 2 requests in 8 of 8 runs; the test expects 1.

Fix (`ChartCore.tsx`): a layout effect writes the candles of the current render into `incomingPoints` (layout effects run before all effects of the commit, also before the effects of child components). `check()` returns while the candle series does not hold them yet (`pointsRef.current !== incomingPoints.current`). After the candle effect, the check of the effect "a page arrived" runs as before and reads the correct `barsBefore`.

## 2. Dock: the formations package moves (visible UI, design only)

Measured (right-aligned package, 1440 px, code of `main`, 8 runs, sampled in each frame):

| Phase | Package width | Left margin | Time, median (min–max) |
|---|---|---|---|
| First paint: the package slides in from the left (margin animation) | 230 px, note "no formations" | 0 → 458 px in approx. 0.2 s | |
| Note visible | 230 px | 458 px | 659 ms (420–1237) |
| Only the handle | 29 px | 659 px (201 px to the right) | 1757 ms (1542–2623) |
| Buttons | 392 px | 261 px (398 px to the left) | |

There are three moves, not two: a slide-in at the first paint and two width changes.

Root cause of the note (measured and from the code): `OneChart.tsx` passes the note when `scan.loading` is false. `useFormationScan` sets `loading` only when its requests exist (`ready`). Before the question about the search is answered and the chart is ready, the requests do not exist, so the page says "no formation on this timeframe" before any search. In all 8 runs the note went away in the same frame as `scan-requests ready`. When the user answers "No", the note stays, and it is not true either.

375 px (from the code, not measured: the sampler looked for the package of the 1440 px layout): on the phone the formations are a row of their own (`ChartTopBar.tsx`, basis-full, left-aligned, 30 px high). The row does not move sideways; the note shows and goes away in the same way.

A fix changes the visible UI. Design with three options sent to the coordinator: https://claude.ai/artifact/Unzu4nh5NDQtD7YPnvQrS7 (1117-C1.1).

## 3. PR 584 `viewFixPending` guard

Case (from the code): when an older page comes, the effect of the running candle runs in the same commit as the candle effect (both depend on `data`). `writeLastBar` then adds the running candle again. If the view showed all candles, it would call `fitContent()` before the view correction of the next frame; the correction would then move the view by the new candles. The guard `!viewFixPending.current` stops the refit.

Scenario that reaches this case: H1, "All" (4 991 candles, all in view at 1920 px), the M15 request of the search held. A click on the chart (input), then the running candle is released: `writeLastBar` refits, the time scale reports a range, and the check requests an older page (the view is at the left edge). The older page is held, then released.

| Run | Arm | Runs | Older page requested | Running-candle effect inside the correction window | `showsAll` at that time | Refit | View after |
|---|---|---|---|---|---|---|---|
| 2 | guard on / off | 8 / 8 | 16 of 16 | 16 of 16 | `false` in 16 of 16 | 0 | same in both arms: `wanted = shown = 20000`, logical range `20000 … 24991` |
| 3 | with indicator series, guard on / off | 6 / 6 | 12 of 12 | 12 of 12 | `false` in 12 of 12 | 0 | same in both arms |
| 3 | without indicator series and layers (`indicators: []`, RSI off), guard on / off | 6 / 6 | 12 of 12 | 12 of 12 | `false` in 12 of 12 | 0 | same in both arms |
| 1 | zoom out with the wheel at "All" | 16 | 0 of 16 (the view did not change, so no check) | | | | |

Why `showsAll` is already false (measured): another series moves the time scale before the candle series gets the page (also without indicator series: the logical range is `20000 …` before `setData` starts, log `older-skip stale`). `rememberChartView` sees a range change with the old point count and reads it as a zoom of the user (`showsAll = false`, a zoom is stored).

Result: not reproduced. In 40 runs that reached the correction window, the guard did not decide anything: with and without the guard, no refit and the same view. Whether a path exists where `showsAll` is still true in this window is not known. The guard stays (it costs nothing and covers that path if it exists).

Finding, not fixed: after an older page from a view that showed all candles, `rememberChartView` stores a zoom, because the first range change of the other series comes before the candle count changes. The next opening of the chart then shows the stored window, not "All". This is not a request of the brief; it is an open point.

## 4. Scan result earlier since PR 579 (not a defect)

What PR 579 changed in `ChartCore.tsx` (diff `05528bbb`): the price range effect waits while a drawing tool is active or the main button is pressed; it depends on `binding` instead of `candlesRef`; `DrawingToolBridge` and a pointer watcher were added. None of these is in the path of the formation search (`useFormationScan`: four rate requests, a Web Worker, a message back). Before the scan result, both versions apply the price range one time (log: arm A `priceRange-armA apply null`, arm B `priceRange-armB apply null candles=true`).

Measurement (run 1, arms alternated in the same run, 8 runs per arm at 1440 px; time 0 = navigation start):

| Interval, median (min–max) | Arm A (`main`) | Arm B (before PR 579) |
|---|---|---|
| package visible → scan result | 2457 ms (2044–3860) | 1915 ms (1310–2612) |
| first candles → scan result | 1757 ms (1542–2623) | 1403 ms (971–1847) |
| package visible → first candles (PR 579 is not in this path) | 659 ms (420–1237) | 494 ms (339–765) |
| Worker computation (`ms` of the reply) | 783 ms | 713 ms |

The journal of 2026-11-16 measured arm A earlier (1944 ms against 2364 ms); this run measured arm B earlier. The direction changed between two measurements. Arm B was also faster in an interval that PR 579 cannot change (package → first candles) and in the worker computation, which runs in its own thread. Load average was 72 to 126 during run 1; the arms of 2026-11-16 ran one after the other at different load.

Decision: not a defect and not a side effect of PR 579. The difference comes from the load on the Mac and the order of the runs, not from the code. The earlier measurement compared two runs at different times.

## 5. Toast "scan finished" covers controls (visible UI, design only)

Measured by other sessions: on 375 px the toast covers the full-screen button (note 1117 step 4 part B: 15 tries "subtree intercepts pointer events"); on the chart settings dialog it covers "İptal" and "Uygula" (journal `2026-11-17-ana20-legend-shift-ana19-toast`, 4 of 4 clicks). The toast (`animated-toast.tsx`) is fixed at the bottom right (on the phone along the bottom edge), z-index 70, 8 s.

Design with three options sent to the coordinator: https://claude.ai/artifact/Unzu4nh5NDQtD7YPnvQrS7 (1117-C1.2).

## Verification

| Check | Command | Result |
|---|---|---|
| Type check, lint | `npx tsc --noEmit`, `npx eslint` on the changed files | no output |
| Catalog | `update_checklist.py --check`, `run.sh render` | `features.yaml ok (284 Features)`, `FEATURES.md geschrieben: 251/284 abgehakt` (render failed before the FRM-39 correction below) |
| New test, fix line removed (temporary), ×2 | `npx playwright test … -g "Eine Seite pro Zug"` | 2 of 2 failed: `Received length: 2` (two older-page requests) |
| New test, fix, ×8 (run 2) and ×2 | same | 10 of 10 passed |
| Full pre-PR check (one run, before the correction of `chart-older-heavy.spec.ts`) | `scripts/features/precheck.sh` | `PRECHECK FEHLER in 1489s (Sperre 0s gewartet) · katalog ok (0s) worker ok (152s) lint ok (19s) tsc ok (7s) e2e FEHLER (1311s) · e2e ran=3929 passed=3928 failed=1 flaky=0 skipped=0`; failed: `chart-older-heavy.spec.ts:29` (ANA-27), both tries, first page 17 007 ms and 21 238 ms (limit 8 000 ms) |
| ANA-27 heavy test, two arms, ×2 each | fix / fix line removed | fix: 2 of 2 failed (first page 18 580 ms, 17 757 ms); without fix: 2 of 2 passed with only two steps (`140000→1801, 152640→1087`): the first drag brought two pages in one step |
| ANA-27 heavy test with time stamps (temporary copy) | one run, fix | responses at 1 353–1 355 ms (formation search D1/H4/H1/M15), first page response at 11 571 ms, drawn at 12 270 ms (699 ms); the test took 1 353 ms as the answer of the first page |
| After the test correction, ×2 | `npx playwright test e2e/mocked/chart-older-heavy.spec.ts e2e/mocked/chart-workspace.spec.ts -g 'ANA-27\|Dauer je Seite\|Ältere Kerzen' --repeat-each=2` | `14 passed (1.3m)`; pages `120000→970, 140000→1206, 152640→1179` and `120000→1059, 140000→1254, 152640→1001` |
| Reviewer (subagent) | | no critical finding; applied: the red run of the new test with the fix line removed, a comment at the second `pointsRef` effect, this table |

Test correction (`chart-older-heavy.spec.ts`, ANA-27): the test was wrong, not too strict. It took as the answer of a page the first `/rates` response after the previous drawing. The formation search sends four `/rates` requests (D1, H4, H1, M15) and its responses often come after the first load. Before the fix the first drag brought two pages in one step, so the step started at the commit of the first page and the error did not show. With one page per drag, the first step included all drags to the left edge. The test now records only the M1 responses of the chart. The limit (8 000 ms) did not change.

FRM-39 (`features.yaml`, from PR 596): an item of `pruefung` had `: ` and YAML read it as a map; `run.sh render` failed. Changed to ` – ` (the same correction as in PR 584).

Not covered: the full pre-PR check did not run again after the test correction (rule: one run per brief, §4.17). CI runs all mocked e2e tests.

## Open points
- [x] 1117-C1.1: decision on the dock package (design options A, B, C). Owner chose design A ("Üçü de öneri"). Done in PR 603 (`9300a1d3`), desktop only.
- [x] 1117-C1.2: decision on the toast (design options A, B, C). Owner chose design A ("Üçü de öneri"). Done in PR 603 (`9300a1d3`), desktop only.
- [x] 375 px: measure the formations row on the phone after the decision (the layout of `ChartTopBar` changed in PR 595). Not needed now: the phone layout is postponed (Halil, 2026-11-17).
- [x] `rememberChartView` stores a zoom after an older page from a view that showed all candles (item 3, finding). Decide whether "All" must stay "All" in this case.
  - Closed by 1118-A5.1 = B (journal `2026-11-18-chart-view-like-tradingview`): the zoom is not stored, `rememberChartView` is removed. "All" is no mode (1118-A2.1 = B).
- [x] PR 584 guard: a path where `showsAll` is true inside the correction window is not known (item 3).
  - Closed by 1118-A2.1 = B: `writeLastBar` no longer fits again; `showsAll` and the guard in `writeLastBar` are removed. Item 3 of §3 (a click, then an automatic range change, requests a page) is closed by 1118-A3.1 = C.

## Lessons
- A timing test that matches a response by time ("the first response after the last drawing") can take a response of another request. Match the response by its request.
- When two arms of a timing comparison run one after the other, the load of the Mac can change the result and its direction. Alternate the arms in one run, with a runtime switch in one build.
- An interval that the change cannot affect is a control: when it differs as much as the measured interval, the difference is not from the change.
- A log line with the logical range before and after `setData` shows the order of events; an inference from the code can put an event at the wrong place.
