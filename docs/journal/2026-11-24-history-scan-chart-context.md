---
date: 2026-11-24
author: Claude
type: diagnosis
status: open
pr: []
features: [FRM-39]
areas: [frontend, tests]
---

# History scan measures the chart context now

## Request
The live history scan (`e2e/live/formation-history.spec.ts`, FRM-39) put the whole history into one `FormationContext`. `view()` cut it with `slice(0, n)` at each moment. On M15 this meant one year of candles. The chart loads only a window. So "0 violations" did not measure the screen. Example: M15 BUT sell (X 10-29 23:00, entry 11-05 03:00) vanished at 11-09 01:00 in the full context. In a chart-like context it showed another trade at 11-08 15:00 and nothing after 17:00.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/live/formation-history.spec.ts` | New mode switch `FORMATION_HISTORY_CONTEXT=chart\|full`. `chart` builds a new `FormationContext` for each scan from `chartInput(data, at)`. `full` is the old behavior. |
| `docs/features/features.yaml` | FRM-39 live check text names the mode. Unquoted `pruefung` items of FRM-05, FRM-18 and FRM-39 are quoted (they parsed as maps and broke `run.sh render`). |
| `docs/features/FEATURES.md` | Generated again. |

- `chartInput` copies the past mode of the chart (`useFormationScan` with `pastAt = at`): `formationRequests(…, pastRequestEnd(at))`, then `ratesWindow` for the alignment, then `splitDaily(…, pastDayEnd(at))` for D1 and W1. The missing ranges are cut to the window. No file in `src/lib/formation/` changed.
- The checks and violations do not change in either mode. Nothing is relaxed. The mode only changes what each scan sees.
- `windowStartOf` decides whether the first point of a candidate is outside the window. In `full` mode it is the old rule (`at - HISTORY_DAYS`). In `chart` mode it is the real start of the loaded window (aligned to the time frame; D1: `pastDayEnd(at)` minus the D1 view). So the exception is not wider than the window.
- Default is `chart`: the scan answers "what does the screen show". `full` stays for diagnosis, because it separates a window effect from a logic effect. With `FORMATION_HISTORY_PROBABLE=1` the default is `full`, and an explicit `chart` is an error (the probable-C measure follows one context candle by candle).
- Meaning of `vanishedOutsideWindow` in `chart` mode: the window is the context itself. The counter shows how often a running or finished trade leaves the loaded window while the scan moves forward, that is, what the user sees disappear when he goes back in time. It is not a measure of a context difference and it is not a violation. In `full` mode it is the blind-spot counter of 1122-A40. No new violation was added.
- Limit: the scan keeps its own choice of neighbor time frames (H4: D1, H4, H1; H1: H4, H1, M15). The chart loads D1, H4, H1 and M15 for each main time frame. This difference is not closed here.
- Cost: `chart` makes a new context for each scan (about 150 ms per H1 scan, about 90 ms per H4 scan). `full` took 365 and 407 ms per scan in these runs because the context is large.

## Verification
Live scan, XAUUSD, DEMO account, read-only, under the heavy lock. H1: `FORMATION_HISTORY_BARS_H1=1560 FORMATION_HISTORY_STEP_H1=1`. H4: the default (1560 bars, step 1). `tsc` and `eslint` are clean. `scripts/features/run.sh render` passes.

| | chart H1 | full H1 | chart H4 | full H4 |
|---|---|---|---|---|
| Result | red | green | red | green |
| `candidateVanished` | 1 | 0 | 5 | 0 |
| `finishedVanished` | 143 | 127 | 143 | 128 |
| `finishedBetweenScans` | 15 | 16 | 14 | 15 |
| `endNeverShown.mainTf` | 0 | 0 | 0 | 0 |
| `vanishedOutsideWindow` running / finished | 2 / 6 | 3 / 3 | 0 / 0 | 0 / 1 |
| `hiddenTrades` keys | 2 | 2 | 0 | 0 |

Other violations: none in the four runs. The chart-mode runs are red on purpose. The cause of the 6 cases is not investigated yet.

## Open points
- [x] Chart context H1: 1 `candidateVanished` (fixed 2026-11-24: trend lead-in, `2026-11-24-formation-window-lead-in.md`; chart-context scan H1 0) (running trade vanishes while the first point is inside the M15 window of 10 days). Not investigated.
  1. M15 ABCD buy, first point 2026-09-22 03:00, entered 09-24 13:00, last seen 09-26 00:00 (TP1), gone 09-28 02:00. Entry 4249.36, stop 4200.95.
- [x] Chart context H4: 5 `candidateVanished` (fixed 2026-11-24: trend lead-in, `2026-11-24-formation-window-lead-in.md`; chart-context scan H4 0) (H4 GAR sell, D1 BAT sell, H1 GAR sell, H4 BUT buy, H4 CRB buy). All first points are inside the window. Examples (times are scan times, UTC):
  1. H4 GAR sell, first point 2025-10-20 20:00, entered 2025-12-12 16:00, last seen 12-13 00:00 (open), gone 12-15 04:00. Entry 4342.72, stop 4517.04.
  2. D1 BAT sell, first point 2025-10-20 00:00, entered 2025-12-13 00:00, last seen 12-22 20:00 (open), gone 12-23 00:00. Entry 4324.92, stop 4492.44.
  3. H1 GAR sell, first point 2026-03-17 16:00, entered 2026-04-20 08:00, last seen 04-22 08:00 (open), gone 04-22 12:00. Entry 4739.28, stop 4983.99.
  The same cases are green in `full` mode. So the loaded window changes the result, not only the window edge. A guess (not verified): trend, wave or ATR start at the first loaded candle, so a turning point can move when the window start moves.
- [x] The M15 BUT sell of the request (examined 2026-11-24: X leaves the M15 history window, `xabcd.ts` `historicBases`; fix is step 2b, see `2026-11-24-formation-window-lead-in.md`) (entered 11-05 03:00) is in the H1 chart run as `vanishedOutsideWindow.running` (2 cases). Not checked against the chart screen.
- [ ] One symbol only. Other symbols are not measured in `chart` mode.
