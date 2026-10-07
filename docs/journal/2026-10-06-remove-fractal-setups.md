---
date: 2026-10-06
type: decision
status: open
pr: []
features: [ENG-29, ENG-21, ZON-15, ZON-16, ENG-26, ANA-09, ANA-12, ZON-19]
areas: [worker, frontend, tests, docs]
---

# Remove the additional fractal setups

## Request
The user does not need the additional fractal setups of a zone (ZON-18, ENG-28: "Add setup" in a fractal zone, "Setup n" in the statistics tab). Remove them completely. Keep the fractal entry mode (ZON-15, ZON-16, ENG-26). Before the bot deletes old orders of these setups, a window must ask the user.

The removal also frees the word "setup" for the setups of a symbol (ZON-19, [2026-10-06-symbol-setups-model.md](2026-10-06-symbol-setups-model.md)).

## Solution

A fractal zone has one fractal configuration again (the zone fields). New fractal orders have the comment `AutoGrid_Z{n}_F{U|D}{bar time}`.

Old data on the VPS:

| Data | Behavior |
|---|---|
| `fractal_setups`, `fractal_setup_seq`, `fractal_kept_sids` in a settings file | The bot ignores them. The worker removes them on the next save. |
| Pending order of an old setup (zone magic, comment `AutoGrid_Z{n}_F{k}{U|D}{time}`, k ≥ 2) | The bot does not manage it and does not delete it by itself. It sends the order in the live data (`legacy_setup_orders`). The dashboard asks once for each account. |
| Open position of an old setup | The bot does not touch it. It counts for the position limit of the zone. |
| Deal of an old setup in the trade archive | It counts for its zone (magic). It is not a fractal trade of the chart, because its timeframe is not known. |

The decision is in the settings: `LEGACY_SETUP_ORDERS`.

| Value | Bot |
|---|---|
| none | Leaves the orders. The window asks again after a page reload. |
| `keep` | Leaves the orders. The window does not open again. |
| `delete` | Cancels the orders in each round and writes `🧹 Eski fraktal kurgusu emri siliniyor (kullanıcı onayı): …` to the log. |

Another value gives 422. These actions still delete all robot orders of a zone, also old setup orders: deactivate the zone, delete the zone, zone exit with clear, bot stop.

| File | Change |
|---|---|
| `worker_python/src/core/legacy_setup_orders.py` | New. Finds old setup orders, reads the decision, cancels on `delete`. |
| `worker_python/src/core/grid_orchestrator.py` | Cancels old setup orders after the zombie clean-up (only on `delete`). Removes them from the order list that goes to the zone handler. |
| `worker_python/src/core/grid_metrics.py` | Live data `legacy_setup_orders`. |
| `worker_python/src/core/wrappers.py`, `state.py` | Read `LEGACY_SETUP_ORDERS` on each settings reload. Removed `fractal_position_setup`. |
| `worker_python/src/core/grid_execution/fractal_entry.py`, `config.py` | One configuration per zone. Removed `FractalSetup`, the setup loop, the setup number in log keys and in the "done" key. The position limit stays in `fractal_entry.py`. |
| `worker_python/src/core/grid_orders.py` | `fractal_comment()` has no setup number. `parse_fractal_comment()` still reads old comments. |
| `worker_python/src/utils/zone_magic.py` | Removed `assign_fractal_setup_ids`. |
| `worker_python/src/api/settings.py` | Removes the old fields on save. Checks `LEGACY_SETUP_ORDERS`. |
| `frontend_nextjs/src/components/LegacySetupOrdersDialog.tsx` | New. The window (account, count, symbols; "Delete orders" / "Keep orders"). Shown in `ZoneSettingsPanel.tsx`. |
| `frontend_nextjs/src/components/zone/ZoneFractalFields.tsx` | The order fields are in this file again. Removed `ZoneFractalSetupFields.tsx`. |
| `frontend_nextjs/src/components/analysis/*`, `src/lib/analysis/groupings.ts`, `tradePairing.ts` | Removed the setup scope, the "by setup" breakdown, the setup column and `useSetupLabel.ts`. |
| `frontend_nextjs/src/store/*`, `src/hooks/useZoneActions.ts`, `src/utils/zoneHelpers.ts` | Removed the setup types and the read-back of setup numbers after save. |
| `frontend_nextjs/src/i18n/messages/*` | Removed the setup keys. New keys `zone.legacyOrders.*`. Texts that named setups (max. positions hint, statistics hints) changed. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | Mirrors the save path (old fields removed, 422 check). |
| `docs/features/features.yaml` | Removed ZON-18 and ENG-28. New ENG-29. ANA-09, ANA-12, ENG-21, ZON-19, BKT-01, BKT-03 and a planned preset feature do not name setups or `sid` any more. |

## Why

- Ask before delete: the user can have pending orders of old setups on the VPS. The live test of ZON-18 on DEMO account A kept the orders of one removed setup (`fractal_kept_sids`). Without the old setup code, the bot would treat these orders as orders of setup 1 and cancel or move them. The user wants to decide this.
- Rejected: a cancel on the first round after the update. It deletes orders without a question.
- Rejected: one decision for each zone. These orders occur once, at the update. One decision for each account is simpler.
- Rejected: an API endpoint that cancels the orders. The API process does not trade (process model in `CLAUDE.md`). The decision goes through the settings file, as `fractal_kept_sids` did before.
- The parser in the trade archive does not accept comments with a setup number any more. The chart marks a fractal as traded only on the zone timeframe, and an old setup had its own timeframe.

## Verification

- `scripts/features/run.sh unit` and `api` (pytest `tests/unit tests/api`): 601 passed, 1 xfailed.
- New worker tests (ENG-29), each seen red with the code part removed:
  - `test_eng_fractal_entry.py`: no decision, `keep`, `delete`, comment without number, position of an old setup counts for the zone.
  - `test_metrics_logs_safety.py`: `legacy_setup_orders` in the metrics.
  - `tests/api/test_legacy_setup_orders_api.py`: old fields removed on save, decision saved, invalid decision 422.
- New e2e tests (ENG-29) `e2e/mocked/legacy-setup-orders.spec.ts`: 4. Three of them failed with the window switched off.
- Golden files (BKT-01): unchanged for the 28 scenarios that stay. Thus the single-setup engine behavior did not change.
- `pyright` on the changed worker files: 0 errors. `npm run lint`, `npx tsc --noEmit`: no errors.
- Full run `scripts/features/run.sh`: unit 414 passed (1 xfailed), api 187 passed, e2e 271 passed. `update_checklist.py --check`: ok (153 features).
- Screenshot of the window (temporary Playwright spec, mocked worker): desktop and 375 px, no horizontal scroll.
- Not verified: the window and the cancel on the VPS with real old orders. The worker runs only on the VPS (manual check ENG-29).

Tests that were removed, because they test the removed function:

| File | Tests |
|---|---|
| `worker_python/tests/unit/test_eng_fractal_entry.py` | 12 tests with tag ENG-28 (setup orders, limit for each setup, position by opening order, deleted setup, done key for each setup, setup values, comment with number, invalid setup, SAR for each setup, kept orders) |
| `worker_python/tests/api/test_fractal_setups_api.py` | The file (6 tests, ENG-28). Renamed to `test_legacy_setup_orders_api.py` with the new tests. |
| `worker_python/tests/api/test_symbol_setups_api.py` | `test_fraktal_kurgunummern_bleiben_bei_der_umstellung` (ZON-19, setup numbers through the migration) |
| `worker_python/tests/parity/` | Scenario and golden file `fractal_two_setups` |
| `frontend_nextjs/e2e/mocked/zones.spec.ts` | "Fraktal: mehrere Setups mit Plus-Button" (ZON-18) |
| `frontend_nextjs/e2e/mocked/analysis-trades-lib.spec.ts` | Parser test with setup number (ENG-28), replaced by an ENG-29 test |

Tests that changed, because the removed function was a part of them:

| File | Change |
|---|---|
| `test_eng_fractal_entry.py` | `test_position_eines_entfernten_setups_zaehlt_fuer_setup_1` → `…_fuer_die_zone`, tag ENG-28 → ENG-29. Same input and expectation. |
| `test_eng_fractal_entry.py` | `test_hinweis_merker_nur_fuer_fraktale_im_fenster` (ENG-26): log key `(0, "U", t)` again, the form before PR #100. |
| `e2e/mocked/analysis-stats-lib.spec.ts` (ANA-09) | Removed the setup breakdown and the setup scope. The zone part stays. "Zone unknown" is checked with the zone breakdown. |
| `e2e/mocked/analysis-stats.spec.ts` (ANA-09, ANA-12) | A zone opens "by weekday" (1 row, was 3 rows by setup). Removed the setup scope and the setup column. |

## Open points
- [ ] Manual check ENG-29 on the VPS: pull, restart the worker, open the dashboard of DEMO account A.
- [ ] `docs/journal/2026-10-06-backtest-module-plan.md` names `sid` of fractal setups for presets. Remove it when that plan is next updated.

## Lessons
- A feature that writes its own data into MT5 (order comments, kept orders) needs an exit path when it is removed. Find the data in MT5 and in the settings before you delete the code.
- `toEqual` in a Playwright logic test is not typed. `tsc` did not find the removed `sid` field there; only the test run did.
