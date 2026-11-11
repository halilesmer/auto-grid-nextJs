---
date: 2026-11-11
author: Claude
type: feature
status: done
pr: [504]
features: [UI-11]
areas: [frontend]
---

# Oscillator panes 20% lower

## Request
When a product is opened for the first time, only RSI and EWO shall show of the oscillators. Both panes shall be 2/10 lower.

## Finding
The first part is done already. PR 501 removed the system layer Wave 5/35 and made every new chart start with the default EWO (`ChartWorkspace.tsx`). A new chart shows the system RSI(7) and the EWO only. This branch had a stored first-open document for the same result; it was dropped after the merge with `main`, because it would have added a second EWO.

## Solution
| File | Change |
|---|---|
| `src/components/chart-workspace/runtime.ts` | `OSCILLATOR_PANE_PART` 0.5 → 0.4: every oscillator pane is 0.4 times the price pane. |
| `e2e/mocked/chart-pane-model.spec.ts` | The ratio test expects price pane = 2.5 × oscillator pane. |
| `docs/features/features.yaml` | UI-11 text: 0,4 of the price pane. |

## Why
- "2/10 lower" is read as 20% less height: 0.5 → 0.4. Saved pane heights (the user dragged a pane) stay as they are.

## Verification
See the pull request.
