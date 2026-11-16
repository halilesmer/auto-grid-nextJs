---
date: 2026-11-16
author: Claude
type: fix
status: open
pr: []
features: [ANA-27, UI-26, ANA-20, FRM-30, USR-17]
areas: [tests, chart]
---

# Five flaky e2e tests: causes measured

## Request
On 2026-11-16 the full pre-PR checks on the Mac failed many times in tests that the branches did not change. Each red run held the heavy lock for 30 to 45 minutes. The owner approved one session for these tests (1116-A35.2): find the root cause by measurement and fix it. A test is not made weaker (no tolerance, no longer timeout, no retry).

The tests: ANA-27 `chart-workspace.spec.ts:805` and `:815`, UI-26 `chart-latest-bar.spec.ts:7`, ANA-20 `chart-workspace.spec.ts:526`, FRM-30 `formation-page.spec.ts:1367`, USR-17 `settings-osc-scope.spec.ts:86` and `:101`.

## Cause

All measurements: Mac, mocked e2e, production build in `.next-e2e` with temporary log lines (`[DBG …]`, not committed) and temporary spec files (`zz-*.spec.ts`, not committed), under the heavy lock (SYS-11), 3 Playwright workers unless the table says otherwise.

### ANA-27 `chart-workspace.spec.ts:805` and `:815`

Symptom: CI run 43944982375 expected `data-bars` 24944 and got 24945, then 44945.

| Measurement | Result |
|---|---|
| Earlier session (note 1116-A28.1, fixed clock, 2 arms, 12 runs): mock clock +60 s between `page.goto` and `page.reload` | 12 of 12: one candle more after the reload |
| This session: temporary copy of `:805` with the fixture of `main`, mock clock +60 s at the reload (`setFakeNow`), 5 runs | 5 of 5 failed: expected `24461`, received `24462` |
| Same with the changed fixture (reads `loaded` after the reload; this copy also held the second page) | 5 of 5 passed |
| Log of the older-page check (`ChartCore.tsx`, `check`), release of the held page at once, 3 runs | 3 of 3: a second older page was requested 150 to 300 ms after the first page. The check that requested it ran inside `candles.setData()` of the first page: the visible logical range was already `20001.7 … 20351.7`, but `barsInLogicalRange` gave `barsBefore: 1`. `viewFixPending` is set only after `setData`, so the guard did not stop it. The check after the view correction gave `barsBefore: 20001` (no request). |
| Same, release 2.5 s after the drag (outside `USER_INPUT_WINDOW_MS` = 1.5 s), 3 runs | 3 of 3: one page only (`3569 > 23569`) |
| A sampler that read `data-bars` every 50 ms after the release, 3 runs | 3 of 3 did not see the value after the first page (`3569 > 43569`): the main thread processed both pages before the next read |

Root cause (measured): the fixture `openNearLeftEdge` (`e2e/fixtures/chart-older.ts`) read `loaded` before `page.reload()`. When the minute changes between the two loads, the reload brings one candle more, and the value `loaded + PAGE` never comes.

Not a cause (measured): `:805` waits for `data-bars = loaded + PAGE`, and the second page (below) makes this value show only for approx. 0.3 s. A copy of `:805` with the new fixture and without any hold of the second page passed 10 of 10 (`toHaveAttribute` saw the value each time). The test does not hold the second page.

The second page is not intended (finding, the application is not changed in this session): the check reads `barsBefore` inside `setData`, where the series still has the old bars and the view is already moved by the new bars. The effect for the user: after a drag to the left edge, the chart loads two pages (40 000 M1 candles) instead of one.

### UI-26 `chart-latest-bar.spec.ts:7`

Symptom: `main` runs 43910686873 and 43948738746 failed on the first try, the first CI run of PR 584 (43940040316) failed on the first try and the retry. After the click, the button stayed (`aria-hidden="false"`).

Library code (`lightweight-charts` 5.2.1): `scrollToRealTime()` starts an animation of 400 ms. In each frame, `TimeScaleInvalidationType.Animation` sets the right offset only while the animation is not finished. The frame after the 400 ms does not set the end position. The view stays at the position of the last frame before it.

| Measurement (log of `scrollPosition()` at each range change, temporary) | Result |
|---|---|
| Normal click, 3 runs | 3 of 3: the last position was −1.03 (not 0); the button went away because −1.03 > −3 |
| A busy main thread for 500 ms, 50 ms after the click, 3 runs | 3 of 3: the last position was −42.08; the button stayed |
| CPU throttling 4×, 3 runs | 1 of 3: the button stayed (last position −1.69 in a passed run, frames 20 to 30 ms apart) |
| New test (busy main thread), code of `main`, 5 runs | 5 of 5 failed (`aria-hidden` stayed `"false"`); the old test passed 5 of 5 in the same run |

Root cause (measured): the end position of the scroll animation is not applied. When the last frame of the animation comes early (a loaded runner skips frames), the view stops more than 3 candles before the last candle, and the button stays.

The toast "formation search finished" (7 s) covers the button: in 8 of 8 measured runs (6 workers) the element on the center of the button was the toast, and the click took 4.5 to 8.3 s (Playwright waits until the button is free). The toast only delays the click. The wrong end position also comes without it (row "busy main thread").

### USR-17 `settings-osc-scope.spec.ts:86` and `:101`

Symptom: CI run 43869966669: both tests failed on the first try at line 91 and line 105: after the click on the RSI visibility button, `data-rsi-visible` stayed `"true"`. `main` run 43948738746: `:101` failed on the first try.

Code: `writeChartPref` (`chartPrefs.ts`) and `change()` (`useUserPrefsStore.ts`) refuse a change of a chart pref before `GET /me/prefs` is loaded (toast `prefs.toast.notloaded`). Before the load, the mode is the default `standard`. The click on the legend changes the standard (`chart_osc_standard`), so the change is refused. In `:101` the mode `product` comes only with the load.

| Measurement (temporary spec, the click with `force: true` right after `chart-workspace` is visible) | Result |
|---|---|
| `GET /me/prefs` answers at once, both modes, 3 runs each | 6 of 6: `data-rsi-visible` became `false` and stayed |
| `GET /me/prefs` answers after 3 s (`userPrefsGetDelayMs`), both modes, 3 runs each | 6 of 6: `data-rsi-visible` stayed `true` for 6 s |
| Copy of `:86` and `:101`, delay 3 s, without a wait for the prefs, 5 runs each | 10 of 10 failed (`data-rsi-visible` stayed `"true"`) |
| Same with the wait for the prefs | 10 of 10 passed |

Root cause (measured): the tests click before the personal prefs are loaded. On a slow runner the load comes after the click, and the app refuses the change (as designed).

### ANA-20 `chart-workspace.spec.ts:526`

Symptom: on the loaded Mac the test fails with a timeout of 90 s while it waits for an item of an indicator menu. On `main` CI it passed on the first try.

| Measurement | Result |
|---|---|
| The test alone, `--repeat-each=10`, 6 workers (load average 7 → 12) | 2 of 10 failed: the items "EWO bölmesine taşı" (line 567) and "Yeni bölmeye taşı" (line 571) did not come |
| Trace of the failure at line 571 (DOM snapshots before and after the click on "RSI işlemleri") | `aria-expanded` of the trigger stayed `"false"` after the click; in the click before it (passed) it went from `"false"` to `"true"`. In the error context the trigger has the focus, so it was not mounted again |
| Temporary log of `pointerdown`, `mousedown`, `pointerup`, `mouseup` and `click` (target and position of the trigger), same run settings | 2 of 10 failed. In both failed runs, `pointerdown` hit the trigger ("RSI işlemleri", "EWO işlemleri") and `pointerup` 10 to 30 ms later hit the next button of the legend row ("RSI göstergesini sil", "EWO ayarlarını aç"); `click` went to the common parent (`workspace-indicator-values`). In one run the trigger moved from x = 208 to x = 234 between the two events. In the 8 passed runs: 0 of 256 presses had different targets |

Root cause (partly measured): the legend row moves to the side between the press and the release of the mouse. The button under the release is a different button, so the browser sends no click to the trigger, and the menu does not open. Not measured: which element of the row changes its width (a candidate is the value text of the legend row). Not fixed: a stable position of the buttons is a change of the visible legend (design first), and a test change would not remove the cause. The effect for the user: a click on a legend button can miss when the row moves at that moment.

### FRM-30 `formation-page.spec.ts:1367`

Symptom: "Zwei Tabs lösen nur eine Suche aus" expects 4 calls of `/rates` for the favorite EURUSD and gets 8. It failed in full pre-PR checks on the Mac; CI passes.

| Measurement (temporary log of `navigator.locks.request` in both tabs, of each EURUSD request with its tab, and of the inputs of the search effect in `FormationScanRunner.tsx`; 6 workers) | Result |
|---|---|
| Lock log, `--repeat-each=10` | 7 of 10 failed with 8 calls. In each failed run, all 8 calls came from tab A. Tab A released the lock and took it again; tab B only waited for the lock |
| Log of the effect inputs, `--repeat-each=10` | 7 of 10 failed. In the failed runs the effect started with `alarmKey: ""`, requested D1, H4, H1 and M15, and then ran again with `alarmKey: "EURUSD"` (all other inputs the same). The second run requested the 4 timeframes again |
| `waitForPass(worker, 1)` | It counts all `/rates` calls (the chart of XAUUSD too), so it does not wait for the end of the first search |

Root cause (measured): `alarmKey` is empty until the personal prefs (`GET /me/prefs`, `personalLoaded`) are loaded. When the favorites search starts before that, the change of `alarmKey` starts the effect again: it stops the running search and starts a new one, which loads the 4 timeframes again. On a fast runner the prefs come first, and the test passes. The second tab has no part in it. The effect for the user: when the prefs come late, the favorites search runs twice after the page opens (4 more calls to the worker).

Fixed in PR C (the coordinator approved it): the favorites search waits until the first read of the personal prefs is finished (`settled` in `useUserPrefsStore.ts`: `ready`, `failed` or `offline`, also the 404 of an old worker). When the read does not start (for example `/auth/me` fails, so `load()` is not called), the search starts after `PREFS_WAIT_MS` (15 s) anyway.

How `/auth/me` is tried (code): `ConnectionSync` runs the connection check when the page opens, every 30 s and on focus, only while the tab is visible; after a good probe it calls `loadMe()` when `me` is empty. A 404 of the worker gives `LEGACY_ADMIN`; another error leaves `me` empty until the next check. Without `me`, `load()` is not called.

Delay of the search when the read fails: with an immediate error, about 4.2 s (retries after 600, 1200 and 2400 ms) plus the time of 4 requests; with requests that hang, the read would take up to 4 × 15 s + 4.2 s, but the search starts after 15 s at the latest.

## Solution

PR A (tests only):

| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/chart-older.ts` | `openNearLeftEdge` reads `loaded` after `page.reload()`, right before the drag. |
| `frontend_nextjs/e2e/mocked/chart-workspace.spec.ts` | `:805` and `:815` are in a new block "M1 mit fester Uhr" with `fakeNow`: the mock gives no new candle during the test. The fixture also checks `data-bars` against `initialBars` after the reload (reviewer finding: the old order checked this indirectly). |
| `frontend_nextjs/e2e/mocked/settings-osc-scope.spec.ts` | `:86` and `:101` wait for the personal prefs (`prefsLoaded`: the key `grid-robot-chart-prefs-owner` in `localStorage`, written in the same task as the prefs) before the click on the legend. |

PR B (application, UI-26): `LatestBarButton.tsx` writes the end position (`scrollToPosition(rightOffset, false)`) 400 ms after `scrollToRealTime()`, when the user did not press, scroll or type in this time. New test in `chart-latest-bar.spec.ts`: a busy main thread for 500 ms during the animation.

## Why

- ANA-27: the fixture now reads the value that the test compares, at the time when it is correct. The fixed clock also removes a new candle from the refresh of the tail (`REFRESH_MS`, 60 s) during the test. The first-load check of the block (`firstLoad`, ±1) stays: the other tests of the block use the real clock. A hold of the second page in the test was tried and removed: without a measured failure it is a guess, and it hides the finding. The finding gets no `test.fail()` test (`hooks/RULES.md` §7.5): it occurs only when the release comes within 1.5 s of the drag, so such a test would pass on a slow runner and fail as "expected to fail".
- USR-17: the app refuses the change before the prefs are loaded on purpose (toast). The test must click after the load. A wait for the `GET /me/prefs` response was rejected: the app applies the response in a later task, and an input event can come first. A retry of the click was rejected: it hides a click without effect.
- UI-26: the fix is in the application, because the view really stops before the last candle (measured −1.03 candles in a normal run, −42 with a busy thread). A larger limit than 3 candles in the test was rejected: it hides the defect. `scrollToPosition` without animation after the animation keeps the animation for the user and only corrects the end.
- ANA-20: no fix without the decision of the owner (visible UI).
- FRM-30: the gate uses `settled`, not `personalLoaded` (the first proposal). `personalLoaded` stays `false` when the read fails, the client is offline or an old worker answers 404; the search would then never start. Rejected: remove `alarmKey` from the dependencies of the effect (the run reads `alarmKeyRef`), because the start set of the alarm products (`alarm.symbols`) is also built from it. Reviewer findings applied: `finishLoad()` in `finally` after `applyLoaded`, and the wait limit for a read that never starts.

## Verification

All on the Mac under the heavy lock, mocked e2e, own `next start` with `E2E_REUSE=1`.

| Check | Result |
|---|---|
| PR A, before the review changes: `chart-workspace.spec.ts`, `chart-older-heavy.spec.ts`, `settings-osc-scope.spec.ts` and the copy of `:805` without a hold, `--repeat-each=10`, 3 workers, load average 5.0 → 32.6 | 398 passed, 2 failed (17.8 min). Both failures: ANA-20 `:526` (open point). ANA-27 `:805`, `:815`, heavy `:29`, `:95`, USR-17 `:86`, `:101` and the copy without a hold: 10 of 10 each |
| `npx tsc --noEmit`, `npx eslint` on the changed files | no output |
| `python scripts/features/update_checklist.py --check` | `features.yaml ok (284 Features)` |
| PR C: new test "prefs 2.5 s late" (`formation-page.spec.ts`), code of `main`, 5 runs | 5 of 5 failed (8 calls, expected 4); the tests "prefs fail" and "removed alarm product" passed 5 of 5 (they keep the old behavior) |
| PR C: test "`/auth/me` fails", code before the wait limit (`54715ff6`), 3 runs | 3 of 3 failed (0 calls: the search did not start); the 404 test passed 3 of 3 |
| PR C: FRM-30 block of `formation-page.spec.ts` and `settings-formation-alarm.spec.ts` (USR-15), final code, `--repeat-each=10` | 480 of 480 passed (9.0 min, load average 12 → 11) |
| Reviewer (subagent) | no critical finding; applied: the Turkish comment in `settings-osc-scope.spec.ts`, the `initialBars` check after the reload, a fixed clock with more time to the next minute (12:00:05), no hold of the second page, the temporary specs deleted |

## Open points
- [ ] PR A and PR B merged, and the runs on `main` after the merges reported.
- [x] FRM-30: fix in `FormationScanRunner.tsx` and `useUserPrefsStore.ts` (PR C of 1116-A35).
- [ ] ANA-20: find which element of the legend row changes its width between the press and the release, then decide on a stable position of the buttons (visible UI, design first).
- [ ] ANA-27 finding: after the first older page, the chart requests a second page at once when the last input is less than 1.5 s old (the check inside `candles.setData()` reads `barsBefore` from the old bars). The application is not changed.
- [x] UI-26: the same end-position defect can be in other calls of an animated scroll. Examined (`git grep` in `frontend_nextjs/src` and `e2e`): `scrollToRealTime`, `scrollToPosition` and `scrollPosition(` occur only in `LatestBarButton.tsx`.

## Lessons
A failed click on a legend or menu button is not always a slow page. Log the targets of `pointerdown` and `pointerup`: when they differ, the element moved during the click.

A test that counts requests must wait for the event it means. `waitForPass` counted the requests of the chart too and did not wait for the first search.

The scroll animation of `lightweight-charts` 5.2.1 (`scrollToRealTime`) does not apply its end value. Write the end value after the animation when the end position is important.
