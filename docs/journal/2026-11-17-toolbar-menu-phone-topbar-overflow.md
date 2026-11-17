---
date: 2026-11-17
author: Claude
type: fix
status: done
pr: [595]
features: [UI-12, ANA-17, UI-13]
areas: [tests, chart, ui]
---

# Toolbar menu after full screen (375 px): the top bar was wider than the phone

## Request
Step 4, part B of the plan for the open test points (coordinator session, 2026-11-17). Two flaky tests:

- `chart-toolbar.spec.ts:170`: failed 5 of 120 times on the Mac, at line 185 (menu position after full screen).
- `chart-layers-menu.spec.ts:195`: failed one time in a precheck.

Rules from the owner: do not make a test less strict (no longer timeout, no `force: true`, no retry). Measure first. Design first for visible UI.

## Cause of `chart-toolbar.spec.ts:170` at 375 px (measured)

Run 1: heavy lock wait 1234 s, 6 workers, load average 55 → 137.

| Test | Result |
|---|---|
| `chart-toolbar.spec.ts:170`, 30 repeats | 7 of 120 failed, all at 375 px (light 4, dark 3). 1440 px: 0 of 60. |
| Temporary copy with measurements, 30 repeats | 8 of 120 failed, all at 375 px. The menu item was at x = 16.5 px (expected ≥ 52). |

Chain of events:

1. On the phone (container below 30 rem), `ChartTopBar` puts the slot of the time range on row 4 of the CSS order with `flex-1` (basis 0) and `min-w-0`. A basis of 0 always fits, so the slot stayed in line 1 after account and symbol. The button "Tümü" (75 px, it does not shrink) was at x = 360–435 on a 375 px screen.
2. `chart-page` is `fixed` and `overflow-hidden`. Thus `document.scrollWidth` stayed 375 and the old UI-12 checks did not see the overflow. `chart-page` itself had `scrollWidth` 435.
3. The toast "formation search finished" covered the full screen button (y = 748). The trace shows 15 click attempts with "subtree intercepts pointer events".
4. For each attempt Playwright calls `scrollIntoView` with a different alignment. `chart-page.scrollLeft` changed between 0, 49 and 60. With `scrollLeft` 60 the toolbar rail is off the screen (screenshot).
5. When the click went through with `scrollLeft` ≠ 0, the rail stayed shifted in full screen. The menu panel is placed at `trigger.right + 4` = 11.5 px.

Regression: the phone design of 2026-11-03 has "mode, time range, buttons" in line 2. UI-22 (PR 458, PR 462) removed the mode button. After that the time range slot moved into line 1.

## Fix

- Failing test first: new UI-12 test in `chart-topbar.spec.ts` (free, setup, formation at 375 × 812). It checks that no control of the top bar is outside 0–375 px and that `chart-page.scrollWidth` ≤ `clientWidth`. On `main` it failed 15 of 15 times: `Zaman aralığı: Tümü: 360–435`.
- `ChartTopBar.tsx`: on the phone the time range slot has its content width (`flex-none`) instead of `flex-1`. It wraps into line 2 with the buttons. Design B, approved by the owner on 2026-11-17 ("İkisinde de B"). The height of the top bar stays 138 px on all three pages (measured in the test browser before the change).
- The test `chart-toolbar.spec.ts:170` did not change.

## `chart-toolbar.spec.ts:170` at 1440 px: cause unknown

PR 592, CI run 44026467962, "Frontend e2e (2/4)": "1440px dark" failed at line 179 on the first attempt and passed on retry #1. Error: `toBeFocused` on `tool-gann-fan`, "element(s) not found" for 7 s. Thus the menu panel was not in the DOM after Enter. This is a different failure from the 375 px failure (there the menu was open, but shifted). The run uploaded no trace.

Candidates (from the code, not measured as a cause):

- The rail is in `ChartView`, which `OneChart.tsx` renders only when `shownData && accepted && mergedKey === contextKey`, with `key={contextKey}`. If this condition fails for a short time after the load, the rail mounts again and the open menu closes.
- Enter before React hydration: the button has no click handler yet.

Measurement (run 2, heavy lock wait 2158 s, 4 workers, load average 15 → 29): a temporary test recorded, at the time of focus, if the React handler was attached and if the trigger was the same DOM node after Enter. 1440 px light and dark, 20 repeats each, CPU throttling 1×, 4× and 6×: 120 of 120 passed. The handler was always attached and the node was always the same. Neither candidate occurred.

The fix above does not apply at 1440 px (the CSS rule is for containers below 30 rem only). Thus this failure can occur again.

## `chart-layers-menu.spec.ts:195`: not reproduced, cause unknown

| Test | Result |
|---|---|
| Original test, 30 repeats (run 1) | 30 of 30 passed |
| Temporary copy with a time log, 30 repeats | 30 of 30 passed. Click → localStorage write: 21–156 ms. Write → `pagehide`: at least 101 ms. |
| Same copy, lock `chart-workspace-storage` held for 1.5 s | 2 of 5 failed: the write came after `pagehide`, and after the reload the switch was on again (line 204). |

The workspace store writes through `navigator.locks.request` (asynchronous). If the reload starts before the write, the change is lost. This is a candidate mechanism. The failed line of the precheck was not recorded, so the cause is unknown. The test did not change.

## Verification

Run 3 (build with the fix, heavy lock wait 1 s, load average 7 → 64):

| Test | Result |
|---|---|
| `chart-topbar.spec.ts` (all UI-12 tests) | 11 of 11 passed |
| New UI-12 test, 5 repeats | 15 of 15 passed (on `main`: 15 of 15 failed) |
| `chart-toolbar.spec.ts:170`, 30 repeats, 6 workers | 119 of 120 passed. 375 px: 60 of 60 (before the fix: 53 of 60). |

The 1 failure was "1440px dark", with a test timeout of 60 s. The trace shows that all checks of the test passed at 16.4 s, also the menu position. Then `page.screenshot` (full screen page) took 45.6 s, at load average 64. This is a third failure type. The fix does not apply at 1440 px. Cause unknown.

`npx eslint` (changed files) and `npx tsc --noEmit`: exit 0.

## Correction of the new test (CI of PR 595)

The first CI run of PR 595 failed in the new UI-12 test for "free" and "setup" (run 44048055972, "Frontend e2e (2/4)", also on retry). The test reported 2 buttons of the formation row: "2618, yakın, zorunlu 4/6: 349–425" and "Diğer 7 aday: 427–461". The formation row (`formation-forms`) is `overflow-x-auto` by design: its buttons scroll, they are not cut off. Thus the test was wrong, not the app.

Why the test passed on the Mac: the data of the mock worker depends on the clock. Measured with `E2E_FAKE_NOW` (free, setup, formation at 375 × 812):

| Clock (UTC) | Formation candidates in the top bar |
|---|---|
| 07:25:30 (time of run 3), 07:30 | none |
| 08:00, 08:39:40 (time of the CI failure) | 2 on free and setup, at x = 337–450 |

The viewport was the same (375 × 812). The x values on Linux are 12 px larger than on the Mac (fonts, not measured).

Correction: for a button in `[data-testid=formation-forms]` the test measures the box of the formation row, for all other buttons the box of the button. This is the only exception. The top bar has 2 scroll containers (`timeframe-select`, `formation-forms`); `timeframe-select` is not excluded. If the formation row itself goes outside the screen, the test fails.

Measured with the corrected test (run 4, load average 84 → 37):

| Build | Clock | New UI-12 test, 5 repeats |
|---|---|---|
| With the fix | 08:39:40 and real time | 15 of 15 passed (each clock) |
| Without the fix (`flex-1` again, built) | 08:39:40 and real time | 15 of 15 failed (each clock): `Zaman aralığı: Tümü: 360–435` |

In run 4 one test of `chart-topbar.spec.ts` failed one time (real time, load average 84); the result was overwritten before it was recorded. Run 5: `chart-topbar.spec.ts`, 3 repeats, 33 of 33 passed (load average 127–139). Cause of that failure: unknown.
