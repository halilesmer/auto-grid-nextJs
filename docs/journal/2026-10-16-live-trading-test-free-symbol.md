---
date: 2026-10-16
author: Claude
type: fix
status: done
pr: [187]
features: [ENG-07, ENG-05, ENG-10, ZON-08, ACC-10]
areas: [tests]
---

# Live trading tests use a free symbol

## Request
Add live tests for ACC-10 and ENG-07. Run them on the DEMO test account without help from the user.

## Cause
The safety check in `frontend_nextjs/e2e/live/trading.spec.ts` skipped every run. It compared `metrics.current_price` with the zones of all symbols. `current_price` is only the price of the alphabetically first bot symbol. On the DEMO account an active zone of a different symbol covered that number, so the check said "zone covers the price". The engine selects the first active zone per symbol (`grid_zone_selector.get_active_zone`), so the comparison was wrong.
The test zone also had fixed distances (±1, step 0.3, TP 0.3). These fit only USOUSD, but the zone took the symbol of zone 1.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/live/trading.spec.ts` | The test zone takes the first symbol from `TEST_SYMBOLS` that no zone uses. Range 0–1,000,000, step = 30 points of that symbol, TP = 3 steps. Fixed base, no copy of zone 1 (spread guard, instant entry). New test `@ENG-07`. ENG-10 closes the filled position (`clear_scope: 'Tüm İşlemler'`). Counts use `metrics.positions`/`orders` with the magic of the test zone only. |
| `frontend_nextjs/e2e/live/readonly.spec.ts` | New read-only test `@ACC-10` (PR 187). |
| `frontend_nextjs/e2e/live/live.ts` | `LiveMetrics` has `symbol_prices`, `positions`, `orders`. |
| `hooks/RULES.md` §3.9 | Text for the free symbol and the DEMO position of ENG-07. |

## Why
A free symbol keeps the user's zones untouched and needs no free price range. The price of a free symbol is not in the bot metrics before the zone exists, so the zone covers every price.
Rejected: change or pause existing zones for the test (`RULES.md` §3 forbids it).

## Verification
- `scripts/features/run.sh live ACC-10` → 1 passed.
- `E2E_LIVE_DEMO=1`, whole trading suite on DEMO → 5 passed (safety checks, ENG-05, ENG-07, ZON-08, ENG-10), BOT-01/02 skipped (no `E2E_LIVE_BOT_RESTART`).
- After the run: settings and zone states of the account are as before, the test zone has no orders and no position.
- Not verified: that the ENG-07 test fails when the engine does not cancel the orders (no mutation run on the VPS).

## Solution notes
- ENG-10 compared the existing zones with "not PAUSE". Zones that the user paused made it fail. It now expects the state before the zone exit.

## Lessons
- `metrics.current_price` is the price of one symbol. Use `metrics.symbol_prices[symbol]` for a zone check.
- Count positions and orders by the magic of the test zone. The account totals include other zones, and a position of an earlier run on the same symbol stays open until its TP. A first count by symbol found such a position and failed.
