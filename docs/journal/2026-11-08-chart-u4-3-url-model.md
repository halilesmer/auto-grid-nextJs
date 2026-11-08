---
date: 2026-11-08
author: Claude
type: feature
status: open
pr: []
features: [UI-22]
areas: [frontend, tests, docs]
---

# Chart URL model without modes (U4-3)

## Request
Step U4-3 of plan 1107-A21 (`2026-11-08-one-chart-no-modes-plan.md`): write the URL model as pure functions, add lib tests and open the catalog entry UI-22. No visible change.

## Solution
| File | Change |
|---|---|
| `src/lib/chart/chartUrl.ts` (new) | `parseChartUrl`, `buildChartUrl`, `hasFormations`, `DEFAULT_CHART_TF` (H4), `DEFAULT_CHART_RANGE` (All). |
| `e2e/mocked/chart-url-lib.spec.ts` (new) | 12 lib tests, tag `@UI-22`. Written first, red (module missing), then green. |
| `docs/features/features.yaml` | New entry UI-22 (the ID was free). |

No component uses the model yet. U4-4a connects it. `lib/chart/mode.ts` and `useAnalysisParams.ts` are unchanged (`/backtest` keeps `last30`).

## Assumptions (the plan is silent)
- `parseChartUrl(params, zoneSymbol?)` takes the zone-to-symbol mapping as an optional function. An explicit `symbol` wins over the zone symbol.
- Custom range (`from`, `to`, `ft`, `tt`) is read as before (valid days, `from <= to`). Else the range is "All".
- `buildChartUrl(current, change)` returns a new `URLSearchParams` and does not change the input. A key in `change` with `null` removes the parameter. Setting `range` to a preset or `all` replaces any custom days.
- `form` and `at` are removed whenever the resulting `tf` has no formations, also when the change sets only `at`. This follows 1107-A21.9.
- The formation timeframes come from `CONTEXT_TIMEFRAMES` (D1, H4, H1, M15).

## Verification
`scripts/features/run.sh e2e UI-22`: 12 passed. `run.sh check`: ok. `tsc --noEmit`: no error.

## Open points
- [ ] U4-4a connects the model to the page.
