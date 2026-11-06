---
date: 2026-11-06
author: Claude
type: decision
status: open
pr: []
features: [UI-20, UI-18, UI-17, ANA-17]
areas: [frontend]
---

# One window for indicators and drawings (plan 1106-A3)

## Request
The /chart toolbar had two buttons that open almost the same thing: "Göstergeler" (indicators) and "Çizim nesneleri" (drawing objects). Remove the "Çizim nesneleri" button. Keep all of its settings: move them into the window of the "Göstergeler" button, so that one button manages everything. The approved design is the canvas "Tek düğme: Göstergeler ve çizimler" (boards `Main`, `Toolbar`).

## Solution
| File | Change |
|---|---|
| `components/chart-workspace/IndicatorDialog.tsx` | the list view has two tabs (`AnimatedTabs`): Göstergeler and Çizimler, each with its count; title `cw.indicatorsAndDrawings`; each indicator row has a show/hide button (`indicator-visibility`; its label states the current state, Görünür or Gizli) |
| `components/chart-workspace/ChartWorkspace.tsx` | the `ListTree` button, the `objectsOpen` state and the object modal are removed; the drawing list and editor are now `drawingsPanel` (`drawing-objects`), built only while the dialog is open and given to the dialog; no drawings → `cw.drawingsEmpty` |
| `i18n/messages/workspace.ts`, `workspaceHints.ts` | new `cw.indicatorsAndDrawings`, `cw.tab.indicators`, `cw.tab.drawings`, `cw.drawingsEmpty` and the tab hints; `cw.indicators.hint` names drawings; `cw.objects`, `cw.objects.hint`, `cw.addIndicator`, `cw.addIndicator.hint` removed |
| `docs/chart-workspace.md`, `docs/features/features.yaml` (UI-16, ANA-20, new UI-20) | the object list text now names the two tabs |
| `e2e/fixtures/chart-dialog.ts` | `openDrawings()` and `dialogTab()` for the tests |
| `e2e/mocked/chart-workspace.spec.ts`, `chart-toolbar.spec.ts`, `chart-dock.spec.ts`, `chart-single-rsi.spec.ts` | tests open the Çizimler tab instead of the removed button; new test `@UI-20` |

## Why
- The drawing editor is the only place for per-drawing settings (name, colour, width, line style, lock, visibility, text, fill, Fibonacci levels, duplicate, front/back, table rows). The left drawing bar has no colour or width control. So the editor moves; it is not removed.
- The editor stays in `ChartWorkspace` and goes to the dialog as a React node. It uses the drawing manager, the selection and `checkpoint()`, which live there; a move into the dialog would need many new props.
- Show/hide of an indicator uses the dialog `update()`, so it goes through the same `onChange` as all other dialog changes.
- The Göstergeler tab lists `paneIndicators`, as before: the system RSI is not in the list while its layer is off. The old object list showed it; there, the eye had no effect while the layer was off. The layers menu switches the layer on.
- The button keeps its accessible name `cw.indicators`; only the hint and the window title name the drawings.

## Verification
- `npx tsc --noEmit` and ESLint on the changed files: no errors.
- Playwright (mocked): see the PR.

## Open points
- [ ] Halil checks the window on his own chart (tabs, eye button, drawing editor).

## Lessons
The old test `UI-18 11` checked a defect of the object list (empty name). With the list gone, the test now checks the rule of the Göstergeler tab for the system RSI.
