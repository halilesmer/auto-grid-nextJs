---
date: 2026-11-07
author: Claude
type: feature
status: done
pr: [441]
features: [ANA-26, ANA-27, ANA-05]
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

## Decision
The owner keeps the limit of 220 000 candles (1107-A8.1, 2026-11-07). There is no sliding window. "Last 12 months" on M1 ends at the limit message after about 7 months.

## Live check on the DEMO account (step S3, 2026-11-07, read-only, USOUSD)
The check used a temporary Playwright script (not committed) with real mouse drags. The built-in browser pane did not scroll the chart by drag.
- M1, "All" (a): the first load had 3 439 candles. After 4 drags 30 253, after 36 drags 57 529. The banner date moved from 04.11.26 to 07.10.26 to 09.09.26. At least two pages arrived. The loading pill and the view jump were not measured in this run (sampling every 4 drags).
- M1, custom range 2025-11-01 to 2025-11-30 (c): 26 648 candles loaded at once. No data-quality banner (no missing-range warning).
- M1, "Last 90 days" and "Last 12 months" (checks 1 and 2): not completed. The first run was stopped by machine load. A second run with low load (about 2) finished, but it is not a result: 40 mouse drags moved the view back only about 42 days, the bar count stayed at 68 369 in both ranges, no request failed (no 4xx), and no pill showed because the range start was not reached. The range-start pill and the limit pill are covered by the mocked `@ANA-27` tests only. A live check needs a longer drag, or a jump to the range start.
- D1, "All" (b), after PR 439: the older page request (`from=0`) returned 200. No 422. The pill showed "Start of MT5 history" at 22.01.13 00:00 (D1 coverage starts at 2013-01-24). With the response held, the visible range before the page was 2013-03-01 to 2020-07-01 and after the page 2013-01-22 to 2020-07-01: the right edge did not move. The request for the older page was sent twice (two 200 answers with the same parameters).
- W1 and MN (d): the chart has no hover legend with open, high, low and close. The values below were NOT read from the chart. They were calculated from the worker D1 candles with the same rule as `calendarBars.ts` (week starts Sunday 00:00, month on the 1st, broker time). The last W1 candle matches the screenshot (open about 103, low about 87, close 90.84). The owner compared them with the MT5 terminal; see the result below.

| Period | Start | Open | High | Low | Close |
|---|---|---|---|---|---|
| W1 | 2026-10-18 | 99.887 | 104.931 | 96.402 | 104.471 |
| W1 | 2026-10-25 | 103.059 | 105.750 | 100.332 | 103.680 |
| W1 | 2026-11-01 | 103.209 | 103.249 | 87.187 | 90.840 |
| MN | 2026-09-01 | 86.655 | 106.878 | 86.655 | 93.618 |
| MN | 2026-10-01 | 93.523 | 105.750 | 89.171 | 103.680 |
| MN | 2026-11-01 | 103.209 | 103.249 | 87.187 | 90.840 |

## Lesson: stale `unavailable` mark
A D1 range of 2026-10-30 to 2026-11-06 was marked `unavailable` ("not in MT5") although H1 candles existed for the same days. W1 and MN are built from D1, so they would have been wrong. The mark was old (the 24-hour retry did not run) and was refreshed later. Check the D1 coverage before you trust W1 and MN.

## MT5 comparison of W1 and MN (2026-11-07, owner, USOUSD)
- The MT5 weekly axis shows 12 Oct 2025 and 11 Oct 2026. Both are Sundays. The week starts on Sunday, as the rule in `calendarBars.ts` says.
- The MT5 data window matches the calculated values to the third decimal for three candles: W1 2026-11-01, MN 2026-10-01 and MN 2026-11-01 (open, high, low, close).
- The W1 candle of 2026-10-25 was not compared. `ANA-26` is signed on the three candles above.

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

## Fix: clock-dependent test (ANA-27, 2026-11-07)
- The test „Tümü“ in `chart-workspace.spec.ts` expected 4000–5999 candles on the first load. The value depends on the time of day: the window "all" ends at the end of the broker day and reaches `OPEN_RANGE_BARS` minutes back, and M1 candles exist only up to now. So the first load has `OPEN_RANGE_BARS` minus the minutes to the end of the day (3561 to 5000). The test failed from about 21:00 to 04:20 UTC, also on `main`. The test was wrong, the code is right (the window ends at the broker day end since #94). The test now calculates the expected count from the mock clock (±1 for a minute change). Found by the coordinator of the free-layout plan, checked in the code by the session "Grafik geçmiş verileri".

## Intermittent failures of the ANA-27 e2e tests (2026-11-08)
- Symptom: `chart-older-performance.spec.ts` failed on some runs. `data-bars` stayed at 100 000 (or 120 000, 140 000) until the 120 s limit. Other ANA-27 page tests also failed when three workers ran together. The worker load was 3 to 15.
- Diagnosis: no product defect. A log of each drag (candles from the first candle, time, requests) on an unloaded Mac showed that the view moved 820 candles per drag. The test drags half the chart width. 100 000 candles are about 120 drags away, and each drag took 0.7 to 1 s. The requests started at the left edge (two pages came at drag 119), so the trigger and the pause worked. Under load a drag takes longer and the 120 s ended before the left edge. Both guesses (the 1.5 s input window rejects the trigger; a failed page waits for the 15 s pause) did not apply: the failing runs showed no failed request and the view was still far from the edge.
- Heavy tests also slowed each other. With fully parallel tests, two 100 000-candle charts rendered at the same time.
- Fix, tests only:
  - A wide drag (15 % to 96 % of the chart width, 1 800 candles) needs about 55 drags and 13 s for the same distance. A drag with two intermediate steps does not move the chart, so it keeps six steps. The helpers are in `e2e/fixtures/chart-older.ts`.
  - The cases with more than 100 000 candles (the range test and the measurement) are in `chart-older-heavy.spec.ts` with `test.describe.configure({ mode: 'default' })`. They run one after the other in one worker. A failure does not skip the second (`serial` would).
  - The other page tests use the window "all" (about 4 000 candles at the start) and no longer load 100 000 candles twice.
  - No timeout was raised and no expectation was relaxed.
- Result with the real clock, `heavy_lock.sh scripts/features/run.sh e2e ANA-27`: 9 of 9 passed in 3 runs (50 to 54 s, before: 2.2 min and failures). A run with eight busy loops (load 15) also passed 9 of 9 (1.1 min).
