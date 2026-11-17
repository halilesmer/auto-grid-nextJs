---
date: 2026-11-17
author: Claude
type: fix
status: done
pr: [602]
features: [UI-15]
areas: [tests, chart]
---

# UI-15 phone top bar test: the test measured a top bar that was replaced

## Request
Step 4 of the plan for the open test points (coordinator session "K- Test altyapısı", 2026-11-17). The test `chart-header.spec.ts:360` ("375 × 812, Formation: das Konto ist breiter als das Ziel …") failed on the first try in the CI of PR 598 and passed on the retry: `Expected: <= -5.72, Received: 116`. Find the cause by measurement. Do not make the test less strict.

## Symptom
The limit is `row * 0.42 + 1` with `row = top bar width - 16`. The limit -5.72 means that the top bar had a width of 0. The symbol (target) had its usual width of 116 px.

## Measurements

| Measurement | Result |
|---|---|
| CI history: all `tests.yml` runs that were not cancelled, 2026-11-15 19:51 to 2026-11-17 11:40 UTC (64 runs), `✘` lines of `chart-header.spec.ts:360` | 3 failures on the first try, all with the same values (-5.72 and 116): run 43889945427 (2026-11-16 14:50 UTC, case Setup), run 44020739913 (2026-11-17 04:57 UTC, case Formation), run 44073027687 (2026-11-17 11:19 UTC, PR 598, case Formation). |
| Playwright 1.63 source (`Locator._withElement` in `playwright-core/lib/coreBundle.js`) | `Locator.evaluate` does two protocol calls: first `waitForSelector` with `state: "attached"` gives an element handle, then `handle.evaluate` runs the function. If the element is removed between the two calls, `getBoundingClientRect()` of the removed element gives 0. |
| Code: `src/app/chart/page.tsx` | Until the account list is loaded, `/chart` shows `NoAccountChart`. It has its own `ChartTopBar` with the same account select, but without a target. When the list is loaded, `OneChart` replaces the whole page, so the old `chart-topbar` node is removed. |
| Temporary probe with a `MutationObserver`, 3 cases × 40 repeats, 3 workers (heavy lock wait 2376 s, load average 57 → 119) | 120 of 120: the top bar was added 2 times. First without target (about 515 ms after the start), then removed and added again with the target (about 649 ms). No third mount. The original test passed 120 of 120 locally: the account select became visible only after the replacement. |
| Forced order: the answer of `GET /accounts` held until the account select of `NoAccountChart` is visible, handle taken, then answer released (old measurement), 3 cases × 10 repeats (heavy lock wait 3370 s, load average 60) | Old measurement: 30 of 30 failed with the CI values: top bar width 0, `isConnected` false, row -16, target 116. The target did not exist when the account select was visible (0 of 30). |
| Same forced order, new measurement (wait for the target, then measure all widths in one call on the top bar that contains the target) | 30 of 30 passed (bar 375 px, target 116 px, account 227 px). |
| `chart-header.spec.ts:359` with the fix, natural order, `--repeat-each=10`, same run | 30 of 30 passed. |

## Root cause
The test waited for the account select. That select is also in the top bar of `NoAccountChart`. When the account list arrived between the two protocol calls of `Locator.evaluate` on `chart-topbar`, the test measured the removed node and got a width of 0. The code of the application is correct: the final top bar always had 375 px.

Rejected candidate: PR 595 (`flex-none` for the time range slot on the phone, merged 2026-11-17 10:13 UTC). Two of the three failures happened before PR 595 (2026-11-16 14:50 and 2026-11-17 04:57 UTC). The forced order fails on all three cases, also on Setup without formations.

Rejected candidate: the time of the mock data (`E2E_FAKE_NOW`, formation candidates). The failures happened at 14:50, 04:57 and 11:19 UTC, and one failure was in the case Setup, which has no formations.

## Fix

| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/chart-header.spec.ts` | The test waits for the target, which only `OneChart` shows. Then it measures the width of the bar, the target and the account select in one call on the top bar that contains the target. The limits are unchanged. The helper `width` is removed (no other user). |

## Decisions
- Test only. The short display of `NoAccountChart` before the account list arrives (about 130 ms in the probe) is not changed. It is not a layout defect of the phone, and the owner decided on 2026-11-17 that phone UI work waits.
- Rejected: a retry or a poll of the width. Both hide which top bar the test measures.

## Lessons
A test on `/chart` that waits for the account select can still see the top bar of `NoAccountChart`. Wait for an element that only `OneChart` shows (for example `formation-symbol`) before a measurement. Measure related values in one `evaluate` call: `Locator.evaluate` takes the element in one call and runs the function in a second call.

## Open points
- [ ] Other tests read `chart-topbar` with `Locator.evaluate` (`chart-header.spec.ts:194` and `:303`, `chart-topbar.spec.ts:20` and `:66`, `formation-page.spec.ts:741`, `formation-past.spec.ts:163`). Not examined for the same race. In the 64 CI runs above, only `chart-header.spec.ts:360` was examined.
