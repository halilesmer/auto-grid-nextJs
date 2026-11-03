---
date: 2026-11-03
author: Claude
type: feature
status: done
pr: []
features: [ANA-22, ANA-20, UI-07, UI-08]
areas: [frontend, tests, docs]
---

# Indicator legend reacts to the mouse like TradingView

## Request
- The user approved four points on 2026-11-02, with a design as an artifact.
- Indicator values follow the crosshair. Buttons show only on hover. The line under the mouse gets thicker and a click selects it. The pane buttons show only on hover.
- The alarm logic must stay on the latest value.

## Solution
| File | Change |
|---|---|
| `lib/chart-workspace/hover.ts` | New. `valueAtTime` returns the value at a candle time (latest value without a time). `lineTarget` and `nextSelection` give a drawing tool, or a drawing under the mouse, priority over a line. |
| `components/chart-workspace/IndicatorLegend.tsx` | Replaces `OscillatorControls.tsx` and the old value row. One legend per chart pane, placed at the pane top from `pane.getHTMLElement()`. It keeps the hover state itself, so a mouse move does not render the whole workspace. |
| `components/chart-workspace/runtime.ts` | `IndicatorRenderer` has `valuesAt`, `ownerOf`, `paneIndexOf` and `emphasize`. A selected line gets marks (`SelectionMarks` primitive). |
| `components/chart-workspace/ChartWorkspace.tsx` | Uses the legend. The alarm check still reads the `sample` state, which hover never changes. |
| `i18n/messages/workspace.ts`, `workspaceHints.ts` | Labels and hints for the new eye, settings and delete buttons (tr, en, de). |
| `e2e/mocked/chart-hover*.spec.ts`, `docs/features/features.yaml` | New feature `ANA-22`, 10 unit tests and 8 page tests. |

## Why
- Hover state lives in the legend, not in `ChartWorkspace`. The alarm effect depends on `sample`, so hover values cannot reach it. A page test sweeps the mouse over the chart and checks that an armed alarm stays armed.
- Buttons use opacity, not `display: none`. Tests and keyboard users still reach them, and `focus-within` shows them.
- A hidden indicator, or one outside its time frame range, keeps a dimmed row without a value. The user needs the row to show the indicator again. Old tests expected that hidden indicators disappear from the value row. They now check `data-visible` and `data-drawn`.
- Price legend position. On `/chart` it sits under the chart's own OHLC line (20 px). On `/formasyon` it sits below the toolbars that cover the top of the chart (the default top margin). The pane menu opens upward there, as before.
- At 375 px on `/formasyon`, the floating toolbar sits at the bottom edge and can touch the legend of the lowest pane. The row stays above the toolbar in the checked layout. Not changed.

- The legend has no "add indicator" button. The toolbar button "Indicators" does the same. An invisible button at the pane top blocked drawing and measuring drags.
- The legend root is 1 px in size and its rows are absolute. A full-size root covered the toolbars on `/formasyon`, and FRM-23 failed.
- Review fixes: hits on price lines (RSI bands, zero line) do not count as a line hit. `key={context.key}` resets hover and selection on a chart change. Hover values and the hand cursor refresh after a data update. The open menu keeps its buttons visible.

## Verification
- `playwright test --project=mocked chart-hover chart-workspace chart-toolbar chart-indicators tooltips` passed, 78 tests on the touched specs, plus a run of formation-page, mobile-layout, tooltips, analysis-chart, backtest and chart specs, on port 3190. The default port 3100 was used by another process.
- `tsc --noEmit` and `eslint` on the changed folders: no output.
- Screenshots on `/chart`, backtest and `/formasyon` in dark and light, at 1280 and 375 px, checked by eye. The line thickness is canvas only and has no automatic test.

## Lessons
- Opacity does not inherit. A test must multiply the opacity of all ancestors.
- The chart draws internal elements with `z-index: 50`. An overlay with a menu needs a higher index than that, or the menu loses clicks.
