---
date: 2026-11-08
author: Claude
type: feature
status: open
pr: []
features: [UI-10, ANA-05, ANA-06, ANA-11]
areas: [frontend]
---

# Chart U4-1: setup layers leave ZoneChartPanel

## Request
Step U4-1 of plan 1107-A21 (`2026-11-08-one-chart-no-modes-plan.md`). Move the setup layers out of `ZoneChartPanel`. No visible change.

## Solution
| File | Change |
|---|---|
| `hooks/useSetupLayers.ts` (new) | Band, level lines, position and order lines, trade markers, links, notes, fractals, focus, legend list and layer list. The notices stay in the panel. |
| `components/chart/SetupCardTabs.tsx` (new) | The floating card with the tabs "Overview" and "Trades". It also holds `ZoneInfo` and `SetupSwitches`. |
| `components/chart/ZoneChartPanel.tsx` | Thin shell. It loads the candles with `useMarketRates`, the trend and the signal bars. It joins the parts. |

The hook takes the chart bars (`data`, `chart`), the symbol, the zone, the timeframe, the range and the clock. It needs no state of the panel. Step U4-4a can use it with the free chart.

## Why
- `setupSwitches` was JSX. A `.ts` hook cannot hold JSX. The hook returns the data (`legendLayers`). The component `SetupSwitches` in `SetupCardTabs.tsx` renders the switches. This is an assumption of this step.
- The hook keeps the live stream, the deals and the pairing, because the layers need them. The panel keeps `useMarketRates`, as the plan says.
- No change to test ids, i18n keys, specs, `useMarketRates`, `candles.ts` or `ChartCore`.

## Open points
- [ ] The `code:` lists of ZON-16, MET-02, ANA-03, ANA-05, ANA-06 and ANA-08 in `features.yaml` still name only `ZoneChartPanel.tsx`. Only step U4-3 edits `features.yaml`. Add the two new files there.

## Verification
- `tsc` and `eslint` on the three files: no error.
- A temporary Playwright spec (not committed) took screenshots of a setup URL against the mocked worker, at 1440 px and 375 px, with the "Overview" and "Trades" tabs. The files before and after are byte equal.
- `scripts/features/precheck.sh`: catalog, worker tests, lint, tsc and all mocked e2e pass (3189 of 3189).
