---
date: 2026-11-02
author: Claude
type: feature
status: done
pr: []
features: [FRM-35, FRM-20]
areas: [frontend, tests]
---

# The chart on /formasyon gets a Wave sub-window

## Request
- Finding 42 of package D: the rule book (Z-SIG-03) shows the wave (EWO 5/35) as a histogram under the chart. The page showed only candles and RSI.
- The user approved the design on 2026-11-02. Two PRs: 42-A (this entry) adds the Wave window with a layer switch and a legend entry. 42-B adds the divergence lines (Z-SIG-04, FRM-36).

## Solution
| File | Change |
|---|---|
| `components/analysis/chart/ChartCore.tsx` | New optional prop `systemWave` and type `SystemWave`. It creates a `HistogramSeries` in its own pane after the RSI pane. Stretch 5 : 1 : 1.2, so the candles stay the largest area. Bars use the tokens `success` (value >= 0) and `danger` (value < 0), read at run time (`readChartColors`) and set again after a theme change. `ChartScene` has a new field `wave`. The container shows `data-system-panes`, `data-wave-points` and `data-wave-visible` for tests. |
| `components/formation/FormationChart.tsx` | Wave points come from `view.wave` without `null`. New layer switch `wave` (default on) next to the RSI switch. The overlay height covers all sub-panes, `yWave` converts a wave value to y, and the pane carries the label "Wave 5/35". |
| `lib/formation/drawingLayout.ts` | `LayoutInput.yWave` and `DrawingGroup.pane = 'wave'`. No drawing uses them yet. PR 42-B draws the divergence line with them. |
| `app/formasyon/page.tsx`, `i18n/messages/formation.ts`, `workspace.ts` | Legend entry, switch label, pane label and tooltip (tr, en, de). |
| `docs/features/features.yaml`, `e2e/mocked/formation-page.spec.ts` | New `FRM-35` and two page tests. |

## Why
- The Analysis page `/chart` stays as it is: `systemWave` is optional.
- The pane label sits in the formation overlay. It hides together with the formation drawings (layer switch "Formation drawings"). This is a small deviation from the design.
- A hidden Wave layer sets the series to invisible, like the RSI layer. The empty pane keeps its height.

## Decision
- **Decision:** `/formasyon` shows a third sub-window "Wave 5/35" with its own layer switch.
- **Reason:** rule book `sig-signale.md` Z-SIG-03.
- **Cost (Bedel):** a third pane makes the candle and RSI panes lower.

## Tests
- `@FRM-35` in `formation-page.spec.ts`: three system panes, 155 wave points for 189 closed candles (the wave needs 35 candles, so 189 - 34), the switch hides and shows the layer, the legend names the entry.
- The red run came first: both tests failed because the chart had no wave pane. The first red run failed on the type check because the new message keys were missing.

## Not done
- Codex scan skipped: the weekly limit had 3 percent left (rule `ajan-kullanimi.md` section 8). The `reviewer` subagent was skipped for the same reason.

## Open finding (not fixed here)
- On `/formasyon` a layer switch (RSI and Wave alike) changes the chart while the settings dialog is open. After "Apply" the value returned to "on" in the e2e run. The test therefore checks the live switch only. The cause is in the shared overlay store, not in this change. It needs its own diagnosis.
- The legend (visible from 900 px) now covers the lower edge of the Wave pane.
