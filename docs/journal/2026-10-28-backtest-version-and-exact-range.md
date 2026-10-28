---
date: 2026-10-28
author: Claude
type: fix
status: done
pr: []
features: [BKT-14, BKT-15, ANA-10]
areas: [frontend]
---

# Report version without double v, exact backtest period

## Request
Close two small open points of `2026-10-28-backtest-live-comparison-result.md`. The saved report list showed the worker version as "vv0.7.251". The period accepted only whole days, but the live comparison needs the exact start and end second.

## Cause
The worker stores the content of the `VERSION` file, and that file already starts with "v". The list and the opened report added a second "v". The mock worker stored the version without "v", so no test could see it.

## Solution
| File | Change |
|---|---|
| `LiveCompareSection.tsx`, `i18n/messages/livecompare.ts` | Show the stored version as it is |
| `e2e/fixtures/mock-worker.ts` | Mock stores `v0.0.0-mock`, like the real worker |
| `lib/serverTime.ts` | `DayRange` gets optional `fromTime` and `toTime` (HH:MM:SS, broker time); `rangeBounds` adds them. An end of 00:00:00 or no end time stays the end of the day |
| `DateRangePicker.tsx`, `useAnalysisParams.ts`, `presets.ts`, `SetupCards.tsx` | Two time fields in the period panel (`bt-time-from`, `bt-time-to`); URL keys `ft` and `tt`; saved presets keep the times |
| `i18n/messages/analysis.ts`, `hints.ts` | Labels, error text and tooltips in tr, en, de |

## Why
Optional times keep every existing URL, preset and the Analyse page working. A separate exact-time mode was rejected: it would need a second range model. The draft was approved by the project owner before the code.

## Verification
- `backtest-reports` e2e was red (`vv0.0.0-mock`), then green (7 passed).
- `rangeBounds` unit test and `backtest-exact-range` e2e: 8 passed. The unit test did not compile against the old `serverTime.ts`.

## Open points
- [ ] Repeat the test week with the exact start and end second.
