---
date: 2026-11-04
author: Claude
type: feature
status: done
pr: []
features: [FRM-38]
areas: [frontend]
---

# Formation search at a past moment: logic (P1 of A13.6)

## Request
Step P1 of the approved plan "formation search at a moment in the past" (`2026-11-04-formation-search-past-moment.md`, in PR 349). P1 has the logic only. There is no UI, no i18n and no visible change.

## Owner decisions (2026-11-04)
The owner accepted all proposals of the plan.
- A13.6.1: candles after the moment are hidden.
- A13.6.2: back and forward move by one candle of the chosen time frame.
- A13.6.3: a click on a favorite opens it live.
- A13.6.4: the bell is disabled in the past view.
- A13.6.5: the earliest moment is as far back as candles exist. The existing gap notice shows missing candles.
- A13.3.1: on Free and Setup without a reliable broker clock, candles that end before "UTC now - 12 h" count as closed. This is step P3, not P1.

## Solution
- `src/lib/formation/asOf.ts`: `parseAt` reads `YYYY-MM-DDTHH:MM` (broker time) and rounds down to 15 minutes. `resolveAsOf` returns null (live) for an invalid value or a value at or after the start of the running M15 candle. `formatAt` is the reverse of `parseAt`. `stepAsOf` moves by one candle of a time frame on its grid. `pastRequestEnd` and `pastDayEnd` give the end of the candle requests and the end for `splitDaily`.
- `useFormationScan` has an optional argument `pastAt`. With it, the requests end at `pastAt`, the scan time is `pastAt`, and no running candle shows (`running` is null for all time frames). The scan time never goes beyond the running candle. `useMarketRates` is unchanged: it reloads the tail only when the window end is near now (D1 for today and yesterday, H4 and H1 for a moment one or two candles back).
- `FormationScanRunner` (favorites and alarm) is not changed. It stays live. A past search never writes the alarm state.

## Verification
On 2026-11-04: `tsc`, `eslint`, and the specs `formation-past-lib`, `formation-page`, `formation-w1-lib`, `formation-scankey-lib` pass (266 tests).
New logic test `e2e/mocked/formation-past-lib.spec.ts` (FRM-38): rounding, invalid values, live fallback, step, request end, and for each formation fixture and one multi-time-frame series with W1: a context with candles after `at` gives the same hits as a context cut at `at` (no look-ahead).

Reviewer notes for P2: a step with the arrows changes `to`, so all four request keys change and the candles load again. Check if a fixed window with a cut in the browser is better. A moment before the first M15 candle keeps `loading` true: P2 must show the gap notice (A13.6.5). P2 must not pass W1 to `stepAsOf`.

## For P2
Use `resolveAsOf(searchParam, nowSec)` to get `pastAt`, pass it as the fifth argument of `useFormationScan`, write the URL with `formatAt`, and step with `stepAsOf`. P2 must keep the bell and favorites live-only.
