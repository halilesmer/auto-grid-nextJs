---
date: 2026-11-16
author: Claude
type: fix
status: done
pr: []
features: [ANA-27, USR-17]
areas: [chart, performance]
---

# ANA-27 slow since PR 570: the indicator list got a new identity on each pan

## Symptom
Since PR 570 (USR-17, ef839fc5) the heavy ANA-27 test ("Ältere Kerzen anfügen: Dauer je Seite bleibt unter der Grenze") is slower in the main CI job "Frontend e2e (1/4)":

| Commit | ANA-27 duration (CI) |
|---|---|
| 8a727cdd, fb38895a, b9e970fa (before PR 570) | 46.9 s, 47.0 s, 48.0 s |
| ef839fc5 (PR 570) | 1.6 min (failed), then 57.8 s |
| 6d9b4963 | 1.2 min |
| ce864e25 | 1.4 min and 1.2 min |

Run 43773614864, attempt 2: ANA-27 failed two times with 17454 ms per page (limit 8000 ms).

## Measurement (Mac, one test at a time under the heavy lock)
A temporary copy of the spec recorded every long task, the `PUT /me/prefs` requests and `data-scan-ms`.

| Build | Test duration | ms per page (140000, 152640 bars) | Long tasks (count, sum) |
|---|---|---|---|
| b9e970fa (before PR 570) | 17.2–17.7 s | 711–732, 741–785 | 12–14, 3.3–3.4 s |
| cae54b3e (main) | 25.4–31.1 s | 681–731, 717–774 | 60–79, 11.8–16.1 s |
| fix | 17.0–17.6 s | 708–1124, 738–822 | 14–16, 3.3–3.8 s |

On main each drag added one pair of long tasks (about 260 ms and 70 ms). There were no `PUT /me/prefs` requests, so `setOscStandard` was not the cause. `data-scan-ms` (formation scan): 306–307 ms before PR 570, 267–278 ms with the fix; it was not recorded on main. The scan is not a cause: the fix alone gives back the duration from before PR 570.

On the Mac the time per page did not change; only the drags between the pages got slower. Assumption (not measured on CI): on the slower CI machine the queued long tasks fall into the measured interval (response → drawn), which gives the 17454 ms per page. The CI durations after the merge are the check.

## Root cause
Each pan writes the visible range into the chart document (`visibleTime`, `runtime.ts`). The write keeps `indicators` as the same array.

In standard mode (USR-17, the default) `ChartWorkspace` computes the document with `composeStandard(rawStored, …)` in a `useMemo` that depends on the whole `rawStored`. `composeStandard` builds a new `indicators` array on each call. So each pan gave a new indicator list → `effectiveIndicators`, `paneIndicators` and `paneOrder` changed → the render effect called `renderer.update`, which calculates every indicator again over all bars (RSI and EWO over 150,000 M1 bars).

Before PR 570, `stored` was the document itself, and the list kept its identity when only `visibleTime` changed.

`splitStandard` had the same problem on save (drawings, pane heights): it always built a new product list. `ownDocument` (adds the system RSI to an old document without it) depended on the whole document and had the same effect for such a document.

## Fix
- `oscStandard.ts`: new `standardIndicators(own, std, fallback)`. `composeStandard` accepts the list as an optional fourth argument. `splitStandard` returns the old product list when the other (non RSI/EWO) indicators are the same objects, in any order of the stored list.
- `ChartWorkspace.tsx`: the standard list is a `useMemo` on `rawStored.indicators`, `oscStandard` and the fallback, not on the whole document. `ownDocument` (adds the system RSI to an old document) also depends only on the indicator list.
- New test in `settings-osc-scope.spec.ts` (USR-17): identity is kept when only the visible range or drawings change; a changed indicator gives a new list. Without the `splitStandard` change the test fails (shown on the Mac).

## Not changed
The 8000 ms limit of ANA-27. The USR-17 behavior (`settings-osc-scope.spec.ts`, `chart-pane-heights.spec.ts`).

Final build (after the order-independent `splitStandard` check): `chart-older-heavy.spec.ts`, `settings-osc-scope.spec.ts` and `chart-pane-heights.spec.ts` with `--repeat-each=2` in one worker: 22 passed. ANA-27 there: 19.5 s and 20.1 s, pages 773–901 ms and 1157–1354 ms (other specs ran in the same worker before it).

## Rule for later
A `useMemo` that builds a derived array from a document must depend on the parts it reads, not on the whole document. The chart recalculates all indicators when the array identity changes.
