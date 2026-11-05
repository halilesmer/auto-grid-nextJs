---
date: 2026-11-05
author: Claude
type: feature
status: open
pr: []
features: [UI-11, ANA-20, ANA-22]
areas: [frontend, tests]
---

# Oscillator panes behave like TradingView (PR 2)

## Request
- Plan 1105-A6, steps A6.6 to A6.8. System panes (RSI(7), Wave 5/35) and user panes act the same.
- Reference: measured in the TradingView Advanced Charts demo.

## Solution
| Topic | Change |
|---|---|
| Eye (A6.6) | `IndicatorRenderer` builds a series with `visible: false` for a hidden oscillator. The pane stays at its place and height. The row is grey with the eye-off icon, has no value and does not move to the price pane. A hidden indicator is not calculated. A pane stays while one indicator of it stays in the list. |
| Height (A6.7) | One part for each oscillator pane: 0.5 of the price pane (2 : 1). The values 0.2 and 0.24 of PR 1 are gone. The collapsed strip stays 32 px. |
| Buttons (A6.8) | Order: up, down, delete (trash can), collapse, maximize. A move that is not possible has no button (before: disabled). The delete button in the row is a trash can too. |
| Maximize | Stretch 1 : 1000 left a 2 px strip and a separator for each other pane (measured: 2, 2, 912, 2, 2 px). The chart has a minimum height. The renderer now hides the table rows of the other panes and their separators, and shows them again on restore. Measured: 0, 0, 915, 0, 0. |

| Small screen | At 375 x 812 four oscillators at 2 : 1 left the price pane 135 px high (UI-12 needs 150). `applyPaneParts` keeps the price pane at 150 px when the room is too small and shares the rest between the oscillator panes. Desktop keeps 2 : 1. |
| Menu layer | The chart page bar is `z-[53]` (was 50). The legend (z 51) lay over the account list at 812 x 375 (UI-15). |

## Decision
- **Decision:** the eye no longer moves a row to the price pane (PR 1 text "the pane goes and the row stays in the price pane" no longer applies).
- **Reason:** TradingView keeps the pane; a layout that jumps on each click is hard to use.

## Tests
- New `chart-pane-model.spec.ts` (`@UI-11`, `@ANA-20`): ratio 2 : 1 with 1 and 2 oscillators (±2 px), eye keeps the pane and height, button order and missing end buttons, maximize leaves 0 px for the others.
- Red first: the 4 new tests failed on the old `src` (31 s, 4 s, 5 s, 31 s), then passed.
- Test geometry changed because panes moved, not because a check was loosened: FRM-23 wheel point y 450 to 250 (y 450 hit a pane button), ANA-17 second line offset 100 to 60 (offset 100 fell into an oscillator pane).
- Changed, not loosened: ANA-20 `Bereiche lassen sich verschieben…` expected the down button to be disabled on the last pane; it now expects no button. The ANA-20 menu test comment for the eye changed (row is grey, not struck through). The assertion `data-visible=false` stays.

## Open points
- [ ] Live check by the user in the browser.
