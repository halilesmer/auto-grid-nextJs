---
date: 2026-11-12
author: Claude
type: fix
status: done
pr: [510]
features: [UI-22, UI-29]
areas: [frontend, tests]
---

# Card title without setup, UI-29 magnet fix

## Request
The right card on /chart showed "EURUSD · Setup 1". The project owner wanted only the symbol, with the formation name to the right of the title (option B).

## Cause
UI-29 (`e2e/mocked/chart-floating-bar-templates.spec.ts`) failed in CI on every branch from approx. 01:30 UTC on 2026-11-12. It passed locally. The CI trace showed that the trend line was drawn, but the magnet mode was on: the first point snapped approx. 18 px to a candle value. The middle of the line was then not at the click point, so the selection click missed the line and the floating toolbar did not open. A fixed mock time (`E2E_FAKE_NOW`) did not reproduce the failure locally, so the candle data in the browser decides where the point snaps.

## Solution
| File | Change |
|---|---|
| `src/components/chart-page/CardTitle.tsx` | New: symbol, separator, formation name |
| `OneChart.tsx`, `ChartCard.tsx`, `FloatingCard.tsx`, `ChartSideRail.tsx` | Title is the symbol only, the formation name is a separate prop |
| `e2e/mocked/chart-floating-bar-templates.spec.ts` | Switch the magnet off before drawing, as `chart-fib-hit.spec.ts` does |

## Why
A test that clicks a drawing at calculated pixel points must draw with the magnet off. The assertions stay the same.
