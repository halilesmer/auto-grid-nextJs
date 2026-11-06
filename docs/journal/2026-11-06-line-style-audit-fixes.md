---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [ANA-25, FRM-46, FRM-47, UI-07]
areas: [frontend]
---

# Line style audit: three fixes (R1-01, R1-09, R1-12)

## Request
The Opus audit of the line style work (PR 394, 395, 396) found three defects. The project owner approved the fixes in advance.

## Solution
| File | Change |
|---|---|
| `src/lib/formation/lineStyle.ts` | New `canvasColor()` resolves `var(--name)` to the real color. The `COLOR` filter now accepts hex with 3, 4, 6 or 8 digits and `rgb()/hsl()` with numbers only. |
| `src/components/analysis/chart/ChartCore.tsx` | The trend color goes through `canvasColor()` with `getComputedStyle` of the chart host before it reaches the canvas. |
| `src/components/formation/FormationChart.tsx`, `hints.ts` | The D badges get a tooltip (`formation.expectedD.select.hint`, tr/en/de) through a `foreignObject`. |
| `e2e/mocked/tooltips.spec.ts` | UI-07 now also checks `[role="button"]`. |

## Why
- R1-01: a canvas ignores `strokeStyle = 'var(--x)'`. The stroke then kept the halo color (the panel background), so a gray trend line was invisible. Only the trend reaches a canvas; all other roles are SVG, where `var()` works.
- R1-09: the old filter passed `#12345` and `rgb(,,,)`. The SVG then drew no line. No injection risk.
- R1-12: a tooltip is an HTML element, so an SVG badge needs a `foreignObject` anchor. Keyboard focus stays on the badge, so the tooltip opens on hover only. The badge keeps its `aria-label`.

## Verification
- R1-09 and R1-01 unit tests (`formation-line-style-lib.spec.ts`): red before the fix, green after.
- R1-01 pixel test (`chart-trend-menu.spec.ts`, light and dark): red before the fix (no gray pixel on the line), green after.

## Lessons
- A value that goes to a canvas must be a resolved color. Never give CSS variables to `strokeStyle` or `fillStyle`.
- UI-07 must look at `role="button"` too, not only `<button>`.
