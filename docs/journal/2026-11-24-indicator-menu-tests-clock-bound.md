---
date: 2026-11-24
author: Claude
type: fix
status: closed
pr: [667]
features: [ANA-24]
areas: [frontend, tests]
---

# Indicator line menu tests depend on the time of day

## Request
Main CI run 45344749124 (commit 8b5e4e48, a docs-only PR) failed in "Frontend e2e (1/4)". Two ANA-24 tests timed out at the 30 s limit, twice each, at 31.5–31.8 s: `„Gri“ folgt dem Thema…` and `Menü: „Favori“…` in `e2e/mocked/chart-indicator-menu.spec.ts`. The run started at 07:01 UTC; the two tests ran at 07:13 UTC. The 8 runs before were green.

## Root cause
`findRsiLine` finds the RSI line by moving the mouse down the pane one pixel at a time (15 ms wait and one attribute read per step) until the legend row reports `data-emphasis="hover"`. The mock candles follow the time of day (sine curve, `MockWorker.rates`), so the RSI line moves in the pane with the clock. Pane height is 184 px. Steps until the line was found, measured with `fakeNow`:

| Clock (UTC) | Steps | Line at y |
|---|---|---|
| 2026-11-24 07:13 (CI time of the failure) | 246 | 73 (found at x fraction 0.35 after a full empty pass at 0.5) |
| 2026-11-23 20:00 | 132 | 135 |
| 2026-11-24 14:30 | 127 | 130 |
| 2026-11-20 12:00 | 32 | 35 |

Both failing tests search twice (`rightClickRsi`, Escape, `rightClickRsi`) or once after `openChart` without other waits. At 07:13 the two searches together are longer than 30 s. A step costs 60–150 ms on a loaded machine, so 145 steps took 9–25 s (local probe, load 20–50); the local runs failed 5 of 6 times. The CI failure repeats on retry because the clock is the same, not because of luck. The 8 green runs before ran at other times of day.

Excluded: the price clock (ANA-28). The failing step is the mouse search, not a redraw; the step count is the same with the real clock and with `fakeNow`. `chartReady` is not the cause either: the search reads the legend row, not a fixed pixel of a drawing.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/chart-indicator-menu.spec.ts` | `test.use({ fakeNow: '2026-11-20T12:00:00Z' })` fixes the clock, so the line stays at one place. `findRsiLine` tries every 3rd pixel first, then the pixels in between: a line is found in about a third of the steps. |

- No assertion was relaxed. The test limit stays 30 s.
- Result: the whole file, 3 times in a row, 39 of 39 passed at load 30–50 (`uptime`). The two tests took 4.8–10.8 s instead of 31 s or more.
- Rule for new tests: a search over many mouse steps needs a fixed clock or a short path. The mock candles change with the time of day.
