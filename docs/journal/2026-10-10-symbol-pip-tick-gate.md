---
date: 2026-10-10
author: Codex
type: fix
status: done
pr: []
features: [ENG-30, ZON-21, BKT-03]
areas: [worker, frontend, tests]
---

# Correct symbol pip and tick limits

## Request
- Correct the fractal next-order loss limit for EURUSD and other symbols.
- Use Forex pips and broker ticks for other instrument classes.
- Keep the effective price distance of saved settings.
- Change only the fractal loss limit. Do not send live orders or bot commands.

## Cause
- The old `pips` mode compared the setting directly with a price difference.
- EURUSD values therefore meant price distances, rather than pip counts.
- Floating-point subtraction could delay an order at the exact limit.
- `sanitize_settings` rounded floats to five decimal places. That rounding changed fractional counts after migration.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/symbol_distance.py` | Derive the unit from `trade_calc_mode`, `digits`, `point`, and `trade_tick_size`. |
| `worker_python/src/utils/mt5_helpers.py` | Return `distance_unit` and `distance_unit_size`; enrich old cache rows in memory. |
| `worker_python/src/core/grid_execution/fractal_entry.py` | Compare count × size; use Bid for BUY and Ask for SELL; block unknown units. |
| `frontend_nextjs/src/lib/symbolDistance.ts` | Share the frontend calculation and explicit-save migration. |
| `frontend_nextjs/src/components/zone/ZoneFractalFields.tsx` | Show Pips or Ticks, the price distance, examples, and missing-data messages in three languages. |
| `frontend_nextjs/src/hooks/useZoneActions.ts`, `src/store/useSettingsStore.ts` | Save migrated counts with `fractal_next_loss_unit_version: 1` only on explicit saves. |
| `frontend_nextjs/src/lib/backtest/` | Carry symbol metadata into the simulated broker and apply the same loss gate. |
| `worker_python/src/utils/config.py` | Preserve fractional counts without a second rounding step. |

- Forex modes 0 and 5 use `10 × point` for 3 or 5 digits; other digit counts use `point`.
- Other instrument classes use `trade_tick_size`. Symbol names do not select the calculation.
- Missing or version-0 settings keep the old direct price-distance comparison.
- New settings use version 1 and a tolerance of `unit_size × 1e-8`.
- An active version-1 distance limit blocks new orders when symbol metadata is invalid, including the first order.
- The worker and backtest log the missing-data reason once per zone and direction.
- EURUSD migration converts 0.001 to 10 pips. Rendering does not save account settings.
- Money mode and the latest position selection by zone and direction stay unchanged.

## Why
The version marker preserves old settings before the owner saves them again. Automatic account migration could change running trading settings.

## Verification
- The first regression run failed 25 new boundary cases before the engine correction.
- Worker tests cover EURUSD 4/5 digits, USDJPY 2/3 digits, broker ticks unequal to `point`, and both directions.
- They cover below, at, and above the limit, zero, missing positions, separate zones, and invalid metadata.
- API tests cover metadata and exact storage of fractional migrated counts.
- The two new parity scenarios reach the limit at tick 85. Legacy scenarios keep their original events, including tick 86.
- All 38 existing scenario and golden files stay unchanged. Only the two new golden files were generated.
- Browser tests cover explicit save, legacy migration, tick labels, missing data, tooltips, and mobile layouts.
- Screenshots at 1440 and 375 pixels in light and dark themes show the price preview without horizontal overflow.
- Live MT5 execution: not verified. The tests use fake brokers and mocked HTTP calls.
- The local Turbopack build failed in its port helper. The isolated mocked production build succeeds with `next build --webpack`.
- Pyright reports 33 diagnostics. Comparison with the unchanged branch base shows no new diagnostics.

| Command | Result |
|---|---|
| `scripts/features/run.sh unit` | 508 passed. |
| `scripts/features/run.sh api` | 250 passed. |
| `python -m pytest tests/unit/test_eng_fractal_entry.py tests/unit/test_symbol_costs.py tests/unit/test_symbols_cache.py -q` | 109 passed after the final configuration adjustment. |
| `scripts/features/run.sh e2e 'ZON\|BKT\|UI-07\|UI-08'` | 335 passed; six existing cases exceeded their time limits. |
| `npm run lint` | Exit 0. |
| `npx tsc --noEmit` | Exit 0. |
| `pyright` | 33 existing diagnostics; no new diagnostics against the branch base. |
| `npx playwright test --project=mocked --last-failed --workers=1 --reporter=list,json` | All six cases passed in 21.5 seconds, with unchanged assertions and time limits. |
| `scripts/features/run.sh check` | 157 features valid. |

- The broad browser run used four workers. The repeated cases passed with one worker after the other checks completed.
- The manual review used `hooks/RULES.md` §9. API authentication, remote control, bot state, and time conversion do not change.
