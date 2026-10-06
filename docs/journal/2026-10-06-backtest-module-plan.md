---
date: 2026-10-06
type: plan
status: open
pr: [110, 111, 114]
features: [BKT-01, BKT-02, BKT-03, BKT-04, BKT-05, BKT-06, BKT-07, BKT-08, BKT-09, BKT-10, BKT-11, BKT-12, BKT-13]
areas: [frontend, worker, docs]
---

# Backtest module: own page, zone link, presets

## Request

- 2026-10-06: the user wrote a concept for a backtest module and asked for a review and a full plan for the backtest only.
- The backtest gets its own page `/backtest`, not only a tab on `/chart`.
- The test button of a zone opens `/backtest` with the values of the zone, also unsaved values.
- On `/backtest`, the user can also set a zone freely, without the zone page.
- A tested setting can go back to the zone page.
- 2026-10-06 (approved): presets are stored in the worker for each user. More setups in one session are part of V1. The backtest tab on `/chart` is removed.

This entry continues steps 7–9 of `2026-10-02-analyse-statistics-tab-plan.md`. The calculation rules stay in `docs/analyse-regeln.md`.

## Status

| Step | Content | Features | State |
|---|---|---|---|
| B0 | This plan, catalog entries, architecture map | – | done (PR #110) |
| B1 | Cost values of the symbol in the worker, TS type, commission proposal | BKT-04 (part) | done (PR #111); the VPS check of "Max. bars" is open |
| B2 | Engine port, grid, and `simBroker` in parity mode | BKT-02 | done (PR #114) |
| B3 | Engine port, fractal (ATR, SAR, setups) | BKT-03 | open |
| B4 | Runner: path model, higher timeframes, costs, gap model, web worker | BKT-04, BKT-09 (TS) | open |
| B5 | Page `/backtest` with one run; test button of a zone opens it | BKT-06, BKT-07 (part), BKT-10, BKT-12 (zone → backtest) | open |
| B6 | Chart with equity area and replay | BKT-07 | open |
| B7 | More setups: badges, duplicate, compare table, equity overlay | BKT-08, BKT-13 | open |
| B8 | Presets (worker and UI) and "apply to zone" | BKT-11, BKT-12 | open |
| B9 | CSV import (worker process and dialog) | BKT-05 | open |

Order (changed 2026-10-06 after the B1 check): B0 → B1 → B2 → B3 → B9 → B4 → B5 → B6 → B7 → B8. MT5 on the VPS does not give 1 year of M1 (see "Result of the history check"). Thus, B9 (CSV import) comes before B4.

## Corrections to the first concept

| # | First concept | Problem | Plan |
|---|---|---|---|
| 1 | Spread cost = spread × tick value × volume | The fill at Ask = Bid + spread already contains the spread. The cost counts twice. | The spread is in the fill prices. Show "of which spread" as information only. |
| 2 | Swap 3× on Wednesday | The triple day depends on the symbol (`swap_rollover3days`). For indices it is often Friday. | Book the swap at each change of the broker day. Use `swap_mode` and the triple day of the symbol. |
| 3 | Profit factor "target > 1.5" | A rule of thumb without a source. `docs/analyse-regeln.md` removed it. | Show the value without a rating. |
| 4 | `Float32Array` for prices | Float32 has approx. 7 digits. BTC and indices round, and the parity with Python (`pyRound`) fails. | Use `Float64Array`. 1 year of M1 is approx. 12 MB. |
| 5 | 1 year of M1 from MT5 | MT5 gives only "Max. bars in chart" (default 100,000, approx. 70 trading days of M1). | Set "Max. bars" to "Unlimited" on the VPS, or use the CSV import. Missing ranges stay visible (`missing`). |
| 6 | One timeframe selector 1m … 1D | It mixes the data resolution and the timeframes of the strategy (fractal TF, exit TF). | Two fields. The runner builds the strategy timeframes from the data. |
| 7 | A gap fills at the next open | In parity mode, the Python FakeMT5 fills at the order price. | Two models: "parity" (as the golden files) and "gap fill" (default for real runs). |
| 8 | Result is the net profit only | Open losses at the end of the test are missing. | Always show realized profit, open P/L, end equity and open positions. Always show "margin and stop-out not checked". |

## Rules

1. Do not save a real zone from the backtest. `components/backtest/` and `lib/backtest/` do not import `mergeAndSaveSettings` and do not send `POST /settings`. A test checks this.
2. "Apply to zone" puts the values into the zone form, unsaved. Only a save by the user makes them active.
3. The TypeScript engine must give the same event sequence as the Python golden files (BKT-01).
4. Always show data gaps, model limits, "margin not checked" and "estimated costs". The user cannot hide these notes.
5. The browser calculates. The worker gives and stores only candles, symbol values and presets, no results.
6. A change of the account clears all results (`docs/analyse-regeln.md` 4.7). The setups (parameters) stay for the session.

## Solution (plan)

### Page `/backtest`

| Part | Content |
|---|---|
| Menu | New item "Backtest" in `AppNav.tsx`. The empty backtest tab on `/chart` goes away; ANA-01 changes in B5. |
| URL | `?account=&zone=&setup=` |
| Toolbar | Account, data source (MT5 server or CSV), license note, "create backtest", presets, CSV import |
| Setup badges | Symbol, data resolution, mode (grid/fractal), step, TP, spread, lot, period, state; edit, duplicate, apply to zone, remove |
| Notes | Data gaps, model, margin not checked (always visible) |
| Results | KPIs of the selected setup; compare table of all setups |
| Chart | Candles, zone band, levels, arrows, TP/SL, equity and balance area, replay 1x/5x/10x/max, display TF |
| Bottom | Run log, trade table |
| 375 px | The dialog is a full page. Badges wrap. KPIs show in 2 columns. |

### Dialog "create / edit backtest"

| Section | Fields |
|---|---|
| Base | Account and symbol; period with `DateRangePicker` (broker time; 30/90 days, 6 months, 1 year, free); data resolution M1 (default), M5, M15, H1; coverage from `/coverage` |
| Costs | Spread: "per candle from MT5" (default), "fixed" or "maximum of both"; commission per lot (round turn), proposal from `/history/deals`; swap on/off with the rates and the triple day of the symbol |
| Zone | `ZoneFieldsEditor`: the field components of `src/components/zone/`, without header and logs. `ZoneCard` and the backtest use it. Start value: "from zone X of account Y", "from preset" or "empty (defaults)". |
| Model | "gap fill" (default) or "parity"; "SL first"; "both candle paths" (two runs, shows the range); "close all at the end"; start capital (only for % and drawdown %) |

Notes in the dialog:

- From M5, a note shows that the resolution is less exact.
- A note "uncertain" shows when the grid step is smaller than the mean candle range of the resolution.

### More setups

- Each setup is an independent run with its own `runId`, web worker and progress.
- Max. 2 runs at the same time. Max. 6 setups on the page.
- The compare table uses `computeStats` for each setup.
- The equity curves of more setups can show on top of each other.
- "Aggregated" (sum) is available only with the same period and the same account currency. Else the option is off, with the reason.

### Zone → backtest (test button)

1. The test button in `ZoneHeader.tsx` (now a link to `/chart?zone=`) becomes a button.
2. The button puts `structuredClone(zone)`, the account, `zoneId` and the flag "unsaved changes" (from `modified`) into `useBacktestHandoffStore` (Zustand `persist`, sessionStorage).
3. Then it opens `/backtest?account=…&zone=…`.
4. The page opens the dialog with the zone, the symbol, "last 30 days", M1 and the commission proposal.
5. Without a handoff (reload, shared link), the page uses the saved zone (`useAccountSettings`).
6. The run log shows the source and "unsaved changes".

### Backtest → zone page ("apply to zone")

1. The button is on each setup badge and on each preset.
2. The dialog shows:
   - the target account (own accounts only);
   - the target: "replace zone X" (zones of the account with the same symbol) or "add as new zone".
3. Checks:
   - The symbol must exist on the target account. Else the action is locked, with the reason.
   - `normalizeZoneLots` adapts the lots to the symbol. A note shows the changes.
4. The values go into `useZoneTransferStore` (sessionStorage).

| Target | `id` | `magic` | `sid` of fractal setups | `is_active` |
|---|---|---|---|---|
| Replace zone X | kept | kept | kept | kept |
| New zone | new | none (the worker sets it) | none | `false` |

5. The page calls `selectAccount(target)` and opens `/`.
6. `ZoneSettingsPanel` applies the transfer once, when `loadedAccount` is the target. Then it clears the store.
7. The zone shows as changed (dirty tracking). A banner shows "applied from backtest, not saved". If the bot runs, a note shows "a save changes the running bot at once".
8. Nothing is saved automatically. If the user leaves without a save, the transfer is lost.

### Presets

| Item | Content |
|---|---|
| Content | Name, zone (without `id`, `magic`, `sid`, `is_active`), costs, model, data resolution, last period, symbol, app version. No results. |
| Storage | Table `backtest_presets` in `market.sqlite` with `owner` (principal from `src/api/auth.py`) |
| Routes | `GET/POST /api/backtest/presets`, `PUT/DELETE /api/backtest/presets/{pid}`; a preset of a different user gives 404, as `account_access` |
| UI | Menu "Presets": load as new setup, rename, delete, apply to zone |

### Data flow

```
worker (FastAPI)                              browser
 market.sqlite ── /rates (50k per page) ──▶  backtest.worker.ts (holds the prices, Float64Array)
 /symbols (+ cost fields)              ──▶   │ engine/ (port) · broker/simBroker · costs · pathModel
 /history/deals (commission proposal)        │ → display candles, trades, curves (min/max per pixel),
 /backtest/presets                           │   replay events, KPIs, run log
 /market/{id}/imports (CSV)                  ▼
                                            useBacktestStore (results per runId) → page
```

- The web worker loads the candles itself. It gets the base URL and the key for each run.
- The main thread gets only the summary. The chart asks the web worker for candles of one display TF and range (message `bars`), max. approx. 50,000.
- Messages: `run`, `progress`, `result`, `error`, `bars`. Abort with `terminate()`. The page ignores results with an old `runId`.
- Limits: 1 million candles per run, 100,000 events per candle. Above the limit, the run stops with a message.

### New files (frontend)

| Path | Content |
|---|---|
| `src/app/backtest/page.tsx` | The page |
| `src/lib/backtest/engine/` | One file for each Python module, with the source in the header: `pyRound`, `config`, `validation`, `placement`, `instantEntry`, `vanished`, `orderManager`, `zoneSelector`, `zoneState`, `orchestrator`, `fractalSignals`, `fractalEntry`, `indicators`. Use `lib/analysis/levels.ts` again. |
| `src/lib/backtest/broker/` | `simBroker.ts` (parity / gap), `costs.ts` (spread info, commission half and half, swap per broker day from `swap_mode` and `swap_rollover3days`, profit from `trade_tick_value_profit/loss`) |
| `src/lib/backtest/data/` | `loadRates.ts` (pages through `/rates` with `next_from`, collects `missing`), `bars.ts` (higher TFs without future data), `pathModel.ts` |
| `src/lib/backtest/` | `backtest.worker.ts`, `protocol.ts` (message types), `runContext.ts` (run log), `runSummary.ts` (end of test: open P/L, end equity, open positions) |
| `src/store/` | `useBacktestStore`, `useBacktestHandoffStore`, `useZoneTransferStore` |
| `src/components/backtest/` | `BacktestToolbar`, `SetupDialog`, `SetupBadges`, `CompareTable`, `RunSummary`, `BacktestChart` (on `analysis/chart/ChartCore.tsx` and `primitives.ts`), `ReplayControls`, `RunProtocol`, `TransferDialog`, `PresetMenu`, `CsvImportDialog` |
| `src/components/zone/ZoneFieldsEditor.tsx` | Moved out of `ZoneCard.tsx` |
| `src/i18n/messages/backtest.ts` | Texts (tr/en/de); hints in `hints.ts` |

### Modules that the backtest uses again

These modules came with PR #108 (ANA-09) and PR #109 (ANA-12). Do not make new copies.

| Module | Use in the backtest |
|---|---|
| `src/lib/analysis/tradePairing.ts` (`Trade`) | The simulator makes trades of the same type: `positionId`, `exitTicket`, `exitReason` (5 = TP, for `cycles`), `magic`, `zone`, `net` = profit + commission + swap |
| `src/lib/analysis/stats.ts` (`computeStats`) | KPIs of each setup |
| `src/lib/analysis/curves.ts` (`realizedCurve`, `drawdownCurve`, `CurvePoint`) | Curves. The simulator gives the equity curve in the `CurvePoint` format. The backtest does not use `balanceCurve`. |
| `src/lib/analysis/groupings.ts` (`breakdown`) | Split by setup, weekday and hour |
| `src/lib/analysis/excursions.ts` (`Excursion`) | The simulator calculates MFE/MAE exactly in the model and gives them in this format |
| `src/components/analysis/stats/` (`StatsKpis`, `CurveChart`, `BreakdownTable`) | KPIs, curves, split |
| `src/components/analysis/TradesTable.tsx` | Gets an optional prop with ready MFE/MAE values. With the prop, the table does not show the button "calculate MFE/MAE" and does not load M1 (`useExcursions`). |

### Worker changes

| File | Change |
|---|---|
| `src/utils/mt5_helpers.py` (`build_detailed_symbols`) | Also gives `trade_calc_mode`, `trade_tick_value_profit`, `trade_tick_value_loss`, `currency_profit`, `swap_mode`, `swap_long`, `swap_short`, `swap_rollover3days`, `spread`, `trade_stops_level`. The field list exists in `src/utils/mt5_market.py`. |
| `src/api/backtest.py` (new) | Preset routes |
| `src/utils/market_db.py` | Table `backtest_presets` |
| `src/api/market.py` | CSV import: `POST /market/{id}/imports`, `PUT …/chunk`, `POST …/commit`, `DELETE` (staging, checks, `source = csv:<import_id>`) |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | The same routes |

### Not simulated

The run log and the page show these limits:

- Margin and stop-out.
- Rejects, vanished orders (ENG-25), auto pause (ENG-11), partial fills.
- Remote commands, reconnect, more zones of one account at the same time. V1 tests one zone for each setup.
- The costs are estimates. Swap and foreign currency use the rates of today.

### Version 2 (not in this plan)

- Parameter search (grid over step and TP), control period 70/30, heat map.
- Portfolio of more zones of one account in one run.
- Bot safety switches (`grid_safety.py`) in the backtest.
- Tick-exact backtest for short periods.
- Export of the run log and the trades (CSV/PDF).

## Why

The user wants to test a zone before it trades, and to bring a good result back to the zone. A separate page gives space for more setups, the large dialog and the chart with replay. The Analyse page stays for real trades.

The browser calculates, because the worker must not load the VPS while bots trade. The VPS gives only candles from `market.sqlite`.

The backtest never saves a zone. A wrong save changes a running bot at once. Thus the only way back is the unsaved zone form, and the user saves it.

Presets are in the worker for each user, not in `localStorage`. Then they are available on each device, and users do not see the presets of other users. Rejected: presets only in the browser (lost on a different device).

The statistics modules of the Analyse page are used again. Then the KPIs of a backtest and of real trades use the same rules, and the user can compare them.

## Verification

Plan for each step:

| Tier | Checks |
|---|---|
| unit / api (pytest) | Cost fields of the symbol; presets with `owner`, 404 for a different user; CSV process (check, abort, replace). `scripts/features/run.sh unit BKT`, `api BKT` |
| logic (Playwright spec `e2e/mocked/*-lib.spec.ts`, no browser page; see "Result B2") | Parity of all scenarios in `worker_python/tests/parity/` and `pyround.json`; hand-calculated cases; future-data test |
| e2e (mock worker) | Test button → backtest with unsaved values; no `POST /settings` from the backtest (the mock counts); transfer → dashboard unsaved and marked; account change without old results; notes cannot be hidden; tooltips (UI-07); 375 px (UI-08) |
| live (DEMO, read only) | One run over 30 days of M1. Compare with the trades of the same zone (plausible, not equal). Measure load time and memory for 1 year of M1. |

B0 (this PR): `scripts/features/update_checklist.py --check` passes.

## Result B1 (PR #111)

| File | Change |
|---|---|
| `worker_python/src/utils/mt5_helpers.py` | New tuple `SYMBOL_COST_FIELDS`. `build_detailed_symbols` adds these fields to each symbol. A value that MT5 does not give stays `null`. `get_cached_symbols`: a cache entry without the cost fields is not fresh. |
| `worker_python/src/utils/mt5_market.py` | `_SYMBOL_FIELDS` uses `SYMBOL_COST_FIELDS`. The time check also gives `trade_stops_level` now. |
| `frontend_nextjs/src/store/types.ts` | `SymbolDetail` has the cost fields. They are optional, because the symbol cache (max. 1 h) of an older worker does not have them. |
| `frontend_nextjs/src/lib/backtest/commission.ts` | `proposeCommission(deals, symbol)`: commission per lot (round turn) = −Σ commission ÷ Σ closed volume. |
| `frontend_nextjs/e2e/fixtures/data.ts` | The mock symbols have the cost fields. |

Decisions:

- The tuple is in `mt5_helpers.py`, not in `mt5_market.py`. `mt5_market` imports `mt5_connection`, and `mt5_connection` imports `mt5_helpers`. An import from `mt5_market` in `mt5_helpers` makes a cycle.
- The commission proposal uses only fully closed positions of the symbol. An open or partly closed position does not have the exit commission yet, and the value is too low. A position with a reversal deal (`DEAL_ENTRY_INOUT`, netting) does not count, because the backtest supports hedging only. A position with a close-by deal (`DEAL_ENTRY_OUT_BY`) does not count, because some brokers book the commission on one of the two positions only. The bot does not use close-by. `fee` is not commission and does not count.
- The symbol cache (`broker_symbols.json`, TTL 1 h) has one file time for all accounts. Thus, an entry from before B1 can stay "fresh" for more than 1 h. An entry without the cost fields is now never fresh: the worker gives the old list once and refreshes it in the background. The backtest (B4) must not use a default value when a cost field is missing.
- A broker that books commission only at the entry (or only at the exit) gives the correct round-turn value with this formula.

## Result of the history check (B1, 2026-10-06)

- The user did the check on the DEMO account. "Max. bars in chart" = "Unlimited" is set and active.
- `/chart` shows M1 back to 2026-07-29 only (approx. 10 weeks). These candles are in `market.sqlite` from earlier queries.
- The M1 chart in the MT5 terminal goes back to 2026-10-02 only.
- Result: MT5 does not give 1 year of M1 for this account. A backtest over 1 year needs the CSV import (B9).
- Until B9 is done, the backtest uses the available data. The missing range shows as `missing` (rule 4).

## Result B2 (PR #114)

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/backtest/engine/` | New. One file for each Python module, with the source in the header: `pyRound`, `types`, `state`, `tradeUtils`, `helpers`, `zoneMagic`, `orders`, `config`, `validation`, `placement`, `instantEntry`, `vanished`, `handler`, `orderManager`, `zoneSelector`, `zoneState`, `orchestrator`. |
| `frontend_nextjs/src/lib/backtest/broker/simBroker.ts` | New. FakeMT5 + TimelineMT5 + Recorder of `tests/parity/runner.py`: order book, fill at the order price, TP/SL, candles from the history and the ticks until now, events as in the golden files. |
| `frontend_nextjs/src/lib/analysis/levels.ts` | The core of `generate_levels` is now `levelSets()` (desired and acceptable levels). `zoneLevels()` (chart) and the engine use it. Rounding with `pyRound`. |
| `frontend_nextjs/e2e/fixtures/parity.ts` | New. Scenario driver as `runner.run`: per tick the market step, then one bot run, then `active`. B3 uses it again. |
| `frontend_nextjs/e2e/mocked/backtest-grid-parity-lib.spec.ts` | New. `@BKT-02`: 13 scenarios equal to the golden files, `pyround.json` with `Object.is` (also `-0`), a second run gives the same sequence. |

Result: all 13 scenarios and all `pyround.json` cases agree on the first run of the port.

Decisions:

- `pyRound` rounds the exact binary value (mantissa and exponent with BigInt, ties to even), as CPython. `toFixed` rounds exact ties up, for example `round(0.125, 2)` gives 0.12 in Python. `round(x)` without digits gives `+0`, `round(x, n)` can give `-0`, as in Python.
- The engine has no global state. `EngineState` is one object for each run. It also holds the content of `ui_state_<account>.json` (`uiStates`, `null` = no file).
- The engine writes log codes with values (`grid.maxPositions`, `zone.exited` …), not the Turkish texts of the bot. The run log (B4) translates them with i18n. The logs are not part of the parity.
- There is no Playwright project `logic`: the `webServer` starts for each project. The logic tests use the pattern `e2e/mocked/*-lib.spec.ts`, as `backtest-costs-lib.spec.ts`. Thus `run.sh` and CI need no change. BKT-02/03/04 in the catalog say this now.
- In parity mode a position has no `time_msc` (FakeMT5). The anchor of `step_by_loss` / `instant_entry` is then the position with the highest ticket. The ticket counter starts at 1000 and counts as in FakeMT5.
- A zone key with the value `undefined` counts as missing (as in JSON for Python). `pyFloat` throws for `null`, `undefined` and text that is not a number, as Python `float()`.
- Invalid zone settings give a log code with values (`config.minNotBelowMax`, `config.noSymbol`, `config.noTickValue`), not an English text.
- A test checks rule 1: no file in `src/lib/backtest/` uses `mergeAndSaveSettings`, `/settings` or a store hook.
- Not ported: `rekey_zone_state` (the backtest does not load settings again during a run), `grid_remote`, `grid_metrics`, `grid_safety`. A fractal zone gives the error `engine.fractalNotPorted` until B3.

## Open points

- [x] B1: cost values of the symbol, commission proposal (PR #111).
- [x] B1, manual check on the VPS (DEMO, read only; the worker runs only there): in the MT5 terminal, set Tools → Options → Charts → "Max. bars in chart" to "Unlimited" and restart the terminal. Then examine `/chart` or `GET /api/market/{id}/coverage` for 1 year of M1. If MT5 does not give 1 year, do B9 (CSV import) before B4.
- [x] B2: engine port, grid; the 13 grid, exit and instant scenarios give the same event sequence as the golden files (PR #114).
- [ ] B2 follow-up (from the review of PR #114): the 13 scenarios do not test these paths. The code agrees with Python when read, but no golden file checks it: `trade_stops_level` > 0 (`enforceStopsLevel`, TP/SL on the wrong side), the exit targets "Sadece BUY İşlemleri" / "Sadece SELL İşlemleri" (the UI default is BUY), `clear_exit_side` not equal to the exit, `step_by_loss` with tick values, two symbols, `max_positions = 0`, the top-up after a partial fill (the simBroker cannot fill partly). Add scenarios in `make_scenarios.py`, write the golden files again, and change the count in the BKT-02 spec.
- [ ] B4: `simBroker.bars()` builds all candles again from all ticks at each call. Keep the candles incrementally for runs with up to 1 million candles.
- [ ] B3: engine port, fractal; the 5 fractal scenarios are equal to the golden files.
- [ ] B4: runner; hand-calculated cases (buy, sell, gap, swap with triple day, open loss at the end) agree; no event is skipped without a message.
- [ ] B5: page `/backtest`, test button; no `POST /settings`; an old result never shows under a different account.
- [ ] B6: chart; max. 50,000 drawn candles for 1 year of M1; the replay never shows future data.
- [ ] B7: more setups; a late run does not overwrite a different setup.
- [ ] B8: presets and "apply to zone"; the transfer stays unsaved; a new zone is inactive.
- [ ] B9: CSV import; an aborted or wrong import cannot be selected.
