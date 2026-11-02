---
date: 2026-11-02
author: Claude
type: fix
status: done
pr: []
features: [FRM-23, FRM-37]
areas: [frontend]
---

# Top bar overlaps with a larger browser font

## Request
On `/formasyon` the owner saw the chart tools ("Görünümü sıfırla", "Göstergeler", "Trend") on top of the timeframes and the buttons of the top bar. The owner asked to make this text smaller and to adjust it. The owner approved design B of the artifact "Formasyon Kopfleiste": thresholds in rem, and compact tools in the style of the timeframe buttons.

## Cause
- Symptom: with the root font size 20 px (browser setting "font size: large"), a 1728 px window and the side bar open, the tool bar started at 705 px and the content of the top bar ended at 790 px. Because the reserve was too small, the top bar was also squeezed and pushed the timeframes over the account selector.
- Root cause: the same as in [2026-11-02-formation-sidebar-rem-offset.md](2026-11-02-formation-sidebar-rem-offset.md). Threshold A (`@min-[1300px]/formation-main`), the reserve (`pr-[528px]`) and threshold B (`@min-[1440px]/formation-main`) were in px. The tools and the content of the top bar are in rem and grow with the font size: the tool bar was 608 px wide at 20 px (486 px at 16 px).
- The tool labels used `text-xs` (12 px at 16 px, 15 px at 20 px) next to the timeframe buttons with `text-[11px]`. The two text sizes looked mixed.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/ui/button.tsx` | New sizes `xs` (`h-6`, round, 11 px text, like the timeframe buttons) and `icon-xs` (`size-6`, round). |
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | With `overlayLayout` (only `/formasyon`) the tools use `xs` and `icon-xs`. "Reset view" and "Indicators" are icons (`Scan`, `ChartSpline`) with `aria-label` and hint. Threshold A is 71rem. In the top bar the tool container is 1 px + 37 px high, in px like the 38 px top bar; with `h-9` it went 7 px into the formation row at 20 px. |
| `frontend_nextjs/src/components/chart-workspace/TrendToggle.tsx` | Prop `size`: `sm` (default, `/chart`) or `xs` (`/formasyon`). Threshold A for the panel direction is 71rem. |
| `frontend_nextjs/src/components/formation/FormationChart.tsx` | `TrendToggle size="xs"`. |
| `frontend_nextjs/src/components/formation/FormationToolbar.tsx` | Reserve `pr-72` (18rem), threshold A 71rem, the calculation comment has the new values. |
| `frontend_nextjs/src/components/formation/FormationStatusChip.tsx` | Threshold B is 79rem. |
| `frontend_nextjs/e2e/mocked/formation-page.spec.ts` | New FRM-23 block "Browser-Schrift": no two controls of the top bar and the tool bar overlap, at 20 px (1728 and 1920 px with the side bar open; 1440, 1550 and 1728 px with the side bar closed) and at 16 px exactly at A and B. Each case also checks the position of the tools (top or bottom). The FRM-37 status button test uses the new threshold B (1300 and 1304 px instead of 1440 and 1480 px), with the same expectations. |
| `docs/features/features.yaml` | FRM-23 and FRM-37 text. |

Measured on `localhost:3000` with the DEMO account, tr and de (en is shorter); values at 16 px, values at 20 px in brackets:
- Tool bar: 272 px (333) + 4 px (5) margin on the right = 276 px (338).
- Content of the top bar from the edge of `formation-main`: ends at 845 px (1011) with the compact status button, at 969 px (1170) with the full button.
- Threshold A = 71rem = 1136 px (1420): 845 + 8 + 276 = 1129 (1359).
- Reserve = 18rem = 288 px (360): 845 + 288 = 1133 ≤ 1136 (1011 + 360 = 1371 ≤ 1420).
- Threshold B = 79rem = 1264 px (1580): 969 + 8 + 276 = 1253 (1518).

The 16 px values set the thresholds. At 20 px the margin is larger, because the 11 px text and the 15 px icons do not grow.

## Why
- Thresholds in rem grow with the font size like the content that they must hold. The widths and the thresholds use the same unit.
- Compact tools: the tool bar is 44 % narrower at 16 px (272 px instead of 486 px). At 16 px the tools are in the top bar from a chart width of 1136 px (before: 1300 px). At 20 px, a 1728 px window and the side bar open, the tools float at the bottom of the chart; with the side bar closed they are in the top bar.
- Rejected: design A, only rem thresholds. No overlap, but the tools stay at 15 px next to the 11 px timeframes, and at 20 px they go into the top bar only from a chart width of 1680 px.
- Rejected: px sizes for the whole top bar. The shared product search and account selector are in rem.
- The `/chart` page and the dashboard keep the old tool sizes, because they do not use `overlayLayout`.

## Verification
- New tests before the fix: 5 of 5 red, for example "Ansicht zurücksetzen ↔ Formationsalarm" and "Konto auswählen ↔ D1".
- After the fix: `formation-page.spec.ts`, `chart-workspace.spec.ts` and `analysis-trend.spec.ts` → 159 passed, 0 failed (mocked build, `E2E_PORT=3110`, because another process used port 3100).
- Browser pane on `localhost:3000`, DEMO account: at 20 px, 1728 px window and side bar open, no control overlaps and the tools float at the bottom. At 20 px and a chart width of 1678 px (side bar closed), the tools are in the top bar, and their container ends at the bottom edge of the top bar. At 16 px and a chart width of 1760 px, no control overlaps.
- Screenshots of the mocked build at 20 px and 1728 px, side bar open and closed: no overlap.
- `eslint` on the changed files and `tsc --noEmit`: no messages.
- Codex scan: not done, the weekly Codex quota was at 3 %.

## Lessons
- Measure a layout with the root font size 20 px too, and use rem for every threshold that must hold rem content.
- In the browser pane of the desktop app, `transition-all` can stop a height change after a font size change (the page runs in the background). Disable transitions before you measure (`*{transition:none!important}`).
