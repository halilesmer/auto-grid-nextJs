---
date: 2026-11-12
author: Claude
type: feature
status: done
pr: []
features: [UI-27]
areas: [frontend, docs]
---

# Fibonacci dialog: TradingView colour panel, one-row levels, unsaved-changes prompt

## Request

The owner compared the Fibonacci settings dialog with TradingView. The level rows shifted, the numbers in the number fields were cut off by the spin arrows, and the colour panel was different. He asked for the same layout and panel as TradingView. He also asked for a prompt when the dialog closes with changes that were not saved with Tamam.

## Cause

Each level row had five controls (check box, coefficient, colour, opacity, text). The row wrapped at different widths, so the columns did not align. The browser spin arrows took space inside the narrow number fields. The colour button was a plain system colour input without palette or opacity.

## Solution

| File | Change |
|---|---|
| `components/chart-workspace/ColorPalette.tsx` (new) | Colour button with a floating panel: grey row and 10 main colours, 6 rows of shades, "+" opens the system colour picker, custom colours after "+", opacity slider and percent field, optional extra content (level text) |
| `store/useCustomColorsStore.ts` (new) | Custom colours in `localStorage` (`grid-robot-custom-colors-v1`), at most 19, newest last |
| `components/chart-workspace/FibSettingsDialog.tsx` | One row per level: check box, coefficient, colour. Level text and opacity moved into the panel. Trend line and "Tek renk kullan" use the same panel. Close (X, Esc, backdrop) with changes opens a prompt: save, do not save, stay |
| `app/globals.css`, `indicatorControls.tsx` | Class `spin-on-hover`: number fields show the arrows only on hover or focus |
| `i18n/messages/fibDialog.ts` | Texts for the panel and the prompt (tr/en/de) |

### Decisions

- A custom colour is added to the list when the system picker closes (`change`), not on each move (`input`). The colour applies live during the move.
- Custom colours belong to the browser, like the theme. They do not go to the worker.
- "İptal" discards without a prompt. It is the explicit "discard" button.
- The prompt compares a snapshot of name, style, the two points and visibility, independent of key order. A value that is changed and changed back can still count as a change; this is accepted.

## Tests

- `e2e/mocked/chart-fib-unsaved.spec.ts` (@UI-27): prompt (stay, discard, save, İptal without prompt), panel (80 swatches, custom colour kept after reload, opacity kept), one-row level at 375 px and desktop.
- `e2e/mocked/chart-fib-text-opacity.spec.ts` now opens the panel before it sets text and opacity.
