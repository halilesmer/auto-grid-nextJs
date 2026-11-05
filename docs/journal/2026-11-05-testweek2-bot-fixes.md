---
date: 2026-11-05
author: Claude
type: fix
status: open
pr: []
features: [ENG-33, ENG-34, ANA-04, ENG-32]
areas: [worker]
---

# Test week 2: margin metrics, 10018 cleanup throttle, market_db race

## Request
Three worker fixes from test week 2 on the DEMO account.

## Cause
- The broker deleted 262 orders with "no money". The margin level was not measurable: the metrics had no margin data.
- The cleanup of old magic orders ("Mutlak Temizlik") tried again every 2 s after retcode 10018. 343 log lines on one day.
- `market_db.size_bytes()` used `os.path.exists` and then `getsize`. These two calls are not atomic. SQLite removes `market.sqlite-wal` between them. `FileNotFoundError` gave HTTP 500 on `/api/market/{id}/rates`.

## Solution
| File | Change |
|---|---|
| `src/core/grid_metrics.py` | New fields `margin`, `margin_free`, `margin_level` from `account_info()` (ENG-34). Data only, no UI. |
| `src/core/grid_orders.py`, `src/core/state.py` | `cancel_order` waits 60 s per symbol after a 10018 reject (ENG-33), like ENG-32. |
| `src/utils/market_db.py` | `getsize` in `try/except FileNotFoundError`. |
| `tests/fakes/fake_mt5.py` | `AccountInfo` has margin fields. |

## Verification
- Three new tests were red before the fix and are green after it.
- Full worker test run: see the PR.
- Live: not verified. The VPS test runs with auto-update off.

## Open points
- [ ] Pull on the VPS after the test week and check the margin fields in the metrics file.
- [ ] A UI for the margin level needs a design first.

## Lessons
Check-then-use on files that other processes delete is a race. Catch the error instead.
