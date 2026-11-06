---
date: 2026-11-05
author: Claude
type: feature
status: open
pr: []
features: [ANA-25, FRM-46, FRM-47, ANA-21]
areas: [frontend, docs]
---

# Trend line: click opens a style menu

## Request

Plan `1105-A7/A8`, step S4 (A7.3). The trend line on the chart must open the same kind of menu as the formation lines: right click or double click on the line. The menu changes color, type and width. The owner approved the design (Artifact, version 3) and the automatic start of this step.

## Solution

| File | Change |
|---|---|
| `lib/chart/trendHit.ts` | Pure geometry: `distanceToSegment`, `nearestDistance`, `toScreenSegments`, `TREND_HIT_PX = 6` |
| `analysis/chart/primitives.ts` | `TrendPathPrimitive.hitTest` returns `trend-path` (`cursorStyle: 'pointer'`) within 6 px of a segment; draw and hit test share one segment list |
| `analysis/chart/TrendLineMenu.tsx` | Menu and the host that decides when to open it |
| `analysis/chart/ChartCore.tsx` | Renders the host; sets the test attributes `data-trend-width`, `-width-down`, `-style`, `-style-down`, `-color`, `-segments` |
| `chart-workspace/drawingPriority.ts`, `ChartWorkspace.tsx` | A context with the drawing state (tool active, drawing hovered) for parts inside the workspace |
| `chart-workspace/LineStyleControls.tsx` | New optional prop `colorLabel` |
| `lib/chart-workspace/lineMenu.ts` | `lineMenuAllows(mode, trigger)`, the gate for setting "Çizgi menüsü" (A7.7) |
| `i18n/messages/trendLine.ts` | New area file, three languages, with the hints |

### Decisions

- All three chart modes (Formation, Setup, Free) draw the trend line through `ChartCore`. The menu lives in `ChartCore`, so it works in all three. No mode is left out.
- The style is not a separate `trendStyle` field (S1 deviation, see the S1 entry). The menu edits `formationStyle.trendUp` and `.trendDown` in `useAnalysisPrefsStore`.
- Type and width are shared by both directions: the menu patches both roles. Only the color is per direction ("Yukarı rengi", "Aşağı rengi"). This follows the approved design. The second control group has the color only (`colorOnly`).
- "Varsayılana dön" resets `trendUp` and `trendDown` one by one. `resetFormationStyle()` without a role would reset all eight roles, so it is not used.
- The menu opens only when the pointer is on the line. The crosshair event gives `hoveredInfo.objectId === 'trend-path'`; the `contextmenu` event of the chart element and `subscribeDblClick` then open the menu. `preventDefault` runs only when the menu opens. Away from the line, with the setting off, or with a drawing tool active, the browser menu stays.
- A series other than the main one under the pointer (an indicator line) wins by the hit test of lightweight-charts itself: `hoveredInfo` then names that series, not `trend-path`. No extra code is needed. The menu of S3 will use the same `hoveredInfo`.
- "Trend ayarları…" opens `TrendSettingsPanel` in a dialog (`Modal`). The panel in the toolbar is a `DropdownMenu` with its own open state, and nothing outside can open it. The panel itself is the same component, so the confirm bar of the formation mode works in the dialog too.
- The test attribute `data-trend-segments` lists the visible segments of the line in pixels from the chart edge. The line is a canvas, so a test cannot find a point on it in any other way. The primitive reports the segments after each draw (`onLayout`); the attribute is written only when the value changes, and holds at most 40 segments. A test picks a point on a segment that no other element covers: a data-quality notice often lies over the chart.

Screenshots: `docs/journal/images/2026-11-05-trend-menu-light.png` and `…-dark.png`.

### What is not verified

- A long press on Android (it sends `contextmenu`), and any real touch device. The tests use a mouse. The tests do not run on a real device.
- iOS: Safari sends no `contextmenu` on a long press. There the trend panel stays reachable only through the gear button.

- The full `precheck.sh` ran once: 2873 of 2874 e2e tests passed. One test, UI-16 "Araç çubuğunu sıfırla", failed under load. It passed alone (11 of 11 in its file) and does not touch the trend line. CI runs the whole set again.

### Lessons

- `hitTest` is on `ISeriesPrimitive`, not on the pane view, in lightweight-charts 5.2. The result reaches the subscribers as `hoveredInfo` (`objectKind: 'primitive'`, `objectId`). `MouseEventParams.hoveredObjectId` is deprecated.
