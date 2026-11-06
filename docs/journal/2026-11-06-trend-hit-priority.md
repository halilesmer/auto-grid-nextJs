---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [ANA-25, ANA-22]
areas: [frontend, chart]
---

# Trend line hit test: indicator lines win, menu off means no hit

## Request
The Opus audit (R4) found two defects in the trend line hit test (findings R4-04, R4-10) and two weak tests (R4-09). The fix is one PR.

## Cause
| ID | Symptom | Cause |
|---|---|---|
| R4-04 | Near the trend line (6 px), indicator lines in the price pane (EMA, SMA, BB) cannot be highlighted, selected or opened. The trend menu opens instead. | `TrendPathPrimitive.hitTest` returned `zOrder: 'top'`. In lightweight-charts 5.2.1 `hitTestPane` returns a `top` hit at once and ignores all series hits. |
| R4-10 | With "Çizgi menüsü: Kapalı" the hand cursor shows on the trend line, but a click does nothing. | `hitTest` did not know the menu setting. |

## Solution
| File | Change |
|---|---|
| `components/analysis/chart/primitives.ts` | `hitTest` returns `zOrder: 'normal'`. New `setInteractive(boolean)`; when it is false `hitTest` returns `null`. |
| `components/analysis/chart/ChartCore.tsx` | Calls `setInteractive(appearance.lineMenu !== 'off')`. |
| `docs/features/features.yaml` | ANA-25 states the priority: active tool > drawing below > formation SVG line > indicator line > trend line. |
| `e2e/mocked/chart-trend-menu.spec.ts` | New tests for both findings. The formation test title now says what it checks. The theme test checks the computed menu background. |

## Why
With `normal`, lightweight-charts compares source order: series above the candle series win, and the trend line still wins over the candles it is attached to. The alternative (keep `top` and change the catalog) was rejected: the catalog and ANA-22 say that an indicator line is never hidden by the trend line.
`lineMenu` values `both`, `right` and `double` keep the hit; the trigger choice stays in `lineMenuAllows`.

## Verification
See the PR description (red without the fix, green with it).

## Lessons
A primitive hit with `zOrder: 'top'` beats every series hit. Use `normal` unless the primitive must really cover the series.
