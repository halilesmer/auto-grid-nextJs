---
date: 2026-11-11
author: Claude
type: feature
status: done
pr: []
features: [UI-11]
areas: [frontend]
---

# First open shows RSI and EWO, panes 20% lower

## Request
When a product is opened for the first time, only RSI and EWO shall show of the oscillators (no Wave 5/35). Both panes shall be 2/10 lower.

## Solution
| File | Change |
|---|---|
| `src/components/chart-page/OneChart.tsx` | On the first open of a product (no stored document, nothing to merge from the old keys) the chart stores a document with `overlays.wave = false` and the indicators system RSI(7) and an EWO(5/35). |
| `src/components/chart-workspace/runtime.ts` | `OSCILLATOR_PANE_PART` 0.5 → 0.4: every oscillator pane is 0.4 times the price pane. |
| `e2e/fixtures/layers.ts` | New helper `enableWaveLayer`; tests that need the former three panes switch Wave on through the menu "Ebenen". |
| `e2e/mocked/*` | Tests for UI-11 updated to the new default and the 0.4 ratio. |

## Why
- Wave 5/35 and EWO(5/35) show the same histogram, so one of them is enough by default. EWO stays because it is an ordinary indicator the user can edit; Wave stays available as a layer.
- The default is stored in the document, not read as a new fallback in the layer code (`overlays.wave ?? true`). Documents that exist already, and the documents merged from the old keys, keep their panes.
- "2/10 lower" is read as 20% less height: 0.5 → 0.4. Saved pane heights (the user dragged a pane) stay as they are.

## Verification
- `tsc --noEmit` and ESLint: no new findings.
- Mocked e2e for UI-11 (20 tests), and the other specs that open the chart (`chart-hover`, `chart-layers-menu`, `chart-topbar`, `chart-workspace`, `formation-page`): pass. Two tests (`ANA-27`, indicator menu) failed once under load and passed alone and in the rerun.
- Not verified: the full e2e run and `precheck.sh`; visual check in the browser.
