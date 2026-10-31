---
date: 2026-10-31
author: Claude
type: fix
status: done
pr: [252]
features: [UI-07]
areas: [frontend, tests]
---

# Tooltip sometimes does not open after a list closes

## Request
- The test `tooltips.spec.ts` "Der Hinweis folgt der gewählten Sprache" failed in 2 of 5 runs on `main`.
- Find the cause. Decide if the test or the product code is wrong.

## Cause
- The test selects an account. The account list closes. Then the test hovers the (i) icon of a field.
- Sometimes Chromium sends `pointerover` to the (i) icon without a `pointerout` first.
- The `relatedTarget` of that `pointerover` is an element that is still in the React tree.
- React ignores such a `pointerover` for `onPointerEnter`. It waits for the `pointerout`, which never comes.
- The Tooltip then never starts its 300 ms timer. The mouse does not move again, so no second event arrives.
- A probe in the browser showed this. In failed runs the log had `pointerover` and `pointerenter`, but no timer. In good runs a `pointerout` came first.
- We could not make the plain test fail on this machine (more than 150 runs, with CPU load and CPU throttling). The timing depends on the machine.

## Solution
| File | Change |
|---|---|
| `src/components/ui/tooltip.tsx` | Start the open timer on `onPointerOver` instead of `onPointerEnter`. Only the first `pointerover` after the pointer enters starts the timer. `onPointerLeave` resets this. |
| `e2e/mocked/tooltips.spec.ts` | Two tests check that a new `pointerover` does not reopen a tooltip that a click or Escape closed. A third test sends `pointerover` with a `relatedTarget` inside the React tree, without `pointerout`. |

## Why
The product code is wrong, not the test. A real mouse can also jump from an element that closes. `pointerover` always reaches React, so the tooltip opens.
The expected value of the old test stays the same. We added no wait and no `skip`.
The new test is deterministic. It failed 3 of 3 runs before the fix.

## Verification
- Review found that a new `pointerover` reopened a tooltip after click or Escape. Both new tests were red first.
- `pointerover` tests and the old test after the fix: 60 of 60 green (15 runs each).
- `tsc --noEmit` and `eslint` on the changed files: no errors.
- Full mocked suite: see the PR description.

## Lessons
- `onPointerEnter` in React depends on `pointerout`. Use `onPointerOver` with a guard when an element can disappear under the pointer.
- The guard depends on `pointerleave`. React derives it from `pointerout`. If the browser sends no `pointerleave`, the tooltip stays closed on the next entry.
