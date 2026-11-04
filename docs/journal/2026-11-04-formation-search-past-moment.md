---
date: 2026-11-04
author: Claude
type: plan
status: open
pr: []
features: [FRM-38, FRM-20, FRM-29, FRM-30, ANA-21]
areas: [frontend, docs]
---

# Formation search at a moment in the past

## Request
Open item A13.6 of `2026-11-01-unified-chart-page.md`: `/chart?mode=formation` must search formations "as of" a date and time in the past, not only now. This entry is the plan phase. No code changes. Point 1 of `2026-11-04-chart-trend-open-points.md` (A13.3.1) waits for this plan.

Design (not yet approved): https://claude.ai/artifact/PJ1WnUdJUyioAm2pgdU1AC. It shows desktop (1440 px), phone portrait (375 x 812) and phone landscape (812 x 375).

## Current state
- `useFormationScan` requests D1, H4, H1 and M15 up to `to` = end of the current broker day (`formationRequests`). The scan time `at` is the start of the running M15 candle (`scanTime`). `useMarketRates` loads the tail again every 60 s.
- `FormationContext.view(tf, t)` already returns only the candles that are closed at `t`. The indicators are causal. The context was built for this use (BKT-09, `docs/analyse-regeln.md`).
- The trend line on the formation chart uses the bars of `view(hit.tf, scanAt)`. It does not use `closedBars` and does not need the broker clock.
- `FormationScanRunner` (favorites, alarm) runs in the layout and always searches "now". It does not read the page URL.

## Design summary
- A new control "Stand" in the top bar, before the camera and the bell. Live state: a green dot and "Live". A click opens a popover (desktop) or a bottom sheet (phone): Live / Past, date (broker day, calendar of `DateRangePicker`), time in steps of 15 min, quick buttons "1 day ago", "1 week ago", "1 month ago", button "Search".
- Past state: the control uses the `warning` token, a clock icon and the text "Stand 15.10.26 14:30" (status not by colour alone). Next to it: back and forward by one candle, and a close button that goes back to live.
- On the chart: a notice "Past · Stand … · no live data", and a dashed vertical line "Stand" after the last candle. No running candle.
- The bell is disabled, with the hint "Alarm is live only". The favorites panel keeps live results and carries a "live" tag.
- Phone portrait: short control ("15.10. 14:30") in the first row; back/forward float at the bottom right of the chart, so the top bar does not grow. Landscape: one row.

## Technical plan

| Topic | Plan |
|---|---|
| URL parameter | `at=YYYY-MM-DDTHH:MM`, broker time (MT5 seconds "as UTC", `serverTime.ts`). Parse to MT5 seconds and round down to 15 min. No `at`, an invalid value, or a value at or after the start of the running M15 candle: live. `useFormationParams` reads and writes it; a change of formation, timeframe or symbol keeps it; a change of account removes it. |
| Candles | `formationRequests(accountId, symbol, to)` with `to = at` instead of the end of the broker day. `ratesWindow` rounds `to` up to the timeframe. So H1, H4 and D1 also get the candle that contains `at`; `view` drops it because it is not closed. The lead-in stays `HISTORY_DAYS` (D1: `W1_HISTORY_DAYS`). `splitDaily` gets the end of the broker day of `at`. |
| Closed candles only | The scan uses `scanFormations(context, at)` with the `at` from the URL, not `scanTime` of the last M15 candle. `view(tf, at)` keeps only candles with `time + duration <= at`. `running` is null for all timeframes. |
| Reload | None. `useMarketRates` loads the tail only when `win.to > now - tfSec`. A past `to` does not meet this condition. The cache key contains `at`. |
| History limit | MT5 and the market database give candles only as far back as the history of the account. Missing candles show the existing gap notice (coverage `unavailable`, ANA-04). There is no fixed limit (question A13.6.5). |
| Favorites and alarm | Live only. `FormationScanRunner` does not change. Reason: the alarm compares the newest closed candle with the stored state (FRM-30). A past moment has no new candle, and a past search must not change the stored alarm memory. The page disables the bell in the past state. The favorites panel shows a "live" tag. |
| Trend line | Unchanged. It uses the closed bars of `view(hit.tf, at)`. So the trend line of the formation chart needs no clock decision. |
| A13.3.1 (trend on Free and Setup) | Proposal: `closedBars` with `now = null` keeps every candle that ends before `UTC now - 12 h`. No broker offset is lower than UTC-12, so these candles are closed for each broker. Only a last candle after this limit is dropped. A past range then keeps all its candles; a live range behaves as before. Owner decision needed. |
| Screenshot | The stamp is `at`, with the word "Past". |

## Tests

| ID | Test |
|---|---|
| FRM-38 (new) | e2e, `formation-past.spec.ts`: (1) `?at=` sends rates requests with `to` = `at` (M15) or `at` rounded up (H1, H4, D1). (2) The scan has the same hits as the logic test at the same `at`. (3) No request after 60 s. (4) Notice, control and dashed line show; bell disabled; favorites carry "live". (5) Back/forward change `at` by one candle of the timeframe. (6) The close button removes `at`. (7) An `at` in the future falls back to live. (8) 375 px and 812 x 375 px: no horizontal scroll, the control is in the viewport. |
| FRM-38 (new) | Logic test, `formation-past-lib.spec.ts`: a context with candles after `at` gives the same hits as a context cut at `at` (no look-ahead). |
| FRM-20, FRM-29, FRM-30 | Existing tests stay green. The alarm memory does not change while the page is in the past state. |
| ANA-21 | Only if A13.3.1 is approved: a failing test first in `analysis-trend-lib.spec.ts` for `closedBars` with `now = null`. |
| UI-07 | The new control, its buttons and fields have `hint` keys (tr/en/de). |

## PR steps
Each step is one PR, in this order.

| Step | Content |
|---|---|
| P1 | Logic: parse and round `at` (`lib/formation/asOf.ts`), `formationRequests` and `splitDaily` with the past end, `useFormationScan` with an optional `at`. Catalog entry FRM-38 and the logic test. No visible change. |
| P2 | UI: the control "Stand" with popover and bottom sheet, the chart notice and the line, back/forward, the disabled bell, the "live" tag, the screenshot stamp, i18n and hints. e2e FRM-38. |
| P3 | Only after the decision on A13.3.1: `closedBars` on Free and Setup. Separate PR, because it changes ANA-21. |

## Open points
- [ ] Owner approves the design (Artifact above). Code starts only after this.
- [ ] A13.6.1 Hide the candles after the moment (proposal), or show them pale to see the outcome?
- [ ] A13.6.2 Back/forward by one candle of the selected timeframe (proposal), or always by 15 min?
- [ ] A13.6.3 Click on a favorite in the past state: open it live (proposal), or keep the moment?
- [ ] A13.6.4 Bell in the past state: disabled (proposal), or usable because it is live anyway?
- [ ] A13.6.5 Earliest moment: as far as candles exist, with the gap notice (proposal), or a fixed limit?
- [ ] A13.3.1 Free and Setup without a reliable broker clock: count candles that end before `UTC now - 12 h` as closed (proposal)?
