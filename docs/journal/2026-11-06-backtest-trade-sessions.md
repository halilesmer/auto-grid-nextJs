---
date: 2026-11-06
author: Claude
type: feature
status: open
pr: []
features: [BKT-21, ENG-32, ENG-33]
areas: [worker, frontend]
---

# Backtest models the broker trade sessions (10018 Market closed)

## Request
The live bot gets retcode 10018 "Market closed" when it places, changes or deletes an order while the trade session is closed. The backtest did not know this. It placed and filled orders at closed hours and, if it had met 10018, would have paused the zone after three rejects, which the live bot does not do (ENG-32).

## Solution
| File | Change |
|---|---|
| `worker_python/ops/mt5/AutoGridTradeSessions.mq5` | New MQL5 script. It writes `SymbolInfoSessionTrade` of all Market Watch symbols to `Common\Files\autogrid_trade_sessions.json`. |
| `worker_python/src/utils/trade_sessions.py` | Reads and checks the file (7 days, sorted ranges, server name). `sessions_for(symbol, server)` returns the plan or `None`. |
| `worker_python/src/api/symbols.py` | `GET /symbols/{id}` adds `trade_sessions` to each symbol (not stored in the symbol cache). |
| `frontend_nextjs/src/lib/backtest/broker/tradeSessions.ts` | `parseTradeSessions`, `tradeOpenAt`. |
| `frontend_nextjs/src/lib/backtest/broker/simBroker.ts`, `pathBroker.ts` | `setTradeOpen`. When closed: 10018 for check and send, no fill, TP or SL trigger. |
| `frontend_nextjs/src/lib/backtest/engine/` | Port of ENG-32 and ENG-33: `lastRetcode`, `marketClosedUntil`, `cancelClosedUntil`, `order.marketClosed`. |
| `frontend_nextjs/src/lib/backtest/runner.ts` | Session state per candle, wake-up at the end of a 10018 pause, log lines. `RunModel.tradeSessions` (default on). |
| i18n | Four log texts (tr/en/de). No new control. |

## Why
- **Source of the sessions:** the MT5 Python package has no session function. `symbol_info.trade_mode` shows only the state now. Gaps in M1 candles or ticks cannot show the case that matters: during a closed trade session the quotes still flow (EURCHF rollover, XAUUSD 01:00 session change). Log times of 10018 cover only past windows and the log keeps 2000 lines. A broker file is exact and needs no guess. The cost is one manual step on the VPS.
- **File path without MT5:** the worker reads `%APPDATA%\MetaQuotes\Terminal\Common\Files` (or `AUTOGRID_TRADE_SESSIONS_FILE`). It does not call `terminal_info()`, so the symbol route still needs no MT5 connection (SYM-01).
- **State per candle:** the state at the start of the candle holds for the candle. A boundary inside a candle is counted (`run.tradeSessionPartial`), not split.
- **Gap fill at the open:** the candle path moves on while closed, but nothing triggers. The existing gap rule fills at the market price what still holds at the new quote. Price that went through a level and came back does not fill.
- **Retry after 60 s:** the live loop runs about once per second. The backtest bot runs at path points. A pause that ends inside a candle (also a flat candle, which has no path segment) wakes the bot at its end. The unit test counts five tries in one closed M5 candle.
- **Instant entry:** `instant_entry.py` does not check `market_closed_until`. The port does not either.
- **No sessions known:** `None`, "always open" and `RunModel.tradeSessions = false` give the same trades, summary, equity and log as before, in all spread modes and with replay.

## Verification
- Red first: `test_trade_sessions.py`, `test_symbol_sessions_api.py` (ImportError) and `backtest-sessions-lib.spec.ts` (module missing). Then green.
- `backtest-sessions-lib.spec.ts`: 13 tests. All other `backtest-*-lib` tests stay green without change.
- The MQL5 script is not compiled and not run. The Mac has no MetaEditor.

## Open points
- [ ] VPS: compile and run the script once. Check the minute alignment of the boundaries and `GET /symbols/{id}` for the 8 symbols.
- [ ] VPS acceptance: every 10018 line of windows 3 and 4 falls into a closed range. Run the bt tool with and without sessions.
- [ ] Holidays with quotes but no trade are not in `SymbolInfoSessionTrade` and stay unmodelled.
- [ ] The "usually open" hint in the zone card still uses the M5 candle guess (`trading_hours.py`). It can use the file later.

## Lessons
Quotes can flow while the trade session is closed. Candle gaps do not show a closed trade session.
