---
date: 2026-11-11
author: Claude
type: decision
status: done
pr: []
features: [UI-11, UI-13, FRM-35]
areas: [frontend, tests, docs]
---

# System layer "Wave 5/35" removed; EWO stays

## Request

The owner asked: if the EWO and a second wave oscillator exist and have no technical difference, keep only the EWO and delete the other one.

## Finding

No "accelerator" exists in the code. The only twin of the EWO was the system layer "Wave 5/35" (`wave()` in `lib/formation/indicators.ts`). It is SMA(5) − SMA(35) of the median price (hl2), as an absolute value. The user indicator EWO is the same formula with a free source and an optional percent output. The Wave is therefore a setting of the EWO (source hl2, percent off). Only the default settings differ (EWO: close, percent on).

## Decision

- **Decision:** the system layer Wave 5/35 is removed (pane, layer switch in the menu "Ebenen", legend entry, texts in tr/en/de, feature FRM-35). The EWO stays as the user indicator.
- **Reason:** one oscillator, one place. The owner approved the design on 2026-11-11.
- **Cost (Bedel):** the formation page no longer shows the EWO under the chart on its own; a new chart gets the default EWO (close, percent) like the other charts. Anyone who wants the old picture sets the EWO source to hl2 and switches percent off.

## Solution

| File | Change |
|---|---|
| `components/analysis/chart/ChartCore.tsx` | `SystemWave`, the `systemWave` prop, the wave series reference and the attributes `data-wave-*` are gone |
| `components/chart-page/ChartView.tsx`, `LayersMenu.tsx`, `OneChart.tsx`, `formation/FormationChart.tsx`, `FormationLayer.tsx` | No wave points, no switch, no pane label, no legend line |
| `lib/formation/drawingLayout.ts` | `LayoutInput.yWave` and `pane: 'wave'` removed |
| `lib/chart-workspace/paneOrder.ts` | `SYSTEM_PANE_IDS` is empty. The generic system pane model stays for a future system pane |
| `components/chart-workspace/ChartWorkspace.tsx` | Every chart starts with the default EWO |
| `i18n/messages/workspace.ts`, `formation.ts` | Keys `cw.layerWave*`, `formation.legend.wave`, `formation.pane.wave` removed |
| `docs/features/features.yaml` | FRM-35 removed; UI-11, UI-13 and ANA-22 texts changed |

## Not changed

- `wave()` and the formation rules that read it (trend rules, `welle382`, Z-SIG-03) keep working. Only the picture is gone.
- Saved chart documents with `overlays.wave`, `systemPanes.wave` or `wave` in the pane order load without an error. The values are ignored.
