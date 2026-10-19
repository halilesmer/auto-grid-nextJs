---
date: 2026-10-19
author: Claude
type: feature
status: done
pr: []
features: [BKT-14]
areas: [worker, frontend, docs]
---

# Store live-versus-backtest comparison reports

## Request

The owner runs a one-week live test on one DEMO account. After the week, the same period runs in the browser backtest.
The owner wants to compare both trade by trade and to open the comparison later. Therefore the app must store it.

## Solution

| File | Change |
|---|---|
| `worker_python/src/api/backtest_reports.py` | Router `GET/POST /api/backtest/reports`, `GET/DELETE /api/backtest/reports/{id}`. Strict models, size limit, limit per owner. |
| `worker_python/src/utils/market_db.py` | New migration: table `backtest_reports` and an owner index. |
| `worker_python/src/api/__init__.py` | Registers the router. |
| `frontend_nextjs/src/lib/backtest/liveCompare.ts` | Pairing of live and backtest trades, checks, tolerance, drawdown. No React. |
| `frontend_nextjs/src/services/backtestReportApi.ts` | Calls through `axiosInstance`. |
| `frontend_nextjs/src/store/useLiveCompareStore.ts` | Holds the taken-over runs, one per zone magic. |
| `frontend_nextjs/src/components/backtest/LiveCompareSection.tsx`, `ReportTable.tsx` | Take over runs, load deals, table per symbol, save, saved list, read-only view, delete. |
| `frontend_nextjs/src/i18n/messages/livecompare.ts` | Texts and hints in tr, en and de. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | Mirrors the report endpoints. |
| `worker_python/tests/api/test_backtest_reports_api.py`, `e2e/mocked/backtest-reports.spec.ts`, `e2e/mocked/backtest-live-compare-lib.spec.ts` | Tests tagged BKT-14. |

## Why

| Decision | Reason |
|---|---|
| The browser calculates, the worker stores. | The backtest engine lives in the browser. The worker only checks shape, size and count, and stores the JSON unchanged. A second engine in Python would drift. |
| Pairing key: zone magic, side, order of entry time, window of 1 hour. | The magic number maps a trade to a zone (ENG-27). A missing trade then shows as a gap and does not shift all later pairs. |
| Default tolerance is strict: same count, same M1 candle, price within 0.5 spread, profit within 5 %. | The owner asked for it. The tolerance used is stored in each report, so an old report stays readable after a change of the default. |
| Spread for the price check: symbol spread in points at run start, times the point size. | The candle spread of each trade is not in the live deal. A fixed value keeps both sides on the same rule. |
| Drawdown for both sides: running net total of closed trades by exit time. | Live has no equity curve. One method for both sides makes the numbers comparable. The engine drawdown (equity per candle) stays in the run result. |
| Only saved zones with a magic, MT5 candles and no unsaved changes are taken over. | An unsaved draft or a CSV run says nothing about what the live bot did. The page counts the skipped runs. |
| Taken-over runs live in their own store. | The page keeps 6 setups. With more zones, the owner runs two rounds and the first results stay. |
| Admin sees and deletes all reports, a user only own reports, foreign ids give 404. | Differs from presets (admin sees only own). The owner asked for it: the admin supports users. |
| Report limit 50 per owner, size limit 4 MB. | Bounds disk use. A report with many trades stays small enough for one browser response. |

## Verification

| Check | Result |
|---|---|
| `pytest tests` in `worker_python` | 881 passed, 2 skipped. |
| `scripts/features/run.sh` (unit, api, e2e) | All passed. |
| `npx tsc --noEmit`, `npm run lint` in `frontend_nextjs` | No errors. |
| Playwright `backtest-reports.spec.ts`, `backtest-live-compare-lib.spec.ts` (mocked) | Passed, see PR for the full run. |
| Real worker, real database migration, real live deals | Not verified. The worker runs only on the VPS. The migration needs the updated worker. |

## Review changes

| Finding | Change |
|---|---|
| The size limit ran after the whole body was parsed. | POST reads the body as a stream with the limit, then validates. Zone keys, deviations and period are bounded. |
| The list read every payload. | `symbol_count` and `passed_count` are columns; the list reads no payload. |
| Deleting an account left its reports. | `market_db.delete_account` deletes them. |
| Coarser data candles break the M1 entry check. | Only M1 runs are taken over. |
| Runs with different settings in one report. | Saving is blocked until all runs use the same settings. |

The migration test for `offset_mode` assumed that it was the last migration. It now removes the newer table first.

## Follow-up: commission and archive gaps

| File | Change |
|---|---|
| `worker_python/src/api/backtest_reports.py` | Optional `commissionPerLot` per symbol and `archiveGaps` (start, end, reason; at most 500) per report. |
| `frontend_nextjs/src/lib/backtest/liveCompare.ts`, `LiveCompareSection.tsx`, `ReportTable.tsx` | Send both fields. The opened report shows the gap warning; the symbol detail shows the commission. |

Reason: the run form stores `commission: null` when the run uses the archive proposal, so the used value was lost.
A profit deviation then had no visible cause. A gap in the deal archive showed only when the report was made, so a failed symbol in an old report looked like a bot difference.
Both fields are optional: reports saved before this change stay valid.

## Open points

- A live trade without a known entry (position older than the archive) never matches the entry-candle check.
- A partial close is one trade on both sides. The pairing does not merge partial closes.
