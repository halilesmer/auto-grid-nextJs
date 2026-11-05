---
date: 2026-11-05
author: Claude
type: plan
status: open
pr: []
features: [FRM-46, FRM-20, FRM-44, ANA-21]
areas: [frontend, docs]
---

# Formation lines: gray and dashed by default, style per line role

## Request

The owner asked on 2026-11-05 (plan `1105-A7/A8`):

- Formation lines must be gray and dashed by default.
- Color, type and width of the formation lines, the trend path and the indicators must be adjustable.
- The settings must open from a menu on right click or double click on the line.

## Cause

After plan `1105-A5` the formations follow the trend path. The trend path (2 px, solid, candle color) and the formation zigzag (2.2 px, solid, direction color) go through the same swing points. The user cannot tell them apart.

## Solution

Each step has its own session and PR.

| Step | Content | State |
|---|---|---|
| S1 | Style model and defaults (`lib/formation/lineStyle.ts`), role on each line primitive, store fields, trend path reads the style | Done in this entry (FRM-46) |
| S2 | Shared context menu and the menu on formation lines (FRM-47) | Open |
| S3 | Indicator `lineStyle` and menu (ANA-24) | Open |
| S4 | Trend path `hitTest` and menu (ANA-25) | Open |

### S1 decisions

- Eight roles: `trendUp`, `trendDown`, `zigzag`, `expected`, `neck`, `ratio`, `target`, `zone`. Each has `color`, `style` (solid, dashed, dotted), `width` (1 to 4) and `visible`. An empty color means the theme color of the role. For the trend roles it means the candle color.
- Defaults (A8): `zigzag` gray (`--muted-foreground`), dashed `6 4`, 2 px. `expected` gray, dotted `2 4`, 2 px. `neck` gray, dashed. Trend roles: solid, 2 px, candle color. `ratio`, `target` and `zone` keep their old look.
- The ring "D?", its text and the price label keep the direction color (A8.3). Only lines and rectangles carry a `role`.
- One style per browser (`useAnalysisPrefsStore.formationStyle`, `localStorage`). The trend path reads `formationStyle.trendUp` and `.trendDown`; there is no separate `trendStyle` field.
- Persist version 1. An older record has no style fields and falls back to the defaults. `sanitizeFormationStyle()` replaces each invalid field with its default. It accepts only hex, `var(--name)`, `rgb()` and `hsl()` colors, because the color goes into an SVG attribute.
- The expected path has the attribute `data-expected-path`. The tests FRM-20 and FRM-44 select it instead of `stroke-dasharray="6 5"`. The behavior changed (the zigzag is now dashed too), so the old selector would match the wrong lines. The checks are the same.

### Lessons

- `openPage()` in `formation-page.spec.ts` writes a version-0 record with `seedFixtureTrend(..., force)` on every load. A test that needs stored prefs must add its init script after that seed and merge into the record.

### Next steps

S2 to S4 add their results to this entry.
