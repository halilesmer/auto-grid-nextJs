---
date: 2026-11-09
author: Claude
type: feature
status: open
pr: []
features: [TLS-01]
areas: [worker, frontend, tests]
---

# Grid risk calculator in a new Tools menu

## Request
Move the static grid-risk calculator into Grid Robot. It lives under a new "Tools" menu in the top bar. The products come from the symbols of the selected account. The page only calculates. It never opens a trade. The design was approved in plan 1109-A1/A2.

## Solution
| File | Change |
|---|---|
| `worker_python/src/api/market.py`, `src/utils/mt5_market.py` | New read-only route `GET /api/market/{id}/calc-context?symbol=`: balance, leverage, currency, stop-out level, bid, ask and the margin of 1 lot (`order_calc_margin`). Data-query mode, 409 while the account starts or stops. |
| `frontend_nextjs/src/lib/tools/gridRisk.ts` | Pure calculation, no React. |
| `frontend_nextjs/src/components/tools/GridRiskView.tsx`, `app/tools/grid-risk/page.tsx` | The page: inputs, status card, five KPI cards, usage bar, load curve, level table. |
| `frontend_nextjs/src/components/layout/ToolsNav.tsx`, `AppNav.tsx` | Tools menu, centred in the top bar from `lg`; a group in the menu panel below `lg`. |
| `tests/api/test_calc_context_api.py`, `e2e/mocked/tools-grid-risk*.spec.ts` | Tests, tagged `TLS-01`. The mock worker has the same route. |

Fixes to the old calculator:

| # | Fix |
|---|---|
| A2.1 | The level count uses whole grid steps (price × 10^digits). A float `Math.floor` gave 196 instead of 197 for 50.91 → 45 in steps of 0.03. |
| A2.2 | The usage bar width follows the percentage. |
| A2.3 | Swap sign is the same everywhere: positive is income (green, +), negative is cost (red, −). |
| A2.4 | Status comes from the margin level: equity (capital − loss + swap) / margin. Below 100 % is a margin call. Below the account stop-out level (50 % if unknown) is a stop out. The card shows the first level and price of each. |
| A2.5 | Loss and swap use `tick_value / tick_size`. Swap in points: `swap × point × tick_value / tick_size × lot` per day. Triple-swap days come from the number of days (two extra days per full week). For another `swap_mode` the swap is typed by hand and a warning shows. |
| A2.6 | Margin is the MT5 margin of 1 lot, scaled with the level price. Without it the page uses `price × lot × contract / leverage` and shows a warning. The 2000-level message gives the real count. |

## Why
The swap days are a simple assumption: every position stays open for the full period, and each full week adds two extra days. The exact count depends on the weekday of each entry, which the calculator does not know. The tooltip says so.
The P0 default comes from the `ask` in `calc-context`, not from `/quotes`. The route already returns the price and saves one request.

## Verification
- Worker: `pytest tests/api/test_calc_context_api.py` passes.
- The example "leverage 1:10, capital 1050, P0 80, floor 50, step 0.50, lot 0.01, contract 100, +5 points for 50 days" gives a margin call (margin level 83 %), not a stop out, with `tick_value 1`, `tick_size 0.01` and a stop-out level of 50 %. With a stop-out level of 90 % it is a stop out at the floor. The unit test covers both.
- Not verified: the route against a real MT5 terminal. The worker runs only on the VPS.

## Open points
- [ ] Run the route on the VPS with the DEMO account. Compare balance, leverage, margin of 1 lot and the stop-out level with MT5.
