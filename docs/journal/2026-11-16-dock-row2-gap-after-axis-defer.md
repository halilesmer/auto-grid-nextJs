---
date: 2026-11-16
author: Claude
type: fix
status: open
pr: []
features: [UI-17]
areas: [tests, frontend]
---

# UI-17 right-aligned package test: race with formation search

## Request
After PR 579 (squash `05528bbb`), the `main` run 43876765164 failed in "Frontend e2e (1/4)".
The failed test: `e2e/mocked/chart-dock-formation.spec.ts:95` (UI-17), both attempts, `expect(await gap()).toBeLessThanOrEqual(0.5)`, received `409`.
The coordinator asked for the root cause by measurement, a fix, and a green `main`.

## Cause
Symptom: the test reloads `/chart`, waits a fixed 800 ms (`page.waitForTimeout(800)`), and measures the gap one time.

How it was found:

1. The CI trace snapshots of both attempts show the inline `margin-left` of the formations box: `450px` → `659px` → `250px`.
   The test measured at the start of the change to `250px`. `659 − 250 = 409`, the received value.
2. A temporary measurement spec (not committed) sampled the gap, the box width and the margins in each animation frame for 15 s after the reload.
   It ran in two arms, 10 repetitions each, without and with CPU throttling 4× (CDP `Emulation.setCPUThrottlingRate`):
   - Arm A: `main` (`64acf07b`).
   - Arm B: `ChartCore.tsx` from `05528bbb^`, `drawingBusy.tsx` removed.

Measured sequence (both arms, all runs):

| Phase | Formations box width | Right-aligned margin |
|---|---|---|
| Before the search starts: note `chart.formation.noneTf` | 230 px | large |
| Search runs (`emptyNote` is `undefined`): only the handle | 29 px | larger |
| Search result: buttons (GAR, LIB, OBO) | 392 px | smaller |

When the box gets wider, `layoutRow` (`DockProvider.tsx`) sets the new margin at once.
The CSS rule `.dock-row > .dock-wrap` animates `margin-left` for 0.22 s.
During that animation the right edge is up to 398 px outside the content box (local value; CI: 409 px).
Local sample: the margin went from `659px` to `261px` (398 px). The formations box became 363 px wider (29 → 392 px).
At the same time the timeframes box became 35 px wider (354 → 389 px).

Root cause: the test measures at a fixed time.
The layout settles in both arms. The test fails only when the measurement falls inside the margin animation after the search result.

Measurement (time 0 = the formations box is visible after the reload; "gap episode" = gap > 0.5 px):

| Arm | Throttle | Runs | Fail at 800 ms | Episode start, median (min–max) | Episode length, median (max) | Settled at end |
|---|---|---|---|---|---|---|
| A (`main`) | none | 10 | 0 | 1944 ms (1258–6585) | 228 ms (338) | 10/10 |
| A (`main`) | 4× | 10 | 3 | 2037 ms (1827–3006) | 806 ms (1246) | 10/10 |
| B (PR 579 removed) | none | 10 | 0 | 2853 ms (2120–7581) | 291 ms (436) | 10/10 |
| B (PR 579 removed) | 4× | 10 | 0 | 4070 ms (2725–8709) | 750 ms (1047) | 9/10, see note |

- Note: in 1 run of arm B (4×), the sampler stopped at 15 s inside the animation. This is not a layout that does not settle.
- In 5 of 40 runs the search result came after the 15 s window. These runs show no episode.
- The fixed wait measured at a median of 1.4–2.5 s after time 0 (Playwright latency under load).
- Time from the first candles to the search result, median: arm A 1944 ms / 1974 ms (none / 4×), arm B 2364 ms / 3396 ms.
- Load average during the runs: arm A 49–75, arm B 37–67 (8 cores).

The brief named three possible results: (a) the layout settles in both arms and the change only moves the time; (b) the layout settles much later or jumps visibly only with the change; (c) the layout does not settle with the change.

Result: case (a). The layout settles in both arms. With PR 579 the search result came earlier.
Thus the margin animation moved into the time of the fixed measurement.
In arm B the test passed because it measured before the search result, when the box held only the handle.
Thus the old test did not examine the final layout in most runs.

Not measured: why the search result comes earlier with PR 579.
The difference is in the measurements above, but the cause in `ChartCore.tsx` is not known.

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/chart-dock-formation.spec.ts` | The test waits until `chart-page` has `data-scan-ms` (the search is finished; the buttons come in the same render). Then `expect.poll(gap)` waits until the gap is ≤ 0.5 px (5 s). A new lower limit (gap ≥ −1 px) makes sure that the box is right-aligned. The fixed `waitForTimeout(800)` is removed. |

No application code changed.

## Why
- The layout is correct in both arms. The failure is a race in the test, not a defect in `DockProvider` or `ChartCore`.
- Only `expect.poll(gap)` is not sufficient: before the search result the gap is also 0, and the poll passes before the final layout exists.
- The test waits for the final state (search finished), so it examines the wide box. This is the case that the test protects (journal `2026-11-06-free-package-layout`, UI-17 S5).
- Rejected: wait for the button `formation-form-GAR`. The test then depends on the candidate set of the mock candles. `data-scan-ms` does not (reviewer finding).
- Rejected: a revert of PR 579. The layout is the same with and without PR 579.
- Rejected: no `margin-left` animation in tests. The animation is part of the product.

## Verification
See the PR description for the command output.

## Open points
- [ ] Find why the formation search result comes earlier with PR 579 (measured: arm A median 1944 ms, arm B 2364 ms, without throttling).
- [ ] The right-aligned formations box moves two times while the page loads (note → handle only → buttons). This was also so before PR 579. A design decision is necessary if this movement must stop.
- [ ] The note `chart.formation.noneTf` ("no formations") shows for a short time before the search starts. This was also so before PR 579.

## Lessons
- Do not measure a layout at a fixed time after a reload. Wait for the final state, then poll.
- A test that passes before the data arrives does not examine the final layout. Make the test wait for the data.
- Playwright trace snapshots hold the inline styles. Read them to find a transient value without a new run.
