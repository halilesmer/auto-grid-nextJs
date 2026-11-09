# Shared candle requests on /chart (A21.19)

Feature: UI-22. Follow-up of `2026-11-08-chart-u4-5b-fixes.md` (A21.15).

## Problem
Chart, formation scan and trend line each ran their own 60-second tail refresh in `useMarketRates`, also for the same H4 range. One 15-minute clock jump in a test gave about 49 `rates` requests.

## Solution
`src/lib/sharedRates.ts`:
- `sharedFetchRates`: equal in-flight requests (account, symbol, timeframe, from, to) share one HTTP call. An abort ends only that subscriber; the call is aborted when the last subscriber leaves.
- `subscribeTick`: one 60-second timer for each (account, symbol, timeframe, end). All hooks of that key refresh in the same tick, so their tail requests (same `from`) become one call. The timer stops with the last subscriber (unmount).
`useMarketRates` uses both. Paging, `older`, `clipped`, errors and clearing on account change are unchanged.

The timer runs from the first subscriber. A hook that joins later gets its first refresh 0 to 60 s after its first load (before: 60 s). The interval of the first subscriber holds for the key; all callers use `REFRESH_MS`.

## Test
`chart-one-chart.spec.ts` (@UI-22), "Gleiche Kerzen-Anfragen werden geteilt …": after open and `page.clock.runFor(60_000)`, exactly one H4 request and no duplicate query. Red before the change (2 H4 requests), green after.

## Measurement: FRM-27 (method of A21.15)
Same test, `rates` requests by timeframe (D1 / H4 / H1 / M15), time in test body.

| Point | Before (A21.15, free machine) | After (loaded machine) |
|---|---|---|
| after open | 5 (1/2/1/1), 0.7 s | 5 (1/2/1/1), 1.4 s |
| after first jump | 58 (3/34/3/18), 13.0 s | 43 (3/19/3/18), 17.3 s |
| after second jump | 107, 19.0 s | 77 (4/35/4/34), 25.9 s |
| end | 116, 19.7 s | 82 (5/37/5/35), 27.5 s |

One jump now gives about 30 requests (was 49): H4 about 16 (was 31). M15 stays at about 16: only the scan reads it.

## Decision on the FRM-27 limit
The body took 27.5 s on a machine with other sessions running, not a free machine. A value of 10 s or less on a free machine is not shown, so the limit stays at 60 s. The comment in the test says why.

## Open points
- [ ] Remeasure on a free machine; lower the limit only if the body is 10 s or less.
