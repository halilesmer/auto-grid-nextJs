---
date: 2026-11-02
author: Claude
type: feature
status: done
pr: [S6A_PR]
features: [ANA-21, FRM-23]
areas: [frontend]
---

# Trend button on /formasyon, chart tools visible

## Request
Step S6a of `2026-11-01-unified-chart-page.md`: the chart on `/formasyon` gets the `Trend` button with the gear (`TrendToggle`) and draws the trend line, as on `/chart`. The owner decided on 2026-11-02 to do this before S3 to S5. The line always shows the new trend path. The formation points still follow `formationZug` (decision of 2026-10-31).

## Cause
Defect found during this step: on `/formasyon`, from 1024 px, the chart tools ("Indikatoren", undo, settings and others) were not visible. They were there and they received clicks, but the top bar painted over them.
- Since PR 250 (FRM-27), the wrapper of the top bar in `app/formasyon/page.tsx` has `z-50` and an opaque background (`bg-background`). Before, it had `z-30`. The tool bar of the chart (`workspace-toolbar`) has `lg:z-40` in the same stacking context, so it went below the top bar.
- The top bar has `pointer-events: none`, so clicks went through to the hidden buttons.
- The FRM-23 test did not find the defect. It compared boxes and used `toBeVisible()`. Playwright's `toBeVisible()` does not check whether an element is covered. `document.elementFromPoint()` skips elements with `pointer-events: none`, so it also returns the hidden button.
- Width: with `Trend` and the gear, the tool bar is 512 px (de), 486 px (tr) and 445 px (en). The content of the top bar ends at 704 px from the left edge of `formation-main`. At 1024 px, and at 1280 px with the favorites panel open, the two bars overlap.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/formation/FormationChart.tsx` | Trend line from the candles that the formation context already loaded: `view.bars` from `context.view(hit.tf, scanAt)`, only when `showTrend` is on. No new request. `trendPath` and `toolbarActions={<TrendToggle />}` go to `ChartCore`. |
| `frontend_nextjs/src/app/formasyon/page.tsx` | `formation-main` is the container `@container/formation-main`. |
| `frontend_nextjs/src/components/formation/FormationToolbar.tsx` | The space on the right of the top bar is `pr-[528px]` from a container width of 1240 px. Before, it was `lg:pr-80`. The comment shows the calculation. |
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | With `overlayLayout`: from a container width of 1240 px, the tool bar is in the top bar with `z-[60]`, above the top bar (`z-50`). Below this width, it floats at the bottom with `z-[45]`, above the formation card (`z-40`). Before, this rule used the viewport (`lg`). |
| `frontend_nextjs/src/components/chart-workspace/TrendToggle.tsx` | Below the same threshold, the trend settings open upwards, with a height of max. viewport − 24rem. When the tool bar floats at the bottom, a panel that opens downwards goes out of the screen, and a high panel goes below the top bar. |
| `frontend_nextjs/src/app/formasyon/page.tsx` (favorites) | When the favorites panel is open between 1024 and 1279 px, the page sets `--chart-tools-right: 296px`. The floating tool bar then ends to the left of the panel. |

New rule: the place of the chart tools on `/formasyon` depends on the width of the chart area (container `formation-main`), not on the viewport. Minimum width: 704 px content + 8 px gap + 512 px tool bar + 4 px margin = 1228 px. The threshold is 1240 px (1280 px − 40 px strip on the right). At this width, the favorites panel starts to push the chart. Thus no width remains where the tool bar is in the top bar and the favorites panel covers its menus.

Candles: `context.view(tf, t)` gives only candles with `time + duration <= t` (`lib/formation/context.ts`, `closedCount`). Thus the line uses only closed candles up to `scanAt`. The running candle (`running`) is a separate value and is not in the calculation. The line uses the history that the formation search loaded. On `/chart`, `useTrendPath` loads its own candles (`HISTORY_DAYS`). Thus the start of the line can be different between the two pages.

## Why
- No `useTrendPath` on `/formasyon`: the candles are already loaded. A second request would load candles after `scanAt`.
- A container query instead of a larger `lg` breakpoint: the favorites panel makes the chart area narrower without a change of the viewport.
- Rejected: a smaller tool bar (icons only). That is a new design and is not part of S6a.

## Verification
- e2e, mocked worker, `e2e/mocked/formation-page.spec.ts`:
  - `ANA-21 Trendzug auf /formasyon`: the button switches the line on and off (`data-trend` > 0, then 0), and no new `/rates` request.
  - `FRM-23 Werkzeugleiste des Charts liegt obenauf`: at 1440, 1280, 1280 with favorites, 1024, 375 and 375×667 px, "Indikatoren", "Trend" and the trend settings are on top. `elementFromPoint` runs with `pointer-events: auto` on all elements, so the hit test follows the paint order. No control of the top bar is in the same row to the right of the tool bar's left edge. The alarm menu on the right of the top bar opens on top.
  - At 375×667 px, the first row of the trend settings is on top only with the height limit (viewport − 24rem). Without the limit, the test is red.
  - Counter-check: with the old layout, 5 of these 6 tests are red. 375 px stays green, because the tool bar floats at the bottom there.
  - FRM-29 test (favorites panel at 1024 px): it checked that the tool bar is above the panel, in the top bar. Since S6a, the tool bar floats at the bottom at this width. The test now checks that all tool buttons end to the left of the panel and that `Trend` is on top. Without `--chart-tools-right`, this test is red.
- Visual check: screenshots of the mocked build at 375, 1024 and 1440 px, with the trend settings open.

## Lessons
- `toBeVisible()` and `elementFromPoint()` do not find an element that is painted over by a layer with `pointer-events: none`. To check that an element is on top, set `pointer-events: auto` on all elements for the check.
- When you change the `z-index` of a page layer, check the floating chart tools.
