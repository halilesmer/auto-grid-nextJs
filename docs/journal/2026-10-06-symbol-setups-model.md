---
date: 2026-10-06
type: plan
status: open
pr: [116, 118, 119]
features: [ZON-19, ZON-20, LOG-07, ENG-27, ENG-28, ANA-07, ANA-12]
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
| B2a | Frontend: symbol card with setup cards, "Add symbol" / "Add setup", delete of the last setup, engine position by zone id, i18n and hints (ZON-20) | done (PR #119) |
| B2b | Symbol logs: "Symbol logs" shows the lines of all setups; worker `GET /logs/{id}?zone_id=` takes more than one id (LOG-07) | done (PR #TBD) |
| C | Compact setup layout (short inputs, switch next to input, 375 px check, UI-08) | open |
| D | Statistics for each setup (by magic), compare the setups of one symbol (ANA-12) | open |

The plan parts are named A to D. They are not feature IDs: the category `SYM` already exists for the symbol list (SYM-01 to SYM-04). Part A has the ID ZON-19.

On 2026-10-07 part B was divided: B1 is the data path (the user asked for it first), B2 is the new UI. Later on 2026-10-07 part B2 was divided: B2a is the UI without the logs, B2b is the symbol logs.

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

## Solution (part B2a)

The dashboard shows one card for each symbol. The setups of the symbol are cards in it.

| Item | Behavior |
|---|---|
| Symbol card (`SymbolCard`) | Head: symbol field, number of setups, price, market open or closed, "Add setup". The symbol field changes the symbol of all setups of the symbol. It changes the setups only when you select a symbol from the list or leave the field after an edit. The field starts again when the stored symbol changes (for example "Discard"). |
| Setup card (`ZoneCard`) | The head shows "Setup n" (position in the symbol card). The symbol field, the price and the market badge moved to the symbol card. testid `zone-card` did not change. |
| "Add symbol" (`AddSymbolDialog`) | Replaces "Add zone". You select the symbol. The first setup has the smallest lot of the symbol. If the symbol has a card, the setup goes into this card. |
| "Add setup" | Does not ask for the symbol. Inserts the setup after the last setup of its symbol (`insertSetup()`). |
| Delete | A setup that is not the last one of its symbol: the dialog "Delete setup". The last setup: the dialog "Delete symbol", and the symbol card goes. The last setup of the last symbol gives an empty list. Before, the frontend added an empty zone. |
| Engine position | The store keeps `engineOrder`: the zone ids in the engine order of the last load or save. `zone_states`, `zone_market_*` and the ui-state commands use the position of the zone id in `engineOrder`. |
| After a save | `applySavedOrder()` sets `engineOrder` from the sent zones, grouped like the worker (`engineOrderAfterSave()`). |
| Start/Pause (`toggleZoneActive()`) | Sends the ui-state command first, to the current position (GET order). Then it saves `is_active`. If the save fails, it sends the old state again. |
| Texts | Zone → symbol or setup in tr, en and de: panel, delete dialogs, setup head, alerts, hints. New hints for all new buttons and fields. |

| File | Change |
|---|---|
| `frontend_nextjs/src/components/zone/SymbolCard.tsx`, `AddSymbolDialog.tsx` | New |
| `frontend_nextjs/src/components/ZoneSettingsPanel.tsx` | Groups the zones with `groupBySymbol()`, gives each setup card its engine position |
| `frontend_nextjs/src/components/zone/ZoneCard.tsx`, `ZoneHeader.tsx`, `ZoneBasicFields.tsx`, `types.ts` | "Setup n", symbol field, price and market badge moved out |
| `frontend_nextjs/src/components/zone/ZoneBreakoutFields.tsx` | The pullback rows wrap. At 375 px, the row was 36 px wider than its box in the setup card. |
| `frontend_nextjs/src/components/SymbolAutoComplete.tsx` | New prop `onCommit` (list selection, leaving the field) |
| `frontend_nextjs/src/lib/symbolSetups.ts` | `groupBySymbol()`, `engineOrderAfterSave()`, `insertSetup()` |
| `frontend_nextjs/src/store/useSettingsStore.ts`, `src/services/zoneApi.ts` | `engineOrder`, `applySavedOrder()`; the toggle command before the save |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | Moves the ui_state commands to the new order on a save when the bot is stopped, like `settings._remap_ui_state_of_stopped_bot` |
| `frontend_nextjs/src/hooks/useZoneActions.ts` | `addSetup()`, `renameSymbol()`; delete without a replacement zone |
| `frontend_nextjs/src/app/hooks/useDashboard.ts` | `markZoneSaved()` inserts a new setup at the same position as the store. Else the order alone counted as an unsaved change. |
| `frontend_nextjs/src/components/chart/ZoneChartPanel.tsx` | Market hours by engine position |
| `frontend_nextjs/src/i18n/messages/zone.ts`, `hints.ts` | Texts |

## Solution (part B2b)

The symbol card shows the logs of all its setups. The robot log tab shows the symbol and the setup number.

| Item | Behavior |
|---|---|
| Worker filter | `GET /api/logs/{id}` takes `zone_id` more than one time (`?zone_id=a&zone_id=b`). The answer has the lines of all given setups in the file order. `lines` applies to this common list. One `zone_id` (UI before part B2b) gives the same answer as before. An empty `zone_id=` gives no lines (before: the full log). No client sends it. |
| "Symbol logs" (`SymbolLogs`) | Replaces "Zone logs" in the setup card. It is below the setup cards in the symbol card. It asks for the ids of all setups of the symbol in one request: one poll for each symbol, not for each setup. |
| Setup number | If the symbol has more than one setup, each line starts with "Setup n". n is the position in the symbol card, the same as in the card title. |
| Robot log tab (`LogViewer`) | The badge before a tagged line shows the symbol and the setup number, for example "USOUSD · Setup 2". Before, it showed "Zone n", the position in the flat list. A line of a setup that is not in the settings shows "Setup ?". |
| Texts | "Zone logs" → "Symbol logs" in tr, en and de: button, hint, empty text, badge. The i18n keys and the testids did not change (`zone.logs.*`, `logs.zoneBadge`, `zone-log-output`, `log-zone-badge`). |

| File | Change |
|---|---|
| `worker_python/src/api/logs.py` | `zone_id` is a list. A line passes if it has one of the tags. |
| `frontend_nextjs/src/components/zone/SymbolLogs.tsx` | Former `ZoneLogs.tsx`, renamed in a separate commit. Takes `setupIds`, shows the setup badge. |
| `frontend_nextjs/src/components/zone/SymbolCard.tsx`, `ZoneCard.tsx`, `src/components/ZoneSettingsPanel.tsx` | The logs moved from the setup card to the symbol card. `SymbolCard` takes `setupIds` instead of `setupCount`. |
| `frontend_nextjs/src/services/zoneApi.ts` | `getZoneLogs()` → `getSymbolLogs()`: sends the ids as `URLSearchParams` |
| `frontend_nextjs/src/components/LogViewer.tsx` | Badge from `groupBySymbol()` |
| `frontend_nextjs/src/i18n/messages/zone.ts`, `logs.ts`, `hints.ts` | Texts |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | `searchParams.getAll('zone_id')`, like the worker |

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
- Part B2a, engine position by zone id: the approved plan said "store order = engine order". An unsaved setup in the middle of the list moves the store position of all later setups. Then a state such as "Automatically cleared" shows on the wrong card until the save. The id in `engineOrder` does not move. Thus the frontend does not load the settings again after a save that changes the order. It sets `engineOrder` from the sent zones.
  - Changed: plan "load the settings again after a save that changes the order" → "set `engineOrder` from the sent zones". The result is the same, and unsaved changes in other setups stay.
  - The store still inserts a new setup after the last setup of its symbol, as the plan says. The saved reference (`markZoneSaved()`) does the same.
- Part B2a, Start/Pause sends the command before the save, to the current position. The ui_state file has the order of the last save until the next save. With a stopped bot, the API moves the file during the save. A running bot moves the file at its next settings read, and it reads every key as an old position. Thus a command to the new position after the save goes to a different zone when the running bot moves the file. A command before the save is in the file order in both cases. Found in the review of part B2a.
  - Changed: plan "`toggleZoneActive()` takes the ui-state index after this save" → "sends the command before the save, to the current position". The plan was correct only for a stopped bot.
- Part B2a, the symbol field changes the setups only on selection or when you leave the field: with a change on each key, "XAUUSDm" passes through "XAUUSD". At that moment the card joins an existing XAUUSD card, and the field loses the focus.
- Part B2a, the panel badge counts symbols. Each symbol card shows the number of its setups.
- Part B2b, a repeated query parameter for `zone_id`: FastAPI reads a repeated parameter into a list. An old client sends one `zone_id`, which becomes a list with one item. A zone id is free text, and hand-made files are possible. A comma in an id breaks a comma list.
  - Rejected: a comma list (`?zone_id=a,b`). The URL is shorter, but it needs a split rule, and an old id with a comma gets a different meaning.
  - axios writes an array parameter as `zone_id[]=a`. Thus `getSymbolLogs()` sends `URLSearchParams` (checked with axios 1.19.0).
- Part B2b, the setup badge in the symbol logs: before, each card showed only the lines of its zone. When all setups are in one log, the badge shows which setup wrote the line. With one setup, the badge gives no information. Thus it is not shown.
- Part B2b, the request starts again only when the ids change: the panel gives a new id array on each render (live data, each key in a field). The worker reads the full log file for each filtered request. Without this check, each key in a setup field sent a new request while the logs were open. The component compares the ids as JSON text.
  - Cost: when the ids change while the logs are open (add or delete a setup), the answer of the old request can come after the new one. Then the old lines show until the next poll (10 s). A line of a deleted setup shows "Setup ?". Found in the review of part B2b.

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
- Part B2a (2026-10-07):
  - New e2e tests (`symbol-cards.spec.ts`, tag ZON-20; one each in `tooltips.spec.ts` UI-07, `mobile-layout.spec.ts` UI-08 in tr, en and de, `zones.spec.ts` ZON-08). Red checks with the change undone:

    | Undone part | Red test |
    |---|---|
    | Engine position by store index | "Add setup … does not move an engine state" |
    | `applySavedOrder()` | the same test, after the save |
    | Toggle: save first, new position | "Old file, bot running" |
    | Toggle: save first, old position (before part B2a) | "Old file, bot stopped" |
    | Symbol field: change on each key | "Symbol in the head …" (cards join while typing) |
    | `SymbolField` without `key` / commit without the case check | "Discard resets the symbol field …" |
    | `markZoneSaved()` appends | "Save a new setup alone …" |
    | Toggle without the revert | "Start/Pause: if the save fails …" (ZON-08) |
    | Pullback rows without `flex-wrap` | UI-08 symbol cards (tr, en, de) |

  - Existing tests with a changed path or wait. The expected values did not change, except where the plan gives a new text:

    | Test | Change | Reason |
    |---|---|---|
    | `zones.spec.ts` ZON-01 (2 tests), ZON-08, ZON-09, ZON-11 | "Add zone" → "Add setup" in the symbol card; `zone-count` → number of `zone-card` | The panel button adds a symbol now; the panel badge counts symbols |
    | `zones.spec.ts` ZON-02 | Expected dialog text `zone.delete.last.message` | The deleted zone is the last setup of its symbol (new text from the plan) |
    | `zones.spec.ts` ZON-03, ZON-04, ZON-08; `settings.spec.ts` SYM-02, SYM-03, SYM-04; `accounts.spec.ts` ACC-06 | Symbol field and its messages through `symbolInput()` / `symbolOf()` | The symbol field moved to the symbol card head |
    | `zones.spec.ts` ZON-08 "Start/Pause … bot running" | Waits for the save with `expect.poll` | The command goes before the save now |
    | `symbol-setups.spec.ts` ZON-19 (2 tests) | Card positions in the grouped order (zone B is the third card) | The cards are grouped by symbol; the engine state mapping and the sent `SYMBOLS` did not change |
    | `mobile-layout.spec.ts` UI-08 | Also checks "Add setup" | New button |
    | `e2e/live/readonly.spec.ts` | Count of `zone-card`; compares in the grouped order | Same reasons; live only, not run |
    | `e2e/fixtures/dashboard.ts` | Waits for the panel heading by role | The title "Semboller" is also in the MT5 symbol error text (strict mode) |

  - Review (subagent `reviewer`): no critical finding. Fixed: a discarded symbol rename came back on the next blur; focus and blur changed the case of a stored symbol; the toggle position with a running bot (see "Why"); the live test order.
  - `npm run lint`: ok. `npx tsc --noEmit`: ok. `scripts/features/run.sh`: unit 414 passed, 1 xfailed; api 188 passed; e2e 288 passed; `FEATURES.md` 128/154. `update_checklist.py --check`: ok.
  - Screenshots (temporary Playwright spec, deleted): desktop light and dark, 375 px in German with the "Add symbol" dialog.
  - Not verified: the live tests and a DEMO check of ZON-20 (open point).
- Part B2b (2026-10-07):
  - New tests, red before the change:

    | Test | Red with |
    |---|---|
    | api `test_symbol_filtresi_birden_fazla_setup_satirlarini_dosya_sirasiyla_verir` (LOG-07) | the old filter: only the last `zone_id` was used |
    | e2e `logs-ui.spec.ts` "Symbol-Logs: ein Symbol mit zwei Setups …" (LOG-07) | the UI before the change: the toggle was in each setup card |
    | e2e `logs-ui.spec.ts` "Symbol-Logs zeigen nur das eigene Symbol", check "no extra request after an input" | the fetch with the id array directly (3 requests, expected 2) |

  - Changed existing test: `logs-ui.spec.ts` LOG-07 "Zonen-Logs zeigen nur die eigene Zone" → "Symbol-Logs zeigen nur das eigene Symbol". The toggle is in the symbol card, and the badge has the new text from the plan. The expected log lines did not change.
  - `scripts/features/run.sh`: unit 414 passed, 1 xfailed; api 189 passed; e2e 289 passed; `FEATURES.md` 128/154. `scripts/features/run.sh LOG-07` after the review: unit 2, api 2, e2e 2 passed. `npm run lint`: ok. `npx tsc --noEmit`: ok. pyright on `logs.py`: 0 errors. `update_checklist.py --check`: ok.
  - Screenshots (temporary Playwright spec, deleted): symbol logs on desktop in dark and light, the robot log tab, 375 px without a horizontal scroll.
  - Review (subagent `reviewer`): no critical finding. Fixed: the request count is also checked before "Refresh". Accepted and written above: an old answer after an id change; an empty `zone_id`.
  - Not verified: the DEMO check of LOG-07 (after the merge, open point).

## Open points
- [x] Part A: open the PR. After the merge, do the manual check ZON-19 on the DEMO account.
  - Done (2026-10-07, manual check by the user, signed as passed):
    - Start: DEMO account A, one zone on each of two symbols, bot running, file still in the old `ZONES` format.
    - Step: changed the check interval in the dashboard and saved at 14:13.
    - The file has `SYMBOLS` with both symbols, the same ids and magics, and setups without `symbol`.
    - The backup `configs/backup/<name>.before-symbols.json` is the old file.
    - 5 pending orders and 71 positions kept the same tickets (three comparisons until 14:16).
    - The bot wrote no log line after the save.
    - The dashboard showed both zones in the same order. The interval was saved back to the old value.
    - Not verified live: two setups on one symbol, and the regrouping of an old file with mixed symbols. No account has such a file any more. The api and e2e tests cover both.
- [x] Part B: the word "setup" is already in the UI for fractal setups (ZON-18, "Add setup" in a fractal zone, "Setup n" in the statistics tab). Decide the new name for one of the two before part B.
  - Done: the fractal setups were removed ([2026-10-06-remove-fractal-setups.md](2026-10-06-remove-fractal-setups.md), ENG-29). "Setup" now means only the setup of a symbol.
- [x] Part B: the new UI sends only `SYMBOLS`. If it sends `ZONES` too, `ZONES` is used. When part B is merged, remove `ZONES` from the GET response.
  - Done (2026-10-07, part B1): GET has no `ZONES`. The UI sends only `SYMBOLS`.
- [x] Part B: the e2e mock worker (`frontend_nextjs/e2e/fixtures/mock-worker.ts`) must return `SYMBOLS`.
  - Done (2026-10-07, part B1).
- [x] Part B2: after a save that changes the order, the store keeps the old order until the next load. Then `zone_states` can show on the wrong card. Examples: the first save of an old file with mixed symbols; a new setup with the symbol of an earlier group. Also, `toggleZoneActive()` takes the ui-state index before this save. Found 2026-10-07, present since part A. Part B2 shows the setups grouped by symbol, so the store order is the engine order.
  - Done (2026-10-07, part B2a): the cards use the engine position of the zone id (`engineOrder`). Each save sets `engineOrder` from the sent zones. `toggleZoneActive()` sends its command before the save, to the current position. See "Why".
- [ ] `frontend_nextjs/e2e/live/trading.spec.ts` adds a test zone at the end and uses `zones.length` as its ui-state index. If the DEMO account has a zone with the same symbol before other symbols, the save groups the test zone into the middle. Read the settings again after the save and find the index by the test zone id. Found in the review 2026-10-07, present since part A, live test only.
- [ ] Parts C and D.
- [ ] Texts that still say "zone" or "Bölge" after part B2b: the field hints (for example min and max price) and the Analyse page (part D). The log texts of the UI are done (part B2b).
- [ ] The worker log messages say "Bölge n" (19 places in `worker_python/src/core`). n is the engine position + 1, not the setup number of the card. Worker messages are not translated, and the change is in engine code (golden test BKT-01). Found 2026-10-07 in part B2b.
- [ ] `GET /api/logs/{id}` reads the log files directly in the `async def` (a blocking call, `hooks/RULES.md` §9.1). With a zone filter, it reads the full file. Present before part B2b. Part B2b sends fewer requests (one for each symbol). Found 2026-10-07.
- [ ] ZON-20: manual check on the DEMO account (`pruefung` in `features.yaml`).
- [ ] LOG-07: manual check on the DEMO account after the merge of part B2b.

## Risks
- A running bot moves the ui_state file only at its next settings read (one loop, `LOOP_INTERVAL_SECONDS`). A zone command in this time can go to a different zone: Start/Pause or Restart right after a save that changed the order (delete, a new setup of an earlier symbol, the first save of an old file). Present since part A. A fix needs commands by magic in the worker.
- Part B1 update: a browser tab with the UI from before part B1 gets no `ZONES` from GET. It shows no zones. If you add a zone in that tab and save, the save replaces all zones (`ZONES` is used). After the merge, reload all open tabs and pull the local checkout before the worker updates.
- Part B1 update, other direction: until the worker updates (`AUTO_UPDATE_MINUTES`), the new UI gets setups without `index`. Then it shows the grouped order. This is wrong only for an old file with mixed symbols that was not saved since part A.
- Rollback: a worker version before ZON-19 reads only `ZONES`. In a migrated file it finds no zones and deletes the pending robot orders as zombies (positions stay). Before a rollback of part A, stop the bots, or put back the backup from `configs/backup/` (it does not have the changes made after the migration).
- Zones without `id` (very old files) are matched by list index when magics are given (`zone_magic._zone_key`). If a browser tab that was open before the migration saves the old order, two such zones can swap their magics. The UI always sets an `id`, so only hand-made files are affected. Not checked on the VPS.

## Lessons
- Tests that read the saved settings file directly break on a format change. Read through the API (GET) where possible.
