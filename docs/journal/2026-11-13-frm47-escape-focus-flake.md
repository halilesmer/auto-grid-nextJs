---
date: 2026-11-13
author: Claude
type: fix
status: done
pr: []
features: [FRM-47]
areas: [tests, frontend]
---

# FRM-47 Escape focus test: setup race, not a product defect

## Request
Task 1113-A17.3. The test "Escape gibt den Fokus an das vorherige Element zurück" (`e2e/mocked/formation-line-menu.spec.ts`) failed in two full prechecks on 2026-11-13. Alone it passed 20 of 20. The entry `2026-11-10-frm-47-flake-measurement.md` closed it as "not reproducible".

## Reproduction
- Test only, `--repeat-each=120`, 6 workers, 16 `yes` CPU processes next to it: 1 of 120 failed (`toBeFocused` on `workspace-settings`, received "inactive").
- Same load with a probe in the test: 3 of 160 failed.
- A lighter probe (event listeners only) gave 0 of 700. A heavy probe (MutationObserver on attributes) gave a high failure rate. The failure depends on timing.

## Root cause
The test did `locator.focus()` and, in a separate step, dispatched the `contextmenu` event. In the 3 failed runs the probe showed at the `contextmenu` event: `document.activeElement` was `BODY`, and the button was still connected and was the same node. The page had removed the focus between the two steps. The menu (`ui/context-menu.tsx`) stores `previous = document.activeElement`; with `BODY` there is nothing to give back. The product code did the right thing. The test did not check its own precondition.

What took the focus away is not proven. Code search found no `blur()` that runs at page load. A late layout change is the likely cause.

## Fix
`formation-line-menu.spec.ts`: focus the button and dispatch `contextmenu` in one synchronous `evaluate`, and assert that the button had the focus at that moment. No timeout, retry or skip was added. No product code changed.

## Measurement after the fix
See the PR description for the run (same load, same repeat count).

## Open
- Observation only: `chart-workspace.spec.ts` ANA-20 failed in the same precheck runs. It is not part of this task.
- The cause of the focus loss after load stays unproven. If another test needs a focused element after `openPage`, set the focus in the same step as the action.
