---
date: 2026-11-25
author: Claude
type: diagnosis
status: closed
features: [ANA-11]
areas: [frontend, tests]
---

# ANA-11 "vier eingeschlossene Wochenenden" failed from broker midnight on 2026-11-24

## Request
`main` was red from 21:17 UTC on 2026-11-24. The failing test was `e2e/mocked/analysis-chart.spec.ts` ("vier eingeschlossene Wochenenden"): it expected one chart rates call and saw two.

## Cause
The test runs on the real clock. It selected the chart request by `from` only. The formation search asks for H1 candles from a day that depends on the broker date. From broker date 2026-11-25 that day is 2026-09-07, the same `from` as the test period. So the H1 search request matched too. Proof: `E2E_FAKE_NOW` at 2026-11-24T15:00Z and 20:30Z passes; at 2026-11-24T21:30Z and 2026-11-25T08:00Z it fails. A debug print of `worker.ratesQueries` showed the H1 request with `from=1788739200`.

## Solution
The test selects the chart request by `from` and `timeframe=M15`. The expected counts stay. The other period (`from` 2026-09-05) had the same weakness on another day. After the fix all four ANA-11 cases pass at three clock times.
