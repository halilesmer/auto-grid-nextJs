---
date: 2026-11-10
author: Claude
type: diagnosis
status: done
pr: []
features: [FRM-47]
areas: [tests, frontend]
---

# FRM-47 flake: measurement alone and under load

## Request
Close the open question from `2026-11-06-line-menu-a11y-r2-rest.md`: the test "Escape gibt den Fokus an das vorherige Element zurück" failed 3 of 60 and 1 of 100 runs under load. Cause was not proven.

## Measurement
- Alone (`scripts/features/run.sh e2e FRM-47`, one run at a time, no other heavy job): 10 runs x 20 tests = 200 test results, 0 failures.
- Under load (`scripts/features/run.sh e2e`, full mocked e2e under the heavy lock, 3 workers): 3359 passed, 0 failed, 0 flaky. The 20 FRM-47 tests were part of it.

- Second report (peer session, precheck of another worktree): `formation-line-menu.spec.ts:165` ("Tüm formasyon çizgileri…") and `:193` ("Menü im Bild (dark)") failed; `line-menu` did not open. The log it named (`/private/tmp/claude-501/precheck.log`) is a shared path; the copy now on disk is from this worktree and lists two other failures (`chart-workspace.spec.ts:537` ANA-20, `news-alerts.spec.ts:152` NWS-03), both under a long wait for the heavy lock and other sessions' load.
- Both reported tests (with the other tests matched by the same filter: 8 tests) x 50 repeats = 400 results, 3 workers: idle 400 passed (9.8 min); with 6 `yes` CPU hogs running next to them 400 passed (9.7 min). 0 failures.
- Second precheck of this branch (docs-only diff): 3357 passed, 2 failed: `formation-line-menu.spec.ts:193` "Menü im Bild (light)" (`line-menu` not visible after the right click) and `news-alerts.spec.ts:152` (NWS-03, 2 requests instead of 1). Machine load average was 43 to 96 on 8 cores (other sessions); the e2e step took 28 min against 17 min on a quiet machine. Trace of the FRM-47 failure: the hit line was attached at t0, the right click came 143 ms later at a point measured once by `pointOn`, and no menu appeared in the next 7 s.
- Heavy CPU load (24 `yes` processes, 3 workers): 8 tests x 40 repeats = 320 passed (8.2 min). Not reproduced.

## Decision
The rule of this project applies: a timeout under load is not a red test, and code changes only if the test also fails alone. It did not fail alone. No code or test changed. The assumption from 2026-11-06 (toolbar button rebuilt between `focus()` and the menu opening) stays unproven.

## Open
The `line-menu` not opening under load stays unreproduced. A likely cause is that `pointOn` measures the click point once and the overlay re-lays out before `page.mouse.click`, so the right click misses the hit line. This is not proven; do not change the test before it fails alone.
If the failure comes back, log removed nodes and `document.activeElement` at the `contextmenu` event first, then change code.
