---
date: 2026-10-13
author: Claude
type: fix
status: open
pr: []
features: [ENG-05, ENG-18, ZON-14, ZON-19, BKT-01, BKT-02]
areas: [worker, frontend, tests, docs]
---

# Other setups no longer block grid levels

## Request
The DEMO check of ZON-14 showed a missing BUY STOP level in a grid setup.
Find the cause. Decide with the project owner if positions and orders of other setups can block the levels of a setup. Repair the engine and the backtest engine.

## Cause
| Item | Value |
|---|---|
| Symptom | DEMO account A, EURUSD. Setup 2 (grid, `BOTH`, `grid_step` 0.001, `instant_entry`, levels 5/5, magic 200007) started its BUY STOP ladder at 1.12089, not at 1.11989. The other order types started one grid step from the instant positions. |
| Setup 1 | Fractal setup, magic 200006, paused. It had 3 open BUY positions at 1.11952, 1.1191 and 1.11887. |
| Root cause | `get_existing_levels_by_direction` (`worker_python/src/core/grid_orders.py`) collected the prices of all robot orders and positions (each magic in the robot range) and of all manual positions of the symbol. `OrderPlacer.place_missing_orders` skips a level when one of these prices is in 0.45 × `grid_step`. 1.11989 − 1.11952 = 0.00037 ≤ 0.00045. Thus the position of setup 1 blocked the level of setup 2. |
| Origin | The rule came with the first engine commit (2026-08-25). No journal entry or catalog text gave a reason for other robot magics. ENG-05 named only manual positions. |
| Backtest | `getExistingLevelsByDirection` (`frontend_nextjs/src/lib/backtest/engine/orders.ts`) had the same rule. |

## Solution
Decision of the project owner (2026-10-13): a level is occupied only by orders and positions of the setup itself (its magic) and by manual positions.

| File | Change |
|---|---|
| `worker_python/src/core/grid_orders.py` | `get_existing_levels_by_direction` gets the parameter `magic`. It uses only robot orders and robot positions with this magic, plus all manual positions. |
| `worker_python/src/core/grid_execution/handler.py` | Sends `magic=config.target_magic`. |
| `frontend_nextjs/src/lib/backtest/engine/orders.ts`, `handler.ts` | The same change for the backtest engine (`magic`, `config.targetMagic`). |
| `worker_python/tests/unit/test_eng_grid_tick.py` | New tests (ENG-05): `test_position_eines_anderen_setups_belegt_kein_level` (position of a paused setup) and `test_order_eines_anderen_setups_belegt_kein_level` (pending order of an active setup that the price left). |
| `worker_python/tests/parity/make_scenarios.py` | New scenario `grid_other_setup_positions`: setup 1 fills BUY positions and the price leaves it; setup 2 sets its BUY STOP orders next to these positions. New golden file. |
| `frontend_nextjs/e2e/mocked/backtest-grid-parity-lib.spec.ts` | Scenario count 24 → 25 (the test asks for a decision for each new scenario). |
| `docs/features/features.yaml` | ENG-05 text. BKT-01: scenario count 28 → 46 (the old value was wrong) and the new scenario. BKT-02: 24 → 25. |

## Why
Each setup has its own magic, its own `max_positions` and its own statistics (ENG-27, ZON-19). A position of a different setup does not belong to the grid of this setup. When it blocks a level, the grid of this setup has a gap. Manual positions stay in the set, because ENG-05 names them on purpose.

The accepted results:

| Case | Result after the change |
|---|---|
| Position of a different setup near a level | The setup sets its order. Two setups can have a position at almost the same price. |
| Pending order of a different setup near a level | The setup sets its order. Example: setup 1 is active, the price left it, `clear_on_exit` is off, so its orders stay. If the ranges overlap, setup 2 sets an order at the same price and side. Both orders can fill. |
| Order or position of a deleted zone (magic without a zone) | It does not block a level. |

The second case is a result of the same decision ("other setups do not block"). The review found it. A pending order of a different setup that blocks a level, while its position does not, gives no consistent rule.

## Verification
| Check | Result |
|---|---|
| New position test before the fix | Failed: BUY orders `[96.7, 96.8, 96.9, 97.2, 97.3]`, 97.1 missing |
| New order test with the order filter removed | Failed: the same 97.1 missing |
| Worker tests after the fix (`scripts/features/run.sh unit`, `api`) | 571 and 267 passed |
| Existing scenarios and golden files after `make_scenarios` and `--update-golden` | No change; only the 2 new files |
| New golden file with the old Python code | Failed at event #12: the BUY STOP 97.0 of magic 200002 was missing |
| `npx tsc --noEmit`, `eslint src/lib/backtest/engine` | No errors |
| Playwright `backtest-grid-parity-lib.spec.ts` (BKT-02) | 43 passed |
| Review (`reviewer` subagent) | No critical finding. The missing order test and the order case in "Why" were added. |
| Live check on DEMO account A | Not verified. The worker runs only on the VPS. |

## Open points
- [ ] After the VPS pulls `main`, do the ZON-14 check again on DEMO account A with a second setup that has open positions near the grid.

## Lessons
When two setups share a symbol, check each set of orders and positions that the engine reads for a setup. A set without a magic filter gives effects between setups. Look for these sets also in the backtest engine.
