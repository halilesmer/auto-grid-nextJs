---
date: 2026-11-13
author: Claude
type: fix
status: done
pr: []
features: [UI-17]
areas: [frontend, tests]
---

# UI-17 test failed from 21:00 UTC: mock candles depend on the clock

## Request
The mocked e2e test `chart-dock-formation.spec.ts` "Dar pencerede…" (`@UI-17`) failed on `main` and on each PR from about 21:20 UTC on 2026-11-12. An older green `main` commit failed too when CI ran it again. The code had not changed.

## Cause
`MockWorker.rates` (`e2e/fixtures/mock-worker.ts`) makes candles from `mid(t) = 97 + 2 sin(t/43200) + 0.3 sin(t/2700)` when a test gives no `ratesSeries`. The last candle is the one at the real time, so the curve, and so the formation scan result, changes with the time of day. The number and order of formation candidates change with it. At 560 px the formations package overflow menu then holds `formation-forms-more` as its first button, or no overflow at all.

Proof (same code, `E2E_FAKE_NOW` set, test run alone): 12:00, 16:21, 18:00, 20:00 UTC pass; 21:00 and 22:00 UTC fail (2026-11-12 dates).

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/test.ts` | New test option `fakeNow` (ISO or `null`). It sets the page clock and the mock clock. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | `setFakeNow()`; `nowMs()` uses it before `E2E_FAKE_NOW`. |
| `frontend_nextjs/e2e/mocked/chart-dock-formation.spec.ts` | `test.use({ fakeNow: '2026-11-12T16:21:00Z' })`. |

The test is not weaker: it checks the same things, with the data of a time when it was green.

## Verification
- Before: at 04:22 UTC the test failed. After: `npx playwright test --project=mocked e2e/mocked/chart-dock-formation.spec.ts` at 04:24 UTC: 6 passed.

## Lessons
- A mocked test with an overflow or count check must not use the real clock. Set `fakeNow`.
- Other specs that use mock candles without `ratesSeries` can have the same risk. Not checked in this change.
