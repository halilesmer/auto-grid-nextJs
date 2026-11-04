---
date: 2026-11-04
author: Claude
type: feature
status: done
pr: [355]
features: [FRM-38]
areas: [frontend]
---

# Formation search at a past moment: UI (P2 of A13.6)

## Request
Step P2 of the plan `2026-11-04-formation-search-past-moment.md`. P1 (`2026-11-04-formation-past-search-logic.md`) gave the logic. P2 adds the visible UI of the approved design (Artifact "Formation Stand-Suche"). The owner approved the design and all proposals on 2026-11-04.

## Solution
- `FormationAsOf.tsx`: the control "Stand" in the top bar. Live: green dot and "Live". Past: warning colour, clock icon and the text "Stand 15.10.25 04:00" (status not by colour alone). A click opens a popover (desktop) or a bottom sheet (under 640 px). The panel is a portal in `body`, so the side strip and the tool card of the chart do not cover it. It has Live / Past, a date (native date input, broker day, not after today), a time in steps of 15 minutes, quick buttons "1 day / 1 week / 1 month ago" and "Search". In a short window (height up to 30 rem, phone in landscape) the panel sits under the app header.
- `FormationAsOfSteps`: back and forward by one candle of the chosen time frame (`stepAsOf`). A step that reaches the running M15 candle removes `at` (live). On the phone (portrait and landscape) the steps float at the bottom right of the chart, so the top bar does not grow. A close button removes `at`.
- `useFormationParams`: `atParam` and `setAt`. A change of account removes `at`. A change of formation, time frame or symbol keeps it.
- `FormationView`: `pastAt = resolveAsOf(atParam, brokerNow)` goes to `useFormationScan`. An invalid or too young `at` falls back to live and leaves the URL once the broker clock is loaded. The chart notice "Past · as of … · no live data" and a second notice for data gaps. Favorites: a click in the past view removes `at` and opens the product live. The screenshot stamp is "Past · <time>".
- `FormationChart`: a dashed line "Stand" half a candle after the last closed candle (`asOf`). Candles after the moment never show, because `context.view(tf, at)` keeps closed candles only (P1).
- `FormationAlarmMenu`: `pastView` disables the bell. The hint says "The alarm works only live".
- `FavoritesSidebar`: the tag "live" in the past view.
- `useFormationScan`: `hasGaps` (a time frame has missing candles). A moment before the first M15 candle of the history no longer keeps `loading` true: the page shows the gap notice (A13.6.5, reviewer note of P1).
- i18n tr/en/de in `formation.ts`, hints in `hints.ts` (every button, field and the control).

## Decisions
- The date uses the native `<input type="date">`, not the calendar of `DateRangePicker`. That picker selects a range inside a dropdown; a single day with a time needs less. The native control opens a calendar on every platform.
- The notice for data gaps looks at any time frame with a missing range in the loaded window. It is not limited to the neighbourhood of the moment.
- Header width (UI-15): the live control is a dot only below 106 rem container width; between 91 and 106 rem the past control shows only the clock icon and the steps and close button float in the chart (measured 2026-11-04, 1500 to 1750 px window: three rows, 95 px, without this). On the phone (portrait and landscape) the control is an icon, and the steps and close button float.
- Without a reliable broker clock, `at` is compared with UTC now, so a moment near "now" falls back to live and does not show as the future (reviewer finding).
- Leaving the Formation mode removes `at` (`useChartMode`).
- The earliest moment has no fixed limit (A13.6.5). The panel text says that missing candles show a notice.

## Verification
On 2026-11-04: `tsc`, `eslint`, the new `e2e/mocked/formation-past.spec.ts` (FRM-38, 10 tests) and the affected specs pass. Screenshots at 1440 px, 375 px (result and bottom sheet) and 812 x 375 px were checked.
