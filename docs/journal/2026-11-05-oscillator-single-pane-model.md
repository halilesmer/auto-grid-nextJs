---
date: 2026-11-05
author: Claude
type: feature
status: open
pr: []
features: [UI-11, ANA-20, ANA-22, FRM-35]
areas: [frontend, tests]
---

# System oscillators use the pane model of user oscillators

## Request
- The user saw empty space at the bottom of `/formasyon` and `/chart`, with or without an oscillator.
- Cause of the screenshot: the Wave 5/35 layer was off, but its pane stayed, empty and without a name.
- Decision of the user: oscillators work like in TradingView (plan 1105-A6). This entry covers PR 1 (A6.5, A6.1 to A6.4). PR 2 (A6.6 to A6.8) follows.

## Cause
- `ChartCore` created the RSI(7) pane and the Wave pane one time at chart setup, with the fixed stretch 5 : 1 : 1.2.
- The layer switch only set `visible: false` on the series. The pane stayed with its height.
- Pane numbers were fixed (RSI pane 1, Wave pane 2). `FormationChart` and the legend read them from constants.

## Solution
| File | Change |
|---|---|
| `components/chart-workspace/runtime.ts` | `IndicatorRenderer` is the only owner of all oscillator panes. `update()` gets the system panes (ready-made points) and the pane order. It builds one pane for each entry that is on and not hidden. The chart removes a pane without series (`preserveEmptyPane` is false). Pane numbers come from `series.getPane().paneIndex()` when needed. `stretchBeforeMaximize` stores the pane object, not its number. The renderer sends `chart-panes-changed` on the chart host after each rebuild. |
| `components/analysis/chart/ChartCore.tsx` | No system series any more. It passes the points of RSI(7) and Wave to the workspace. `ChartScene.rsi` and `ChartScene.wave` are refs (`current` is the series while the pane is drawn). |
| `components/chart-workspace/IndicatorLegend.tsx` | One row builder (`rowShell`) and one pane button group (`paneControls`) for user and system panes. A system row has an eye, a delete button and a menu, and no settings gear (the 7 and the 5/35 belong to the formation rules). |
| `components/chart-workspace/ChartWorkspace.tsx` | Pane order and the actions (up, down, collapse, maximize, delete, eye) work for system ids too. |
| `components/chart-workspace/systemLayers.ts` | Layer on or off in a chart document. On: the layer moves to the end of the order (new pane at the bottom). |
| `lib/chart-workspace/paneOrder.ts`, `store/useChartWorkspaceStore.ts` | Chart document gets the optional fields `paneOrder` and `systemPanes` (`hidden`, `collapsed`). Old documents without the fields load as before. `overlays.rsi` and `overlays.wave` keep their meaning. |
| `components/formation/FormationChart.tsx` | `yRsi`, `yWave` and the Wave label read the position of the pane of the series at each redraw. Fixed offsets are gone. |

## Why
- One owner for all panes: two owners (chart core and renderer) would count pane numbers in two places and disagree after each change.
- The default order is RSI(7), Wave, then the user panes. A new chart looks as before. A layer that you switch on again goes to the bottom, like a new indicator in TradingView.
- The eye behaves as for user indicators in PR 1: the pane goes and the row stays in the price pane. PR 2 changes it to the TradingView behavior for all oscillators.
- Rejected: keep `visible: false` and shrink the empty pane. The pane would still keep a separator and a name.

## Decision
- **Decision:** the sentence "The empty pane keeps its height" of `2026-11-02-formation-wave-pane.md` no longer applies. A switched-off or deleted layer has no pane.
- **Reason:** the screenshot of the user. Empty space under the chart has no use.

## Tests
- `@UI-11` in `chart-layers.spec.ts` (free and setup mode): Wave off gives 2 system panes and a taller candle pane. Both off gives 1. On again restores both, at the bottom. A saved off layer is not built at load.
- `@FRM-35` in `formation-page.spec.ts`: with RSI(7) off, the Wave label stays in the Wave pane.
- The new tests failed first on the old code. See "Verification".

## Verification
| Check | Result |
|---|---|
| Red run: the new tests against the old `src` (own `E2E_PORT`) | 5 failed, as expected. Example: `data-system-panes` stayed `"3"` after the RSI(7) switch went off. |
| Full mocked e2e with the change (`E2E_PORT=3217 npm run test:e2e`) | 2795 passed, 24 failed. The 24 failures were in other areas (zones, users, tooltips, VPS) and ran for 16 to 17 minutes each. The desktop app was closed during the run. |
| `--last-failed` again | 24 passed |
| `scripts/features/run.sh e2e` for UI-11, FRM-35, ANA-20, ANA-22 | all passed |
| `npx tsc --noEmit`, `npx eslint src` | clean |

- The first green run had two failures: UI-13 (the TradingView logo touched the legend of the bottom pane at 375 px, 0.5 px overlap) and ANA-19. Cause of UI-13: one stretch ratio of 0.25 for all panes changed the pane heights a little. The fix gives RSI(7) 0.2 and Wave 0.24 of the price pane, the ratios of the old fixed layout 5 : 1 : 1.2. After the fix, both tests passed without a change to them.
- No test was changed to pass. ANA-20 (`paneHeights`) and ANA-22 (`paneBoxOf`) count the system panes after the price pane. The default order (RSI(7), Wave, user panes) keeps them true. A move of a user pane also keeps the order of the indicator list, so the ANA-20 check of the stored list stays true.

## Open points
- [ ] PR 2 (A6.6 to A6.8): eye like TradingView, height 2 : 1, pane button order and trash icon.

## Lessons
- A fixed pane number in two files (`ChartCore`, `FormationChart`) made each change of the pane set a change in both. Read the number from the series.
