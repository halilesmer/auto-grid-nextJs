---
date: 2026-10-10
author: Codex
type: diagnosis
status: done
pr: [147]
features: [BKT-04]
areas: [frontend, worker, docs]
---

# Verify installed backtest swap modes

## Request

- Compare the installed MetaTrader5 swap constants and distinct VPS symbol modes with `broker/costs.ts`.
- Use read-only access and preserve the running MT5 session.

## Cause

The worker symbol API returned HTTP 401 during the earlier B4 check. The local SSH bridge exposes only fixed actions. The existing Windows VPS session gave read-only access to the installed Python package and the worker symbol cache.

## Solution

| Source | Observed result |
|---|---|
| Installed `MetaTrader5` package, version 5.0.6180 | `SYMBOL_SWAP_MODE_DISABLED=0`, `POINTS=1`, `CURRENCY_SYMBOL=2`, `CURRENCY_MARGIN=3`, `CURRENCY_DEPOSIT=4`, `INTEREST_CURRENT=5`, `INTEREST_OPEN=6`, `REOPEN_CURRENT=7`, `REOPEN_BID=8`. |
| `worker_python/broker_symbols.json`, last written on 2026-10-10 at 07:50 VPS time | `swap_mode` values: 1 (370 cached records), 3 (20), 5 (2,069), 6 (591). The file holds records for more than one account; these counts are records, not distinct symbol names. |
| `frontend_nextjs/src/lib/backtest/broker/costs.ts` | Accepts 0, 1, and 4. It blocks observed modes 3, 5, and 6 when swap is enabled. The numeric mapping matches the installed package. |

The read-only commands were `.venv/Scripts/python.exe -m pydoc MetaTrader5` and `sls swap.mode broker* | group line | select count,name` in the VPS worker directory. No `mt5.initialize()`, login, worker restart, order action, or credential read occurred. The cache is the file read by `get_cached_symbols()` for `/api/symbols` in `worker_python/src/utils/mt5_helpers.py`. This check did not obtain a fresh API response or query current terminal symbols. Mode 4 is present in the installed package but absent from the measured cache.

## Why

The cache provides the exact `swap_mode` field that the worker serves. Its timestamp and per-account scope limit the claim to cached symbol records. The installed package proves the numeric constants without an MT5 connection. No code behavior or supported-mode list needs a change.

## Verification

- VPS package documentation showed version 5.0.6180 and the nine numeric `SYMBOL_SWAP_MODE_*` values above.
- The cache query returned four grouped lines with counts 370, 20, 2,069, and 591; no symbol name or account identifier was printed.
- Local source review confirmed the mappings and unsupported-mode branch in `costs.ts`, and the cache reader in `mt5_helpers.py`.

## Lessons

An authenticated API failure does not prevent a narrow read-only check through an already open Windows session. Label cache evidence as cache evidence; do not present it as a fresh API or terminal result.
