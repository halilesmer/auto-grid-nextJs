---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [UI-18, UI-19]
areas: [frontend]
---

# Review fixes for the single RSI and the tabbed indicator dialog (plan 1106-A2)

## Request
The project owner could not see the gradient fill and asked for a review of PR 407 (UI-18, one RSI) and PR 412 (UI-19, tabbed dialog). A reviewer found 12 points. The main session checked each one in the code: 11 were real defects, point 9 is a deliberate difference. This entry lists them with their root causes.

## Findings and fixes

| # | Defect | Root cause | Fix |
|---|---|---|---|
| G | Gradient fill almost invisible | Row default `opacity: 40` on `over`/`under`; TradingView fills with full colour at the end and clear at the band line | Default opacity 100 (`indicatorStyle.ts`) |
| 1 | Critical: old documents were written back raw | `write()` rebuilt `combined` from `remote.documents` with only the image reader. Documents this tab never touched went back to disk under the version 3 header and into memory without parsing | One parser `parseStoredDocument(doc, version)` used by `hydrate` and `write`. Version 1 documents move to the single RSI, version 2 documents get `visibility` |
| 2 | Trash deleted the alarms of the system RSI | `removeIndicators` kept the indicator but filtered alarms by `ids` | `alarmsAfterRemove` keeps alarms of `system-rsi` |
| 3 | Style tab main line row | `row('rsi').on` was not read; other kinds showed the label "RSI" | Series stays (scale, legend and bands depend on it) and turns transparent; new key `ind.row.line` ("Çizgi" / "Line" / "Linie") |
| 4 | Number fields clamped on every key | `NumberBox` clamped each `onChange`; typing "8" for 85 gave 50 at once | Text stays as typed; a value inside the limits goes live at once; the clamp runs on blur or Enter |
| 5 | Legend dropped trailing zeros | `maximumFractionDigits` only | `legendValueOptions` sets `minimumFractionDigits` too (53,70) |
| 6 | Reset of the system RSI used a saved RSI default | Saved default was merged over the factory look including inputs | `resetIndicator`: inputs (length, source, timeframe, smoothing, bands) always come from `systemRsiIndicator()`; only the look may come from the saved default |
| 7 | Formation match compared timeframe with 0 | `runtime.ts` uses the chart candles when `timeframe <= chart timeframe`; the check used `=== 0`, so RSI H1 on an H1 chart hid the drawings | `matchesFormationRsi` / `usesChartCandles`, with the chart seconds (`hit.tf` on the formation page) |
| 8 | Gradient series on the wrong scale | `BaselineSeries` had no `priceScaleId` | `priceScaleId: scaleOf(config)` |
| 10 | Version 2 range conversion lost data | Unit stayed open for its whole range | Minute and hour range narrowed to the old range (`from = max(1, ceil(min/step))`, `to = min(max, floor(max/step))`); a unit with no interval inside is off |
| 11 | Empty name in the object list | `names` was built from the pane indicators, which leave out the system RSI while its layer is off | Names built from `doc.indicators` |
| 12 | Old layer text | `cw.layerRsi` still said "RSI(7) from closed candles" and "RSI 14, EWO" | Label "RSI"; hint says the gear opens the settings and the formation rules read RSI 7 · Close · 80/20 (tr/en/de) |

## Point 9: difference kept on purpose
The pane RSI uses the TradingView formula: when the loss is 0, the RSI is 100, and a gap in the data restarts the warm-up. The formation function `wilderRsi` uses the formation rule: when gain and loss are both 0, the RSI is 50. The two can differ on flat data. Do not make them the same. The formation scanner, `RSI_PARAMS` and the S1 band scale (32 px above, 10 px below) did not change.

## Tests
- `e2e/mocked/chart-rsi-review-lib.spec.ts` (no page): G, 1 (v1 and v2), 2, 5, 6, 7, 10. Before the fixes G, 1 and 10 were red.
- `chart-indicator-dialog.spec.ts`: 3, 4 (typed with the keyboard), 8 (right and left scale).
- `chart-single-rsi.spec.ts`: 11.

## Lessons
- A function that rewrites a stored file must read it through the same parser as the loader. Raw pass-through of untouched data undoes every migration.
- Clamping inside `onChange` breaks typing; clamp when the user leaves the field.
