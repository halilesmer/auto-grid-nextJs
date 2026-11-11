---
date: 2026-11-10
author: Claude
type: decision
status: open
pr: [496]
features: [UI-27, UI-20]
areas: [frontend]
---

# Fibonacci settings window like TradingView (plan 1110-A4)

## Request
Halil wants the settings window of the TradingView Fib retracement: tabs Style, Coordinates and Visibility, and a Template menu. A double click on the drawing opens it. A ready template holds an extended level set. Before this plan, the only Fib setting was one comma list of levels in the drawings tab of the indicators window. That field set all levels to one colour.

## Solution
Plan 1110-A4 has two steps.

| Step | Content | State |
|---|---|---|
| S1 | Window with the Style tab, Template menu, double click, "Ayarlar…" button, built-in level set template, last-used style for new drawings | this entry (UI-27) |
| S2 | Coordinates tab, Visibility tab, fix of the W1/MN interval that goes to the library as `1D` | done (UI-27) |
| S4 | Right-click menu (A4.9) and the Alt+F shortcut | done (UI-28) |
| S5 | Level text on the chart and colour opacity (A4.11) | next |
| S7 | Floating toolbar of the selected drawing, top centre (A4.13) | after S5 |

S6 (Fib alert) left the plan on 2026-11-11 by decision of Halil. S2, S4, S5 and S7 touch the same files, so they run one after the other.

| File | Change |
|---|---|
| `components/chart-workspace/FibSettingsDialog.tsx` | the window: title with rename, tab bar (one tab; S2 adds tabs to the array), 24 level slots in two columns, template menu, save and delete dialogs |
| `lib/chart-workspace/fibStyle.ts` | `FibStyle` model, `normalizeFibStyle` (every field has a safe value), `presetFibStyle`, `factoryFibStyle`, defensive parsers for stored templates and defaults |
| `store/useChartWorkspaceStore.ts` | `drawingTemplates` (kind → name → style) and `drawingDefaults` (kind → last confirmed style) in the same localStorage record |
| `components/chart-workspace/ChartWorkspace.tsx` | `dblclick` listener on the workspace root, `setDefaultStyleOverride`, the "Ayarlar…" button for Fib in the drawings tab |
| `i18n/messages/fibDialog.ts` | all texts and hints in tr, en, de |
| `e2e/mocked/chart-fib-settings.spec.ts`, `docs/features/features.yaml` | new feature UI-27 and its tests |

How the window works:
- Every change goes to the drawing at once (`manager.update`) without an undo step. İptal and the close button put the first state back. Tamam saves, adds one undo step (`checkpoint`) and stores the style as the default for the next Fib drawing.
- The library reports a double click only for text tools. The workspace listens to `dblclick` itself. It opens the window when no tool is active, no tool was used in the last 600 ms (`useToolGrace`), and `hoveredId()` is a `fib-retracement`.
- Level line style and width go to `lineStyle` and `width` of the drawing. The levels do not carry their own width or style.
- The log option is on only while the price scale is logarithmic (`appearance.scale === 'log'`). Otherwise it is off and its hint says why.
- A locked workspace opens the window with all fields off and a note.
- The template stores the style only, not the points and not the visibility.

## Decisions (approved 2026-11-10)
- **A4.1** A double click opens the window. In the drawings tab, Fib has an "Ayarlar…" button in place of the comma field. Other drawings stay as before.
- **A4.2** The built-in template "Geniş Fib seti" (en "Extended Fib set", de "Erweitertes Fib-Set") has an extended 24-slot level set. The level set comes from the user's preference. Level 0.236 is yellow and on (Halil chose "always show yellow" in E-7 b). The name is neutral and goes through i18n; the three names are reserved, so a user cannot save a template with one of them (A4.14.1).
- **A4.3** User templates are in the browser (localStorage), like the other drawing and chart templates. The built-in template is in the code, so every device has it.
- **A4.4** A new Fib drawing starts with the last confirmed style. "Varsayılanları uygula" is the library factory setting.
- **A4.5** The Visibility tab has Ticks, Seconds and Ranges rows, but they have no effect (the app has no such chart types). The setting is stored. W1 and MN go to the library as `1D` today. S2 fixes this.
- **A4.6** White levels are not visible on a light theme. This is the same in TradingView. The colour stays as the template has it.
- **A4.7** "Bar" in the Coordinates tab counts from the first loaded candle. The point time stays unchanged until the user edits the bar field, so rounding does not move a drawing.
- **A4.8** Every level line is a hit target. The library only hit the box between the two handles, so lines outside 0–1 could not be selected. The chart component now uses `fibLevelAt` from the library for the hit test (PR 497, `2026-11-10-fib-level-hit-test.md`). Selection, cursor, hover handles, drag, double click and Delete use the same path.
- **A4.9** The right-click menu has: Template ▸, Order ▸ (bring to front, send to back), Interval visibility ▸, Object tree, Clone, Lock, Hide, Remove, Settings…. It has no Alarm, no Copy and no Synchronise. It is built in S4.
- **A4.10** Handles show when the pointer is over the drawing (not only when it is selected). A locked drawing shows no hover handles.
- **A4.11** To add: level text on the chart, colour opacity, the floating toolbar, and the Alt+F shortcut. The Fib alert left the plan on 2026-11-11 by decision of Halil.
- **A4.14.1** The name of the built-in template is neutral ("Geniş Fib seti") and goes through i18n.

## Built-in level set
24 slots, row by row (left, right). No colour means `#ffffff`.

| Row | Left | Right |
|---|---|---|
| 1 | 0 on | 0.886 on |
| 2 | 0.382 on | 0.5 on |
| 3 | 0.618 on | 0.786 on |
| 4 | 1 on | 1.618 on |
| 5 | −0.272 on | −0.414 on |
| 6 | −0.618 on | 1.272 on |
| 7 | 1.414 on | −1 on |
| 8 | 2.618 on | 2 on |
| 9 | 0.236 on, `#ffeb3b` | −0.114 on, `#f23645` |
| 10 | −1.618 on | 4 off |
| 11 | −0.382 off, `#4caf50` | 4.414 off |
| 12 | 4.618 off, `#4caf50` | 4.764 off |

Other values: trend line on, white, solid, 1 px; level lines solid, 1 px; extend right; background off; no reverse; prices on; levels on, as values; labels right and top; text on, centred and middle; font 12; log off.

## S2 result
- Tabs: the tab array of `FibSettingsDialog.tsx` now has Style, Coordinates and Visibility. The preview and undo pattern is the same: each change goes to the drawing at once (`onPreview`), İptal puts back the first drawing, Tamam saves one undo step.
- Coordinates: price and bar for each of the two points. `lib/chart-workspace/fibCoords.ts` converts bar and time (`barIndexOf`, `timeAtBar`) from the loaded bar times. Outside the loaded range it uses the timeframe length.
- Visibility: one row for each unit (seconds to months) with a check box and a from–to range. Ticks, Seconds and Ranges are saved and have no effect (A4.5). The default matrix is not saved, so a drawing without changes has no `visibility` field.
- W1/MN fix: `ChartWorkspace.tsx` sent `'1D'` for every timeframe from one day. The library reads `ND`, `NW` and `NM` (`isVisibleOnInterval`), so `libraryInterval()` now sends `1W` for W1 and `1M` for MN. Before the fix, the Weeks and Months rows had no effect.

## Why
- **Inline controls instead of pop-ups.** The prototype opens a pop-up for the trend line colour, width and style. The window uses a colour field and two selects in one row. They work on touch and can be tested. The look of the pop-up can come later.
- **One model, `FibStyle`.** Template, default and window use the same set of keys. A template applies every key, so an old value cannot stay behind. Stored data goes through `normalizeFibStyle`, so a broken record cannot break the chart.
- **The window is its own component.** The editor for other drawings stays in `ChartWorkspace` as before. The Fib window needs only the drawing, the scale mode, the lock state and three callbacks.

## Open
- S4, S5, S7 (see the step table).
- Check on a phone: the two-column level grid at 375 px.

## S4 result

- New component `DrawingContextMenu.tsx`. It takes a drawing, a screen position and the drawing manager, so the S7 floating bar can open it with its "…" button.
- Right click opens it only over a drawing (`manager.hoveredId()`). On an empty chart the browser menu stays. Esc, a click outside and the arrow keys work.
- Each change calls `manager.update(...)` (or add, remove, `setHidden`) and then one `checkpoint`. A locked drawing, or locked drawings in the toolbar, disables Remove, Hide, Clone, Order and Template apply. The hint of the row names the reason.
- "Interval visibility" opens the Fib window on the Visibility tab. It is disabled for other kinds, because only the Fib has this setting. "Settings…" opens the Fib window, and the Drawings section for other kinds. "Object tree" opens the Drawings section with the drawing selected.
- "Order" has four rows. One step forward or back changes the list order, then calls `bringToFront` for every drawing from the changed place to the end.
- Alt+F arms the Fib tool (`e.code`, because Alt+F types a different character on macOS). It does nothing in a text field or while a modal is open. The shortcut is in the hint of the Fib tool group (text only; the rail component did not change).
- After the menu closes, focus goes back to the chart host. Without this, Cmd+Z after Remove did not reach the chart.
- Test: `e2e/mocked/chart-drawing-menu.spec.ts` (UI-28).
