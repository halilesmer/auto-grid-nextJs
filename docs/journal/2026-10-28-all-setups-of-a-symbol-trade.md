---
date: 2026-10-28
author: Claude
type: fix
status: open
pr: []
features: [ENG-01, ENG-05, ENG-27, BKT-01]
areas: [worker, frontend, tests]
---

# All active setups of a symbol trade together

## Request

Fix D1 of the test week (`docs/journal/2026-10-28-backtest-live-comparison-result.md`). Live traded only setup A of each symbol. The backtest calculates each setup alone. Decision (2026-10-28): all active setups of a symbol trade at the same time. Each setup keeps its own magic, its own state and its own level lock. The backtest stays the reference. D2 (retcode 10018) is not part of this change.

## Cause

`manage_dynamic_grid` (`grid_orchestrator.py`) kept `active_zones` as symbol → one zone index. `get_active_zone` (`grid_zone_selector.py`) returned the first active zone that contained the price. Setups B and C of a symbol never became the target zone and placed no orders.

Orders, positions and state were already separate for each setup:

| Part | Key |
|---|---|
| Orders and positions | magic (ENG-27, `zone_index_by_magic`) |
| `active_zones_state`, fractal tracking, reject and vanish counters | zone index |
| Level lock | own setup only (ENG-05) |

Only the zone selection blocked the other setups.

## Solution

| File | Change |
|---|---|
| `worker_python/src/core/grid_orchestrator.py` | The loop runs `_manage_zone` for each enabled zone with a price. `active_zones` is now zone index → symbol. A zone stays in `active_zones` when its grid ran in this round (also outside its range). The next round checks the exit for these zones only. |
| `worker_python/src/core/grid_zone_selector.py` | New `zone_contains_price`. `detect_zone_entry` works on one zone. `get_active_zone` stays for the legacy engine and `wrappers.get_active_zone`. |
| `worker_python/src/core/grid_zone_state.py`, `state.py` | `rekey_zone_state` moves the keys of `active_zones` (not the values). |
| `worker_python/src/core/startup.py`, `loop.py` | `netting_conflict`: two or more active setups of one symbol on a netting or exchange account stop the start (`startup_error`). The start keeps `margin_mode` in `state.account_margin_mode`, so the loop does not ask MT5 again. If a second setup comes during the run, the bot skips the full round (no orders, no TP/SL update, no zone exit) and logs the cause one time. |
| `frontend_nextjs/src/lib/backtest/engine/orchestrator.ts`, `zoneSelector.ts` | Same logic as the worker (`manageZone`, `zoneContainsPrice`). The backtest runner gives one zone, so backtest results do not change. |
| `worker_python/tests/parity/runner.py`, `frontend_nextjs/e2e/fixtures/parity.ts`, 46 golden files | The `active` event shows index → symbol. Only `grid_other_setup_positions` changed its trades: setup 1 and setup 2 now fill at the same time. |

## Why

- The backtest runs each setup alone (`runner.ts`, `zones = [zone]`). The same logic for each zone in the worker gives the same result for each setup.
- The old fallback "first zone of the symbol trades when the price is in no zone" is now "each zone trades its own grid". For one zone this is the same behavior. All other golden files show no change of trades.
- A netting account merges the positions of one symbol. Two setups would close the positions of the other setup. The bot must not do this without a message.

Rejected: change the backtest to "first matching setup only". The live strategy uses 3 setups for each symbol, and the backtest results for B and C were the plan.

## Verification

| Check | Result |
|---|---|
| New tests red before the fix | 4 ENG-01 tests in `test_eng_zone_selection.py`, 3 tests in `test_eng_startup_loop.py`: red |
| `pytest tests` (worker, without live) | 886 passed |
| Review (`reviewer` agent) | no critical finding; fixed: MT5 call in the loop outside `try`, stale comments, names |
| `npx tsc --noEmit`, `npm run lint` | green |
| `scripts/features/run.sh` | see PR |

Changed tests (behavior change, not a relaxed check):

| Test | Reason |
|---|---|
| `test_gleiches_symbol_weiter_nur_eine_zone` → `test_zwei_setups_eines_symbols_platzieren_gleichzeitig_orders` | It checked the old rule "only the first zone". The new rule is the opposite. |
| `test_zonen_verschiedener_symbole_laufen_gleichzeitig`, ENG-10 exit tests, ENG-27 rekey test | Only the shape of `active_zones` changed (index → symbol). |
| `test_order_eines_anderen_setups_belegt_kein_level` (ENG-05) | Setup 1 now manages its own grid, so its order can move. The test still checks that setup 2 gets all levels. |
| `test_geloeschte_aktive_zone_loest_keinen_ausstieg_beim_nachbarn_aus` (ENG-27) | Zone b had its range outside the price. Now zone b trades by itself, and its `clear_on_exit` clears it in the second round (same as the backtest with zone b alone). The range of b now contains the price, so the test still checks that the delete of zone a does not change zone b. |

## Open points

- [ ] Repeat the test week after D1 and D2 (Hedging DEMO account, 3 setups on one symbol).
- [ ] Watch the margin: each symbol can now have up to 3 times more orders and positions.
- [ ] Rollout: the auto-updater pulls `main` on the VPS, and `watched_bots.json` restarts the bots. On a Hedging account, setups that were idle start to place orders at once. On a netting account with 2 active setups for one symbol, the bot does not start, and open positions stay without management. Check each account before the merge reaches the VPS.
- [ ] Known behavior, now for every setup: a setup with `clear_on_exit` whose range does not contain the price at the start gets AUTO_CLEAR in the second round. This was true before for the first setup of a symbol, and the backtest does the same. Decide if this is correct.

## Lessons

- A test week with 3 setups on one symbol tests 3 setups only if the bot activates all of them. Compare the number of setups with trades before the trade-by-trade compare.
