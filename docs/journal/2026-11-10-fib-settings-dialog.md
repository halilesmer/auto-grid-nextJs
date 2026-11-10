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
| S2 | Coordinates tab, Visibility tab, fix of the W1/MN interval that goes to the library as `1D` | next, separate session |

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
- **A4.7** "Bar" in the Coordinates tab counts from the first loaded candle.

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

## Why
- **Inline controls instead of pop-ups.** The prototype opens a pop-up for the trend line colour, width and style. The window uses a colour field and two selects in one row. They work on touch and can be tested. The look of the pop-up can come later.
- **One model, `FibStyle`.** Template, default and window use the same set of keys. A template applies every key, so an old value cannot stay behind. Stored data goes through `normalizeFibStyle`, so a broken record cannot break the chart.
- **The window is its own component.** The editor for other drawings stays in `ChartWorkspace` as before. The Fib window needs only the drawing, the scale mode, the lock state and three callbacks.

## Open
- S2: Coordinates tab, Visibility tab, W1/MN interval fix.
- Check on a phone: the two-column level grid at 375 px.
