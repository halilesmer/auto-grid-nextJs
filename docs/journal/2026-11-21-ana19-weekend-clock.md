---
date: 2026-11-21
author: Claude
type: fix
status: closed
pr: []
features: [ANA-19]
areas: [frontend]
---

# Two ANA-19 tests depended on the clock

## Request
Two tests in `e2e/mocked/chart-view-like-tradingview.spec.ts` failed on every PR since Friday 22:26 UTC: "Açılışta son mumlar varsayılan genişlikte görünür, zoom saklanmaz ve yeniden yüklemede geri gelmez" (line 91) and "Son mumdan uzaktaki görünüm yeni mumla kaymaz" (line 178). The error was `expect(locator('[data-last-price]')).toHaveCount(1)`, received 0.

## Cause
The spec had no fixed clock. The mock builds the H1 candles and the running candle from the real time. The FX market closes on Friday at 22:00 UTC, so at the weekend there is no running candle and no last price.

## Evidence
`E2E_FAKE_NOW` set for `scripts/features/run.sh e2e ANA-19`:
- 2026-11-21T12:00Z (Saturday): both tests fail with the error above.
- 2026-11-18T12:00Z (Wednesday): 24 passed.

## Change
The spec runs with a fixed weekday clock (`test.use({ fakeNow: '2026-11-18T12:00:00Z' })`), like the other chart tests. The assertions are the same. With the fix and `E2E_FAKE_NOW` on the Saturday time, the six tests of the spec pass.

## Open
`formation-page.spec.ts` also uses running-candle data without a fixed clock. Its FRM-20 tests passed on the Saturday clock, so it is not changed.
