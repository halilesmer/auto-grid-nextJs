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
The probe ran on the VPS on 2026-11-08 as a service, with one terminal. Result:

| # | Criterion | Result |
|---|---|---|
| a | Events more than 0, High events in the list | Passed. 222 events: 16 high, 64 moderate, 135 low, 7 none. 19 currencies |
| b | Server time and a known release | Passed. `TimeTradeServer` is 09:45 and `TimeGMT` is 07:45, so the server is GMT+2. US CPI at 15:30 server time is 13:30 UTC, which is correct |
| c | `actual` filled for releases of the last 24 hours | Open. The test ran on a weekend, there was no release in the last 24 hours, and all `impact_type` values were `none`. The S1 service starts its window at the start of the month, so the first VPS test after the merge can check this |
| d | The service type gives no error | Passed. `err_history=0` and `err_last=0`. `CalendarValueLast(0)` returned a change_id |

Decision: the source is the MT5 calendar. The backup source is not needed now.

Findings of the probe and what S1 does:
1. The file was written in ANSI (cp1252). The service writes UTF-8 (`FILE_ANSI` with `CP_UTF8`). The worker reads UTF-8 and falls back to cp1252.
2. `Q()` did not escape control characters, and one title had a raw line feed, so the JSON was not valid. The service escapes `\n`, `\r`, `\t` and all characters below 0x20. The worker reads with `strict=False`.
3. Titles come in the language of the terminal (German on the VPS). The service passes `title` as is and adds the language-independent `event_code`. The decision about the title language (1107-A16.7) belongs to S2.
4. The probe had no `event_code`, `sector`, `time_mode`, `unit` and `multiplier`. The service writes them. The list of inverse indicators and the sector comment need them. `time_mode` separates all-day events (an "EU summit" showed 00:00).
5. The events were not in order. The worker sorts them by time.

Known limit: the worker converts server time to UTC with one offset (`time_trade_server` − `time_gmt`, rounded to 15 minutes). An event close to a daylight-saving change can be one hour off.

The real `event_code` values are known only after the first VPS test of S1. The inverse list (`INVERSE_KEYWORDS` in `econ_calendar.py`) matches by substring on the code and the title, so check it then.

## Open points
- [x] Run the probe on the VPS and write the result here.
- [x] Decision: MT5 calendar or ForexFactory. MT5.
- [ ] S1: install the service on the VPS (`MQL5\Services`), check criterion c and the real `event_code` values.
- [ ] S0 design (done), S2.
- [ ] S3: decide if the notification is built.
