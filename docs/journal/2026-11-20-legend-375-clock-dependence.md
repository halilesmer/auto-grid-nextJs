---
date: 2026-11-20
author: Claude
type: fix
status: closed
pr: []
features: [ANA-20, UI-08]
areas: [frontend]
---

# Legend test at 375 px depended on the clock

## Request
The test "Lejant 375 px: imleç grafikteyken "—" kesilmez" (`e2e/mocked/chart-workspace.spec.ts`) failed on every PR after about 21:00 UTC (PR 630, also with the code of `main`).

## Cause
- With the mock clock set by `E2E_FAKE_NOW`, the test passes at 2026-11-18 12:00Z, 2026-11-19 20:00Z and 2026-11-20 12:00Z. It fails at 2026-11-19 21:30Z, 23:30Z and 2026-11-20 03:00Z.
- Probe at 20:00Z: visible range starts 1794528000 (a weekday) and the legend shows "—". At 21:30Z: it starts 1794787200 (a Sunday, in the weekend gap of the mock candles) and the legend shows RSI 35,06. `valueAtTime` gives "—" only when no candle at or before the crosshair time has a value.
- So the test needs the left edge of the last-7-days view to be the first candle. The mock builds the candles from the clock, so this holds only for some clock times.
- Not found: why exactly the view start moves to the weekend at 21:30Z (broker date is already the next day then). The fix does not need it.

## Change
The test runs with a fixed clock (`test.use({ fakeNow: '2026-11-18T12:00:00Z' })`), like the other chart tests. The assertions are the same.

## Evidence
`E2E_FAKE_NOW` set to 2026-11-19 20:00Z, 21:30Z, 23:30Z and 2026-11-20 03:00Z: the test passes at all four (the fixed clock wins). `tsc` is clean.
