---
date: 2026-11-02
author: Claude
type: fix
status: done
pr: [313]
features: [FRM-37]
areas: [frontend]
---

# Chart covers the side bar with larger browser font

## Request
On `/formasyon` the owner saw only the right half of the open side bar: the tab "Bedingungen" and the left part of the conditions and favorites cards were under the chart.

## Cause
- Symptom: from `lg` (1024 px) the chart covered approximately 80 px of the side bar on the left. Only the tab "Favoriten" and the end of the counters ("…/7 Takviyeler 3/5") were visible.
- Found in the browser pane: with the default font size (16 px) the layout was correct at 930, 1000, 1060, 1400, 1728 and 2048 px. With the root font size 20 px (browser setting "font size: large") the overlap was 82 px at 1728 px.
- Root cause: `page.tsx` pushes `formation-main` with a fixed `lg:right-[328px]`, but the strip (`w-10`) and the panel (`w-72`) are in rem. At 20 px they are 50 + 360 = 410 px wide, the offset stays 328 px. From `lg`, `formation-main` has `z-70` above the side bar (`z-60`), so the chart covers the difference.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/app/formasyon/page.tsx` | `lg:right-[328px]` → `lg:right-82` (20.5rem = `w-10` + `w-72`), so the offset grows with the font size like the strip and the panel. |
| `frontend_nextjs/e2e/mocked/formation-page.spec.ts` | New FRM-37 test: root font size 20 px at 1440 px, the panel is 360 px wide, `formation-main` and the chart end before the panel. |

## Why
- The offset must use the same unit as the widths that it adds up. A rem offset keeps all three values in one unit.
- Rejected: px widths for strip and panel (`w-[40px]`, `w-[288px]`). Then the panel stays narrow while its text grows with the font size.

## Verification
- New e2e test, before the fix: red, `formation-main` ended at 1112 px and the panel started at 1030 px.
- After the fix: all 13 tests with the tag `@FRM-37` green (`--workers=1`; the machine had a load average of 25, so with parallel workers the formation scan did not finish in 7 s in tests that this change does not touch).
- Browser pane on `localhost:3000`, 1728 px: with 16 px `formation-main` ends at 1400 px = start of the 288 px panel; with 20 px it ends at 1318 px = start of the 360 px panel.
- `eslint` on the two changed files and `tsc --noEmit`: no messages.

## Open points
- [x] Fixed in [2026-11-02-formation-topbar-rem.md](2026-11-02-formation-topbar-rem.md): thresholds A and B and the reserve are in rem (71rem, 79rem, 18rem), and the tools are compact. The top bar has the same px/rem defect. Threshold A (`@min-[1300px]/formation-main` in `FormationToolbar.tsx`, `ChartWorkspace.tsx`, `TrendToggle.tsx`), the reserve `pr-[528px]` and threshold B (1440 px, `FormationStatusChip.tsx`) are in px, the chart tools and the top bar content are in rem. Measured on `localhost:3000` (tr, DEMO account) with the root font size 20 px, after the layout settled: the chart tools are 608 px wide (486 px at 16 px), the reserve stays 528 px. Overlaps when the tools are in the top bar:
  - 1728 px, bar open (`formation-main` 1318 px): timeframe "D", alarm button, status button.
  - 1920 px, bar open (1510 px): status button.
  - 1440 px, bar closed (1390 px): alarm button, status button.
  - 1550 px, bar closed (1500 px): status button.
  - No overlap at 2200 px (bar open), with the tools at the bottom (`formation-main` below 1300 px), or anywhere at 16 px.
  Possible fix: thresholds and reserve in rem (1300 px → 81.25rem, 528 px → 33rem, 1440 px → 90rem). Check first that container queries use the root font size for rem.

## Lessons
- Do not mix a px offset with rem widths that it must match. Use the same unit, or calculate the offset from the same spacing values.
- Measure a layout change with a larger browser font too (root font size 20 px), not only at 16 px.
