---
date: 2026-10-06
type: plan
status: open
pr: [116, 118]
features: [ZON-19, ENG-27, ENG-28, ANA-07, ANA-12]
areas: [worker, frontend, tests]
---

# Zone becomes symbol with setups

## Request
A zone means one symbol. The UI says "Symbol" instead of "Zone" ("Add symbol"). After the symbol choice, the first setup comes automatically. "Add setup" replaces "Add zone" and does not ask for the symbol. All zone settings move into the setup. The setup is compact (short inputs, each switch next to its input). Each setup is on its own card with a shadow. "Zone logs" becomes "Symbol logs". A statistic compares the setups.

The user selected a real data model change (symbol → setups), not only a grouping in the UI.

## Plan (approved 2026-10-06)

| Part | Content | Status |
|---|---|---|
| A | Worker: storage format `SYMBOLS`, read adapter, migration with backup (ZON-19) | done (PR #116) |
| B1 | Data path: GET without `ZONES`, each setup has its engine index, the UI reads and sends `SYMBOLS`, e2e mock on `SYMBOLS` (ZON-19) | done (PR #118) |
| B2 | UI symbol card with setup cards, "Add symbol" / "Add setup", i18n and hints (Zone → Symbol/Setup, zone logs → symbol logs) | open |
| C | Compact setup layout (short inputs, switch next to input, 375 px check, UI-08) | open |
| D | Statistics for each setup (by magic), compare the setups of one symbol (ANA-12) | open |

The plan parts are named A to D. They are not feature IDs: the category `SYM` already exists for the symbol list (SYM-01 to SYM-04). Part A has the ID ZON-19.

On 2026-10-07 part B was divided: B1 is the data path (the user asked for it first), B2 is the new UI.

## Solution (part A)

The settings file keeps the zones grouped by symbol:

```json
"SYMBOLS": [{"symbol": "XAUUSD", "setups": [{"id": "…", "magic": 200001, "…": "…"}]}]
```

A setup is a former zone without the `symbol` field. The `id`, the fixed magic (ENG-27) and the fractal setup numbers (`fractal_setups[].sid`, ENG-28) stay in the setup.

| File | Change |
|---|---|
| `worker_python/src/utils/symbol_setups.py` | New. `settings_zones()` gives the flat zone list (one zone for each setup, symbol by symbol). `to_flat()` / `to_grouped()` for the save path, `for_client()` for GET, `is_legacy()` |
| `worker_python/src/api/settings.py` | POST: checks `SYMBOLS` (422), gives magics and fractal numbers on the flat list as before, saves `SYMBOLS`. Before the first save of an old file (`ZONES`), copies it to `configs/backup/<name>.before-symbols.json`. If the zone order changes and the bot is stopped, moves the ui_state file to the new order. GET returns `SYMBOLS` and `ZONES` |
| `worker_python/src/api/models.py` | `SymbolSettings` (structure only: `symbol`, `setups` list) |
| `worker_python/src/core/wrappers.py`, `src/api/ws_server.py`, `src/api/market.py`, `src/utils/state_manager.py` | Read zones through `settings_zones()` |
| `.gitignore` | `worker_python/configs/backup/` |

The engine (`grid_orchestrator`, `zone_index_by_magic`, `grid_zone_state`) did not change. The zone registry (`market_db.record_zones`) gets the flat list, so it keeps one row for each setup with its symbol. The schema did not change.

## Solution (part B1)

GET returns only `SYMBOLS`. Each setup has the field `index`: its position in the engine order. The UI store keeps the flat list `ZONES` in this order.

| File | Change |
|---|---|
| `worker_python/src/utils/symbol_setups.py` | `for_client()`: no `ZONES`, `index` on each setup. `flatten_symbols()` removes `index`, so a client can send back the `SYMBOLS` from GET |
| `frontend_nextjs/src/lib/symbolSetups.ts` | New. `settingsFromWorker()`: `SYMBOLS` → flat `ZONES`, sorted by `index`, without `index`. `settingsToWorker()`: `ZONES` → `SYMBOLS`, grouped like `group_zones()` |
| `frontend_nextjs/src/hooks/useAccountSettings.ts`, `src/services/zoneApi.ts`, `src/store/useSettingsStore.ts` | GET through `settingsFromWorker()`, POST through `settingsToWorker()`. `saveZone()` and `toggleZoneActive()` use `zoneApi.saveSettings()` |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts`, `data.ts` | The mock saves and returns `SYMBOLS` like the worker. New `setZones()`. `zonesOf()` gives the flat list. Each save with `ZONES` goes to `zonesPayloads`; the test fixture fails if the list is not empty |
| `frontend_nextjs/e2e/mocked/*.spec.ts` | Test data through `worker.setZones()` (format `SYMBOLS`). New `symbol-setups.spec.ts` (ZON-19) with an old file that has mixed symbols |
| `frontend_nextjs/e2e/live/live.ts` | `settings()` makes flat `ZONES` from `SYMBOLS`, so the live tests stay the same |

A file without zones now gives `ZONES: []` in the store, not a missing key. The UI code treats both the same.

## Why

- Flat list for the engine: the engine maps orders to zones by magic. A setup keeps the magic of its zone, so open orders and positions stay with their setup after the migration.
- Migration on save, not on read: the bot process and the API process both read the file. Only the API writes it, so there is no second writer. Reads (GET, bot) never write.
  - Changed: plan "migrate when the file is loaded" → "migrate on the first save". The result is the same file format.
- GET returns `SYMBOLS` and `ZONES`: the current UI reads and sends `ZONES`. The worker updates from `main` before part B is merged. `ZONES` has the engine order, because the UI sends the ui-state index in this order.
- One rule for requests and files: if `ZONES` is present, `ZONES` is used, else `SYMBOLS`. The current UI sends back the full object from GET, with an old `SYMBOLS` and a changed `ZONES`. An older worker version (after a rollback) writes only `ZONES` and leaves an old `SYMBOLS` in the file.
- The migration groups the zones by symbol. This can change the list order (for example XAU, EUR, XAU → XAU, XAU, EUR). The ui_state file keeps zone commands (PAUSE, AUTO_CLEAR) by list index.
  - A running bot moves its index state by magic on the next settings reload (`rekey_zone_state`, ENG-27).
  - A stopped bot does not know the old order at its first read. Thus the API moves the ui_state file when the order changes and the bot is not running. It holds `account_lock`, so `/start` cannot start the bot at the same time. Found in the review: without this, the wrong zone stays paused after the next bot start.
- The symbol value is not changed (case, spaces). Grouping uses the exact value.
- Rejected: a Pydantic model for all setup fields. Setup fields are free today and the engine fills defaults. A strict model can reject old fields.
- Part B1, `index` on each setup: the engine keeps zone states (ui-state commands, `zone_states`) by list position. The grouped list does not always have the engine order: an old file that is not saved yet can have mixed symbols (XAU, EUR, XAU). The UI sorts by `index`, so the list position in the store is the engine position again. Thus the zone cards and the zone actions did not change.
  - Rejected: the card reads `index` of its zone instead of the list position. More changes, and part B2 changes the cards again.
- Part B1, the UI sends only `SYMBOLS`. The worker still accepts `ZONES`, for browser tabs that were open before the update.

## Verification

- New tests: `worker_python/tests/api/test_symbol_setups_api.py` (15, api), `worker_python/tests/unit/test_eng_symbol_setups.py` (4, unit), tag ZON-19. All failed before the change. The stream test was checked against the old `ws_server.py`. The test "running bot: API does not move ui_state" was checked with the bot check removed.
- Two existing test files read the saved file directly. Their read path changed to `SYMBOLS` (5 lines). The expected values did not change:
  - `worker_python/tests/api/test_zone_magic_api.py`
  - `worker_python/tests/api/test_settings_state_api.py`
- `scripts/features/run.sh unit`: 391 passed. `scripts/features/run.sh api`: 191 passed. 0 features with errors. `update_checklist.py --check`: ok.
- `pyright` on the changed files: 0 errors.
- Review (subagent `reviewer`): no critical finding. Fixed: ui_state order for a stopped bot, `.gitignore` for the backup, one `ZONES` rule for files too, `SYMBOLS` check only when it is used, backup copy in a thread.
- Not verified: the migration on the VPS with a running bot. It is possible only after the VPS pulls `main` (manual check in ZON-19).
- Part B1 (2026-10-07):
  - Changed tests, red before the change: the GET tests in `test_symbol_setups_api.py` (`KeyError: 'index'`). The new test "index from GET is not saved" and the zone registry test were red while `flatten_symbols()` kept `index`.
  - Seven existing api tests read `ZONES` from GET.
    - Two GET tests in `test_symbol_setups_api.py` have new expected values from the plan: no `ZONES`, `index` on each setup.
    - Five read `SYMBOLS` or the saved file now, with the same expected zones: two more in `test_symbol_setups_api.py`, one each in `test_zone_magic_api.py`, `test_settings_state_api.py` and `test_market_db_api.py`.
  - New e2e tests in `symbol-setups.spec.ts` were red with the sort by `index` removed (wrong card order). The `zonesPayloads` check was red when `saveSettings()` sent the store object without conversion.
  - `scripts/features/run.sh unit`: 414 passed, 1 xfailed. `scripts/features/run.sh api`: 188 passed. `npm run lint`: ok. `npx tsc --noEmit`: ok. `npm run test:e2e`: 273 passed. `update_checklist.py --check`: ok.
  - Not verified: `e2e/live/*` (they need the VPS worker and run only on request, `hooks/RULES.md` §3).

## Open points
- [ ] Part A: open the PR. After the merge, do the manual check ZON-19 on the DEMO account.
- [x] Part B: the word "setup" is already in the UI for fractal setups (ZON-18, "Add setup" in a fractal zone, "Setup n" in the statistics tab). Decide the new name for one of the two before part B.
  - Done: the fractal setups were removed ([2026-10-06-remove-fractal-setups.md](2026-10-06-remove-fractal-setups.md), ENG-29). "Setup" now means only the setup of a symbol.
- [x] Part B: the new UI sends only `SYMBOLS`. If it sends `ZONES` too, `ZONES` is used. When part B is merged, remove `ZONES` from the GET response.
  - Done (2026-10-07, part B1): GET has no `ZONES`. The UI sends only `SYMBOLS`.
- [x] Part B: the e2e mock worker (`frontend_nextjs/e2e/fixtures/mock-worker.ts`) must return `SYMBOLS`.
  - Done (2026-10-07, part B1).
- [ ] Part B2: after a save that changes the order, the store keeps the old order until the next load. Then `zone_states` can show on the wrong card. Examples: the first save of an old file with mixed symbols; a new setup with the symbol of an earlier group. Also, `toggleZoneActive()` takes the ui-state index before this save. Found 2026-10-07, present since part A. Part B2 shows the setups grouped by symbol, so the store order is the engine order.
- [ ] `frontend_nextjs/e2e/live/trading.spec.ts` adds a test zone at the end and uses `zones.length` as its ui-state index. If the DEMO account has a zone with the same symbol before other symbols, the save groups the test zone into the middle. Read the settings again after the save and find the index by the test zone id. Found in the review 2026-10-07, present since part A, live test only.
- [ ] Parts B2, C and D.

## Risks
- Part B1 update: a browser tab with the UI from before part B1 gets no `ZONES` from GET. It shows no zones. If you add a zone in that tab and save, the save replaces all zones (`ZONES` is used). After the merge, reload all open tabs and pull the local checkout before the worker updates.
- Part B1 update, other direction: until the worker updates (`AUTO_UPDATE_MINUTES`), the new UI gets setups without `index`. Then it shows the grouped order. This is wrong only for an old file with mixed symbols that was not saved since part A.
- Rollback: a worker version before ZON-19 reads only `ZONES`. In a migrated file it finds no zones and deletes the pending robot orders as zombies (positions stay). Before a rollback of part A, stop the bots, or put back the backup from `configs/backup/` (it does not have the changes made after the migration).
- Zones without `id` (very old files) are matched by list index when magics are given (`zone_magic._zone_key`). If a browser tab that was open before the migration saves the old order, two such zones can swap their magics. The UI always sets an `id`, so only hand-made files are affected. Not checked on the VPS.

## Lessons
- Tests that read the saved settings file directly break on a format change. Read through the API (GET) where possible.
