---
date: 2026-11-24
author: Claude
type: fix
status: done
pr: []
features: [ANA-24]
areas: [frontend, tests]
---

# ANA-24 indicator menu tests depend on the wall clock

## Cause
- Two tests in `chart-indicator-menu.spec.ts` failed in CI on every run, also on the retry: "Gri" (line 164) and "Favori" (line 177). The error was `mouse.move: Test timeout of 30000ms exceeded` in `findRsiLine`.
- The failing runs were main 8b5e4e48 (07:01 UTC), PR 664 and PR 666 (07:33 UTC). Their changes were only journal, catalog and `CLAUDE.md`. Main 01e6f3f4 was green at 05:50 UTC with the same code.
- The mock worker computes its candles from the clock (sine curve). The spec had no fixed clock, so the place of the RSI line in its pane moves with the time of the run.
- `findRsiLine` moves the mouse pixel by pixel and waits 15 ms at each step. Each of these two tests searches twice. When the line is far down the pane, the two searches use more than 30 s.

## Evidence
Same server build, one worker, only the two failing tests, `E2E_FAKE_NOW` set:

| Clock | Result |
|---|---|
| 2026-11-24T07:01:00Z | 2 failed (`mouse.move` timeout at line 39) |
| 2026-11-24T05:50:00Z | 2 passed (18.5 s and 20.4 s) |

The Mac had a load average of about 20 during these runs. This is why the passing runs were slow.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/chart-indicator-menu.spec.ts` | `test.use({ fakeNow: '2026-11-24T05:50:00Z' })` |
| `frontend_nextjs/e2e/mocked/chart-indicator-menu.spec.ts` | `findRsiLine` moves 3 px per step, not 1 px |

The checks and the timeouts did not change.

## Why
- With the fixed clock alone, the two tests still took 33 s and 35 s on the loaded Mac, and failed. The search was too slow for a loaded machine.
- The chart hits a line within a few pixels. A step of 3 px does not skip it, and the search is three times faster.
- Rejected: a longer timeout or fewer searches. Both hide the cause.

## Verification
- With the fixed clock and a step of 1 px: 11 passed, 2 failed (the two tests above) on the loaded Mac.
- With the fixed clock and a step of 3 px: 13 passed (all ANA-24 tests of the file, 1.8 min), same load.
- `scripts/features/precheck.sh`: see the PR description.

## Lessons
- Same class as ANA-19 (`2026-11-21-ana19-weekend-clock.md`) and ANA-17 (`2026-11-23-ana17-scan-scale-fixed-clock.md`). Earlier fixes: `2026-11-04-chart-hover-test-clock.md`, `2026-11-13-ui17-time-dependent-mock.md`, `2026-11-20-legend-375-clock-dependence.md`.
- A spec that finds a chart line by pixel position needs a fixed clock (`test.use({ fakeNow })`).
- Making all specs run on a default fixed clock is a separate task (not done here).
