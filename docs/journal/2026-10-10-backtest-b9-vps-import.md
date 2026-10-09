---
date: 2026-10-10
author: Codex
type: ops
status: done
pr: []
features: [BKT-05]
areas: [worker, frontend, ops, docs]
---

# Verify annual CSV imports on VPS

## Request

- Import the three supplied annual M1 files into the selected DEMO account.
- Read an imported candle through the API and compare its time and OHLC with the source terminal.
- Keep B4 open and preserve existing trading state.

## Verification

| Check | Result |
|---|---|
| Source files | MT5 exports, UTF-8, tab separator, separate date and time columns. |
| Local validation | All rows passed time order, duplicate, M1 grid, finite price, OHLC and volume checks. |
| EURUSD | 381,807 candles; 2025-10-01 00:03 through 2026-10-09 23:58. |
| USOUSD | 362,989 candles; 2025-10-01 01:00 through 2026-10-09 23:58. |
| XAUUSD | 363,431 candles; 2025-10-01 01:00 through 2026-10-09 23:57. |
| Import | All three appeared as committed imports in the selected DEMO account. No existing import was replaced. |
| Time basis | Broker wall time; fixed mode with offset zero preserves the exported time. Historical UTC offsets were not inferred. |
| API | `GET /api/market/{id}/rates?source=csv:<id>` returned HTTP 200 for USOUSD. |
| API range | 2,822 candles included warmup; the 08–09 October simulation used 2,759 candles. |
| Exact overlap | USOUSD, 2026-10-09 23:58: O 93.448, H 93.458, L 93.418, C 93.448. CSV, API and MT5 agreed. |
| API timestamp | `1791590280` encoded the same broker wall time. This does not establish a UTC conversion. |
| Source terminal | USOUSD returned 362,989 bars; XAUUSD returned 363,431 bars. Their final candle times and OHLC matched the files. |
| Gaps | The files contained time gaps. This check does not prove that all gaps are market closures. |
| Spread limit | The API returned null spread values. The simulation used the current spread fallback, not historical CSV spreads. |
| Safety | No bot, order, position, account login or worker restart was changed during this verification. |

## Lessons

The annual import and broker-time overlap check satisfy the manual B9 item.
They do not validate strategy profit, historical spreads, or seasonal UTC conversion.
B4 swap evidence and the isolated ZON-21 trading check remain separate open tasks.
