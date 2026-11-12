---
date: 2026-11-12
author: Claude
type: decision
status: done
pr: []
features: [BKT-04]
areas: [worker, backtest]
---

# Symbol list adds currency_base and currency_margin (1112-K10.1, PR-1)

## Request
Plan 1112-K9: make the browser backtest profit match the real MT5 deals. PR-1 adds the two fields that PR-2 needs.

## Cause
The K7.2 diagnosis found that `costs.ts` converts all profit with one tick value, read when the data was fetched. MT5 converts with the rate at the time of the closing deal. With the closing rate the sum of net differences fell from 9.84 to 5.71 (window P6+).

## Solution
`SYMBOL_COST_FIELDS` now has `currency_base` and `currency_margin`. `GET /api/symbols/{id}` returns them. The time check uses the same list. An old cache entry without them counts as stale and refreshes. PR-2 picks the conversion pair from these fields: the pair with base = profit currency and profit = account currency (multiply), or base = account currency and profit = profit currency (divide). It does not parse symbol names.

## Why
Index and CFD symbol names do not tell the currency. The broker fields do. No engine, bot or order code changes.
