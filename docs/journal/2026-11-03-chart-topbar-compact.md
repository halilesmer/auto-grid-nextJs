---
date: 2026-11-03
author: Claude
type: fix
status: open
pr: []
features: [UI-12, UI-10, UI-11, FRM-22, FRM-23]
areas: [frontend, docs]
---

# Compact top bar of the chart pages below lg

## Request
Step "top bar" of "One chart in the system" (`2026-11-01-unified-chart-page.md`), between U2a and U2b. At 375 px the top bar lay on the chart and covered the price pane (free mode 192 px, setup mode 276 px of 297 px). The owner chose way A on 2026-11-03: merge U2a, then build the compact top bar from the approved phone design ("Ein Chart · 03.11.", phone drawing boards).

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-page/ChartPage.tsx` | Below lg the top bar is in the flow above the chart. It starts 64 px from the top (below the floating navigation of the app). From lg it floats on the chart as before. The page measures the lower edge of the bar and sets `--chart-top` (before: `ChartOverlays`, and only for the `chart-topbar` element). The prop `surfaceBelowNav` goes: the surface now starts below the bar. |
| `frontend_nextjs/src/components/chart-page/ChartTopBar.tsx` | New slots (`account`, `mode`, `target`, `timeframes`, `range`, `view`, `tools`). In the container `formation-main` below 30 rem the slots form four rows: account and setup or symbol; mode, range and tools; time frames; view. From 30 rem the slots are `display: contents` and the layout is the old one. |
| `frontend_nextjs/src/components/chart-page/ChartView.tsx` | The top margin of the price scale is 0.1 below lg and 0.3 from lg (before: 0.4 below 640 px, 0.3 above). The RSI(7) pane takes the margins of the price scale when it is created, so its axis labels no longer stand at the pane border. |
| `frontend_nextjs/src/components/chart-page/FloatingCard.tsx`, `ChartWorkspace.tsx`, `ChartCore.tsx` | The collapsed setup card below lg has its own strip above the tools (`--floating-card`, `--workspace-card` now also on `formation-main`). The chart surface ends above it, so the card does not cover the lowest pane (EWO). The open card still floats over the chart. |
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | The drawing rail starts at the top of the surface (before: `top-18` below lg). |
| `frontend_nextjs/src/app/chart/page.tsx`, `FreeChartPanel.tsx`, `ZoneChartPanel.tsx` | Use the new slots. The view tabs are smaller on a phone. |
| `frontend_nextjs/e2e/mocked/chart-topbar.spec.ts`, `docs/features/features.yaml` | New feature UI-12 with 8 tests. The 3 narrow-width tests were red before the change. |

## Decision on the threshold
The first version used the container threshold of 71 rem (like the tool bar). This changed `/formasyon` at 1440 px with the side panel open (container 1060 px), and the existing test FRM-23 failed. The owner asked that desktop stays unchanged. The in-flow bar therefore applies below lg (viewport, 1024 px), where the page already starts below the navigation of the app. Between lg and 71 rem nothing changes.

## Measured (375 x 812, mock worker, H1)
Price pane = the first pane row of the chart. Covered = the part of it under the bar. Candle range = pane height without the price-scale margins (before: top 0.4 free/setup, formation 0.4; after: top 0.1, bottom 0.12).

| Page | Pane before | Covered before | Visible before | Pane after | Covered after |
|---|---|---|---|---|---|
| `/chart` free | 297 | 192 | 105 | 224 | 0 |
| `/chart` setup | 297 | 276 | 21 | 187 | 0 |
| `/formasyon` | 451 | 179 | 272 | 332 | 0 |

The estimate of the design was about 196 px (free) and 160 px (setup) without covered part. Measured is 224 and 187 px pane height. The bar is 149 px (free), 179 px (setup, with the legend row) and 107 px (formation). Candles fill the pane except 10 % at the top and 12 % at the bottom: about 175 px (free), 146 px (setup) and 259 px (formation).

At 1440 px the lower edge of the bar and the pane heights are the same as before (149, 179, 124 and 419, 419, 510 px).

## Changes of existing tests
The coordinator approved them on 2026-11-03, with an upper limit on the reserves. The checks are tighter, not looser.

| File | Change | Reason |
|---|---|---|
| `formation-page.spec.ts` (FRM-22, 375 px) | The chart starts at the lower edge of the bar (was `y = 0`); `y + height + reserve = 812`. | The bar stands above the chart. |
| `chart-page.spec.ts` (UI-10 setup) | `chart height + --workspace-card + --floating-card >= surface height - 2` (was `>= 0.6 * surface height`). New upper limits: `--workspace-card <= tool card height + its bottom gap + 8 + 4`, `--floating-card <= setup card height + 8`. | The surface is smaller and the reserves are fixed pixels. The upper limits stop the chart from shrinking when a reserve grows. |
| `chart-layers.spec.ts` (UI-11 narrow, setup) | The gap between chart and tool card is at most `24 + --floating-card` (was 24). New upper limit: `--floating-card <= setup card height + 8`. | The collapsed setup card has its own strip. |

Numbers behind the UI-10 change (setup, mock worker): at 375 x 667 the surface under the bar is 424 px, the chart 250 px (59 %), the reserves 132 px (tool card 91.5 + 32 gap + 8) and 42 px (setup card 38 + 4). At 375 x 812 the surface is 569 px and the chart 395 px (69 %). The old limit of 0.6 gave 254 px at 667; the chart has 250 px. The tool card with its 32 px gap already took 132 px before this step (U2a); the new strip for the setup card adds 42 px. The chart is therefore below 80 % on a small phone because of fixed reserves, not because of a wrong value.

## Lessons
- A Tailwind build failed with "Unexpected token Delim" in `globals.css` while a dev build directory (`.next-dev-u3`) lay inside the project: Tailwind scanned the cache files. Put dev output outside the project or delete it before a build.
- Tailwind finds only complete class names. Do not build class strings with template literals.

## Verification
See the PR. The axis labels of RSI(7) and wave were checked by eye in 3x screenshots (no automatic check of canvas text).

## Review findings
Fixed: the formation legend on `/formasyon` below lg (it moved up by the bar height; now `mt-(--chart-top)`), the empty 64 px strip in full screen, the 20 px font test (it set the font in an init script before the page existed; now after load), old comments, `closest()` instead of two `parentElement`.
Known, not fixed: on a phone (below 30 rem) the tab order does not follow the visual order (CSS `order` moves the mode, range and tools up; WCAG 2.4.3). A flat slot structure would fix it. Landscape phones (height about 375 px) and phones wider than 430 px are not tested.

## Open points
- [ ] U2b: the button "Layers".
- [ ] U3: merge the pages.
- [ ] The names of account and setup are shortened in the first row at 375 px. A smaller `(i)` or a longer row can fix this if the owner wants it.
