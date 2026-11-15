---
date: 2026-11-15
author: Claude
type: change
status: open
pr: []
features: [USR-17, USR-16, ANA-19]
areas: [settings, chart, user-prefs]
---

# Oscillators: one standard everywhere or separate per product

## Request
RSI and EWO must open with the same settings in every product (plan 1114-A3, design approved by Halil on 2026-11-14). Settings > Chart gets the choice "Same standard everywhere" (default) or "Separate per product".

## Problem
Indicators live in the chart document of each product (`documents[key]`). `indicatorDefaults` only seeds an indicator that the user adds later. So every product kept its own RSI/EWO look, pane heights and pane order.

## Solution
- Two new `user_prefs` keys in `chartPrefs.ts`: `chart_osc_scope` (`{mode: 'standard' | 'product'}`, default standard) and `chart_osc_standard` (`{indicators, paneOrder, paneHeights}`; empty means the default RSI(7) and EWO). The worker needed no change; each value stays below 8 KB through the existing check in `change()`.
- `lib/chart-workspace/oscStandard.ts` (pure data): `composeStandard` replaces the RSI and EWO part of the product document with the standard, `splitStandard` splits a saved document back. In standard mode `ChartWorkspace` writes the RSI/EWO part, the pane order and the pane heights to `chart_osc_standard` and writes the rest to the product document. The product's own RSI/EWO records, order and heights are kept as they were, so "Separate per product" shows them again. Nothing is deleted.
- Standard mode applies to charts with the system RSI (`/chart` and the formation chart). The backtest chart is not changed.
- Readers outside `ChartWorkspace` that read the RSI setting of a product (the formation rule match in `OneChart` and `FormationChart`, the `data-rsi-visible` flag in `ChartCore`) use `systemRsiOf`, which reads the standard in standard mode.
- Stays per product on the device: other indicators (SMA, EMA, MACD, BB, ATR), drawings, alarms, the visible range and the RSI layer switch (`overlays.rsi`). The eye of an indicator is part of the standard, the layer switch is not.
- The indicator settings window (RSI window) is not changed: no warning, no new button.
- Settings > Chart: new row "Oscillators" with two radio cards, the six included items, the info box with the number of products that have their own records, and the note "The choice is saved at once".

## Decisions
- Default is the standard (Halil). A user who changed RSI/EWO per product sees the standard after the update. Their product records stay and return in "Separate per product".
- The "current standard" table was removed from the design (Halil, 2026-11-14).

## Tests changed and why
- Three older tests assumed per-product records: UI-24 "height stays per product", UI-11 "a layer switched on returns at the bottom" and UI-18 "a version 1 document moves to the new RSI". They now start in the mode "Separate per product" (`chart_osc_scope` set in the mock worker); their assertions are unchanged. UI-24 has a new twin for the standard mode (the dragged height shows in another product).
- Consequence for the RSI layer switch: in standard mode the pane order is the standard order, so a layer switched on again returns to its place in the standard, not at the bottom.

## Tests
- `e2e/mocked/settings-osc-scope.spec.ts`, tag `@USR-17`: encoding, compose and split, the setting row and its worker write, sharing between two symbols, product mode keeps the change local, no overflow at 375 px.

## Open
- Manual check by Halil on a real phone (USR-17, manuell).
