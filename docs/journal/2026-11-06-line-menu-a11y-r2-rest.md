---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [FRM-47]
areas: [frontend, chart]
---

# Line menu: roles, hint texts, empty custom color, swatch border (R2 rest)

## Request
The Opus audit (R2) left five low findings in the line style menu: R2-03, R2-04 (text only), R2-06, R2-08, R2-10. One more task: look at a flaky FRM-47 focus test.

## Cause and solution
| ID | Cause | Change |
|---|---|---|
| R2-03 | `role="menu"` held plain buttons and an input. | `ContextMenu` provides `useInContextMenu`. In a menu, `LineStyleControls` renders `menuitemradio` + `aria-checked`; the custom color input gets `role="menuitem"`. The table keeps `button` + `aria-pressed`. |
| R2-04 | `cw.lineMenu.hint` said a long press is a right click on touch screens. This is true for Android only. | Text in tr/en/de: iOS has no menu; use ⋯ and the settings dialog (indicators) or the settings table (formations). No new button (approved plan A7.6/A7.7). |
| R2-06 | `lineStyle.auto.theme.hint` said "default color"; the default of some roles is the separate gray swatch. `formation.line.table.hint` was unused and said "OK". | "Own color of the role". The table hint says Apply and is linked to the table heading with a tooltip. |
| R2-08 | `RowColor` showed `#808080` when no hex color was set. | New `empty` state: hatched swatch. The menu sets it when `spec.color` is not a hex color. |
| R2-10 | Swatch border `border-border` is 1.26:1 against the popover. | Swatches and pills use `border-muted-foreground/50`. |

## FRM-47 focus test (`Escape gibt den Fokus …`)
The failure is real but rare: 3 of 60 and 1 of 100 runs with 8 workers fail at the last `toBeFocused` (the settings button is not focused after Escape). The cause is **not proven**. Assumption: the toolbar button is rebuilt between `focus()` and the menu opening, so `previous` is `body`. A kept element handle stayed connected in 20 of 20 runs with 1 worker under the heavy lock, so the rebuild did not show up at idle. A run with a `MutationObserver` was stopped on the coordinator's request (machine load). The test is not changed. Open: if it fails again, log removed nodes and `activeElement` at the `contextmenu` event.

## Tests
`e2e/mocked/formation-line-menu.spec.ts`: four new tests (roles and keyboard, empty custom color, swatch border, texts). Menu lookups in the indicator, trend and formation specs now use `menuitemradio`. Without the fix, the four new tests fail.
