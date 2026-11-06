---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [ANA-24]
areas: [frontend, chart]
---

# Indicator line menu: R4 audit findings fixed

## Request
The Opus audit R4 found defects in the indicator line menu (plan 1105-A7/A8, S3). Fix the indicator side in one PR. The trend menu findings (R4-04, R4-05, R4-10) are in other work.

## Cause
| ID | Symptom | Cause |
|---|---|---|
| R4-01 | "Theme color" paints the line black | `toHex('')` ran the canvas test with an empty string. The canvas ignores it and `#000000` stayed. |
| R4-02 | Double-click menu opens far from the click in a lower pane (RSI) | `onDouble` added the pane-relative `param.point` to the corner of the chart host. |
| R4-03 | Double-click on a line with a drawing tool open the menu | The first click ends the tool, so at `dblclick` no tool is active. The trend menu had a 600 ms guard, the indicator menu had none. |
| R4-06 | "Gray" does not follow the theme and is not marked when the menu opens again | The swatch was saved as the hex of the theme at that time. |
| R4-07 | The hint says "main line"; EWO shows type and width buttons without effect | The type applies to all lines. EWO draws bars. |
| R4-08 | The catalog promises "Favorit" in the menu | The menu did not have the action. |
| R4-09 | Tests did not cover the above | The "empty area" click hit the 52 px drawing rail; the theme tests only saved a screenshot. |

## Solution
| File | Change |
|---|---|
| `IndicatorLineMenu.tsx` | `toHex` returns `''` for an empty color, keeps the gray variable, and returns `null` for an invalid color (no change). Favorite action. EWO shows color only. |
| `IndicatorLegend.tsx` | Double-click position from `param.sourceEvent`; no menu without it. Tool guard through `useToolGrace`. |
| `drawingPriority.ts` | `TOOL_GRACE_MS` and `useToolGrace`: one rule for both line menus. |
| `TrendLineMenu.tsx` | Uses `useToolGrace`. |
| `useChartWorkspaceStore.ts`, `indicators.ts`, `runtime.ts`, `IndicatorDialog.tsx` | `INDICATOR_GRAY` (`var(--muted-foreground)`) is a valid stored color; `ownColor` resolves it for the canvas. Old documents stay valid. |
| `lineStyle.ts` (messages) | The hint of the line type names all lines of the indicator. |
| `chart-indicator-menu.spec.ts`, `features.yaml` | New tests (tag `@ANA-24`), catalog text. |

## Verification
See the PR description (red/green run per finding).

## Lessons
A canvas color test needs two different start values to tell "ignored" from "accepted".
