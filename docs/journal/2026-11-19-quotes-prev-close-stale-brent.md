---
date: 2026-11-19
author: Claude
type: fix
status: closed
features: [FRM-29]
areas: [worker]
---

# Stale previous close in `quotes` for Brent

## Symptom
`GET /api/market/{id}/quotes?symbols=UKOUSD,USOUSD` (DEMO account, read only) gave `prev_close` 116.712 for Brent, the D1 close of 10-30. The D1 bars from `/rates` end with 11-18 = 93.104. WTI was correct. The favorites list showed about -19 % daily change for Brent.

## Cause
`collect_quotes` read `copy_rates_from_pos(D1, 0, 2)` and took `bars[-2]` as the previous close. This holds only when the last bar is the bar of the current day. When the current-day bar does not exist yet (Brent session not open), the last bar is already the previous day. `bars[-2]` is then the bar before it: for Brent, the 10-30 bar, because its D1 history has a gap between 10-30 and 11-18.

Red test: `worker_python/tests/unit/test_quotes_prev_close.py` returned 116.712 instead of 93.104.

## Fix
`_previous_close_bar` (`src/utils/mt5_market.py`): if the tick day is later than the day of the last D1 bar, the last bar is the previous close. Otherwise `bars[-2]` as before. The API test now sets the fake tick time inside the day of the forming bar.

## Open
Live check after the VPS pulled the change: read-only `quotes` call for `UKOUSD`; `prev_close` should be about 93.1.
