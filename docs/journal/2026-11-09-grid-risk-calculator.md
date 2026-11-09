---
date: 2026-11-09
author: Claude
type: feature
status: done
pr: [471]
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
- Acceptance on the VPS, 2026-11-09 (DEMO account, read only, no trade):
  - The worker ran v0.7.513 (`/system/update/check`: local and remote v0.7.513).
  - `calc-context` for USOUSD: balance 98 861.99 USD, leverage 1:10, `margin_so_so` 50 % (mode 0 = percent), bid 87.958, ask 87.99, margin of 1 lot 879.90 USD. For EURUSD: ask 1.11949, margin of 1 lot 11 194.90 USD. Both equal contract size (100 for USOUSD, 100 000 for EURUSD) × price / 10, so the numbers fit the leverage. XTIUSD does not exist on this broker: the route answers 404 with a clear message.
  - Browser (`localhost:3000/tools/grid-risk`): the Tools menu is centred between Backtest and VPS. The symbol list comes from the selected account (USOUSD found; chips: contract 100, swap long +20.93 points, triple swap Friday, min lot 0.01, margin/lot 879.00 USD). With the MT5 margin the "approximation" hint is gone. The example run (P0 87.9, floor 70.32, 40 levels) shows status "safe", margin level 31 063 % at the floor.
  - 375 px: `scrollWidth` 375 = viewport, no horizontal scroll. Light and dark theme both render correctly. The page shows no account number.
- Not compared by hand: the numbers against the MT5 terminal window (new order dialog). Only the consistency with leverage and contract size was checked.
- Observation: the first `GET /symbols/{id}` after a long idle time took more than 90 s; the next call took 2 s. The page showed "loading" until the answer came. It is not a defect of this feature.

## Open points
- [x] Run the route on the VPS with the DEMO account (done 2026-11-09, see Verification).
- [ ] Optional: compare margin of 1 lot with the MT5 order dialog by hand.
