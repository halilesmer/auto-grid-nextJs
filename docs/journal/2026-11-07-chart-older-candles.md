---
date: 2026-11-07
author: Claude
type: feature
status: open
pr: []
features: [ANA-27, ANA-05]
areas: [frontend, tests]
---

# Older candles load when the chart scrolls left (step S2 of plan 1107-A4)

## Request
Step S2 of the plan `2026-11-07-chart-history-plan.md`: in the free chart mode (`/chart?mode=free`), old candles load page by page inside the selected range when the user scrolls to the left edge. With "All" selected, loading goes back to the start of the MT5 history. The plan set a total limit of 400 000 candles.

## Solution
| File | Change |
|---|---|
| `lib/analysis/candles.ts` | `mergeHead` (older candles in front of the loaded ones), `olderPage` (next page or the reason for the end), `MAX_TOTAL_BARS`, `OLDER_PAGE_BARS`. |
| `hooks/useMarketRates.ts` | `loadOlder()`, `loadingOlder`, `data.older` (`more`, `none`, `range`, `history`, `limit`). One request at a time. The 60 s refresh of the last candle runs as before. |
| `analysis/chart/ChartCore.tsx` | `onNeedOlder` fires when 50 candles are left on the left and the user used the chart in the last 1.5 s (wheel, drag, touch, key). After the page is in, the view returns to the same candle times. |
| `analysis/chart/OlderEdgeMark.tsx` | Left edge display: strip while loading, dashed line and pill at the end. |
| `analysis/DataQualityBanner.tsx`, `chart-workspace/FreeChartPanel.tsx` | New texts (scroll hint, limit warning). Setup mode keeps the old texts. |
| `e2e/fixtures/mock-worker.ts` | `ratesSince`: no candles before this time, the range is `unavailable` (as `market_sync` does). |
| `docs/features/features.yaml` | New `ANA-27`. `ANA-05` states that the free mode loads older candles. |

W1 and MN use the same pages as D1 (the hook asks for D1). The calendar candles are built again from all D1 candles, so the period at the old page border becomes whole.

## Why
- The end of the history is a page without candles in which nothing but `unavailable` stands. An `unavailable` range at the start of a page with candles can also be a long hole inside the history (`market_sync.empty` uses it for both). So only the empty page decides. The chart then removes the `unavailable` ranges in front of the first candle from the missing list.
- A page that fails or comes back empty with a reason (account busy, MT5 error) changes nothing. The loading pauses for 15 s, then the next scroll tries again. The first version asked again at once and looped; the review found it. The page shows no error for this case.
- The setup mode does not scroll, so its banner text stays "Range shortened" (new keys `analysis.data.scroll.*` and `analysis.data.limit.*` for the free mode; the plan named the old keys).

## Measurement (limit decision, 1107-A4.4)
Method: `e2e/mocked/chart-older-performance.spec.ts`, mocked worker, headless Chromium on the MacBook, one test worker. The time runs from the end of the `/rates` response to two animation frames after the candle count changes in the chart. `ANA_PROFILE_BARS=360000 scripts/features/run.sh e2e ANA-27` repeats it.

| Page size | Candles in the chart after the page → time to draw |
|---|---|
| 50 000 | 150 000 → 1.06 to 1.23 s, 200 000 → 1.14 s, 300 000 → 1.16 s, 361 000 (61 000 page) → 1.76 s |
| 20 000 | 140 000 → 0.58 s, 180 000 → 0.71 s, 220 000 → 0.88 s, 260 000 → 1.06 s, 300 000 → 1.23 s, 340 000 → 1.35 s, 361 000 → 1.72 s |

- The time grows with the number of candles in the chart and with the page size. A CPU profile shows the time in the lightweight-charts series update (`setData` of the candle series and of every indicator series) and in garbage collection. No function in our own code is a hot spot.
- A page at 400 000 candles takes more than 1 s (about 1.7 s at 361 000). By the rule of 1107-A4.4 the limit goes down: `MAX_TOTAL_BARS = 220 000` and `OLDER_PAGE_BARS = 20 000`. No page loads when the chart holds 220 000 candles or more. The last page can go over the limit by one page, so the chart holds 240 000 candles at most. A later run (drag instead of wheel, response paired with the first commit after it) gave 0.67 s at 180 000 and 0.71 s at 220 000. A page at 240 000 candles needs about 0.9 s (a straight line between 220 000: 0.81 to 0.88 s and 260 000: 1.06 s; a run with the final values did not measure the last step exactly).
- One year of M1 has about 360 000 candles (real data has no weekends). The limit gives about 7 months of M1. A full year of M1 is not possible with this limit. The owner can raise the limit and accept a stop of about 1.7 s for each page at the end, or the indicator series can be thinned (not done).
- A smaller page keeps each stop short but needs more pages (7 pages from 100 000 to 240 000).
- The page is always full size. A small rest window could fall on a weekend and come back empty, and the chart would then show a false start of history.

- Loading starts only after a user input. The first version loaded at once when the chart opened with the whole data in view (a short series, a saved zoom on the left edge). That sent extra requests in the trend tests (`ANA-21`, three tests failed in `precheck.sh`) and loads data nobody asked for. A mouse drag is a user input, a restore of the view is not.

## Verification
- `analysis-chart-lib.spec.ts` (`@ANA-27`): `mergeHead`, `olderPage`.
- `chart-workspace.spec.ts` (`@ANA-27`): page with a saved zoom on the left edge: one older page loads, the visible time range stays within one candle, loading stops at the range start; second test for the start of the MT5 history (no missing range, state `history`).
- The first version moved the view by the number of new candles. The indicator series share the time axis. They are set before the candle series, so the chart had already moved the view and the extra shift doubled it. The code now stores the visible times and corrects the view in the next frame only when the times differ.
- The page tests drag the chart with the mouse. A horizontal mouse wheel does not scroll this chart. The hold of the older-page response (a route that waits) makes the view before and after the insert readable.
- A page test runs without indicator series and layers. It passes, but it is not known whether the chart keeps the view by itself in that case, so the correction code may still have no direct test.
- Not covered: the limit message in a page test. `olderPage` is tested in the logic test.
- Not covered: the trend path (own request, no older pages) and the dashed line with the price axis on the left.

## Open
- Live check on the DEMO account (step S3): USOUSD, M1. "Last 12 months" ends at the limit message (about 7 months). Use "Last 3 months" to reach the range start and "All" on D1 or W1 to reach the start of the history.

## Fix: older pages on D1 "All" (live check S3, 2026-11-07)
- Symptom: D1 with "All" (about 3 500 candles, from 2013). Dragging to the left edge sent no usable request. Nothing loaded and no display appeared.
- Cause: `olderPage` asked for a page of 20 000 candles before the loaded start. On D1 that is 20 000 days (55 years). The start of the first page, 2013 minus 55 years, is before 1970 and negative. The worker accepts only `from >= 0` (`api/market.py`, `ge=0`) and answers 422. The hook treats every failure as a pause of 15 s and shows nothing, so the error stayed invisible. W1 and MN use D1 pages and had the same fault. M1 to H4 never reach 1970 with one page.
- Fix: `olderPage` limits `from` to 0 and returns the end `history` when the loaded start is 0 or less. The `unavailable` ranges before the first candle then leave the missing list. The mock worker now answers 422 for `from < 0` as the real worker does. Tests: `olderPage` logic test and a page test with D1 "All" and a history that starts in 1970 (red before the fix).
- Not done: a failed page still shows no message. A visible error needs a design decision.

## How far can a user drag on M1? (measurement, no code change)
Method: temporary `minBarSpacing` option, 100 000 M1 candles, chart 1 228 px wide, maximum zoom out, 8 drags of half the chart width, headless Chromium on the MacBook.

| `minBarSpacing` (px) | Candles in view | Candles per drag | Drags for 100 000 candles | Frame time median / p95 |
|---|---|---|---|---|
| 0.5 (default) | 2 327 | 820 | 122 | 16.7 / 24 ms |
| 0.2 | 5 829 | 2 050 | 49 | 16.7 / 27 ms |
| 0.1 | 11 659 | 4 100 | 25 | 16.7 / 49 ms |
| 0.05 | 23 319 | 8 200 | 13 | 17.0 / 95 ms |

- With the default, the left edge of 100 000 M1 candles is about 120 drags away. That is not practical for a person. The live check confirmed it.
- A lower `minBarSpacing` helps only in part. At 0.1 px a candle is much narrower than a pixel and unreadable, and the p95 frame time grows to 49 ms (95 ms at 0.05).
- Options (none is built): (1) a "go to start" control that jumps to the first loaded candle and loads the next page. It is a visible UI element and needs design approval. (2) The key `Home` for the same action. (3) `minBarSpacing` 0.2 as a cheap step: it halves the drags and keeps the frame time. (4) For long history, use H1 or a larger timeframe and zoom into M1 only for a small range.
