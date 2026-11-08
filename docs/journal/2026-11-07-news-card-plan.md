---
date: 2026-11-07
author: Claude
type: plan
status: open
pr: []
features: [NWS-01, NWS-02, NWS-03]
areas: [worker, frontend, ops, tests]
---

# News card: plan 1107-A16 and calendar probe

## Request
The project owner approved plan 1107-A16 on 2026-11-07. The dashboard gets a card for the next important economic news.

## Why
- The MT5 economic calendar is the source. Only the calendar has `actual`, `forecast`, `previous` and `impact_type` together.
- The `MetaTrader5` Python package cannot read the calendar. A bridge in MQL5 writes a JSON file to `Common\Files`. The worker reads the file. `AutoGridTradeSessions.mq5` and `trade_sessions.py` (BKT-21) use the same method.
- The MQL5 documentation (`https://www.mql5.com/en/docs/calendar`) says:
  - Times are in trade server time.
  - Values are multiplied by 10^6. `LONG_MIN` means "no value".
  - The importance is `CALENDAR_IMPORTANCE_*`.
  - `CalendarValueLast` with a `change_id` returns only the changed values.
- The documentation does not say where the data comes from. It does not say if the calendar functions work in a service program. Step S1a tests both.
- Backup source: ForexFactory `ff_calendar_thisweek.json`, measured on 2026-11-07.

| Property of the backup source | Measured value |
|---|---|
| Fields | `title`, `country`, `date`, `impact`, `forecast`, `previous` |
| `actual` | Not present |
| Currencies | 9 |
| Range | This week only. `nextweek` returns 404 |
| Time zone | Offset −05:00 |

## Solution
The plan has five steps.

| Step | Content |
|---|---|
| S0 | Design as an Artifact. No repository change |
| S1a | This probe. `worker_python/ops/mt5/AutoGridCalendarProbe.mq5`, a service that runs once and writes `autogrid_calendar_probe.json` |
| S1 | Worker. Service `AutoGridCalendar.mq5` writes the file every minute. `src/utils/econ_calendar.py` reads it and converts the times to UTC. Route `GET /api/news/events?from&to&impact&currencies`. Every logged-in role has access. The route is not bound to an account. The file is `stale` when it is older than 5 minutes. Pytest fixture, mock worker, test NWS-01 |
| S2 | Card `components/dashboard/NewsCard.tsx`. The store `useNewsStore` refreshes every 60 seconds. Filter, i18n, hints, e2e `@NWS-02` |
| S3 | Optional notification. The decision is open. Use the path of FRM-30. Test `@NWS-03` |

Defaults:
- Only the importance High.
- The currencies come from the symbols of the account.
- The card is only on the dashboard.

## Verification
Not verified. The probe runs only on the VPS (MT5 is Windows only). Judge the result with these four criteria:

| # | Criterion |
|---|---|
| a | The number of events is more than 0, and High events are in the list |
| b | `TimeTradeServer` − `TimeGMT` is plausible, and the time of a known release is correct (for example US data at 13:30 or 14:30 UTC) |
| c | `actual` is filled for releases of the last 24 hours |
| d | The service type gives no error |

## Open points
- [ ] Run the probe on the VPS and write the result here.
- [ ] Decision: MT5 calendar or ForexFactory.
- [ ] S0 design, S1, S2.
- [ ] S3: decide if the notification is built.
