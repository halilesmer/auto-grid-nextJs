---
date: 2026-10-06
type: plan
status: open
pr: [110, 111, 114, 115, 126, 129, 130]
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
| B2.1 | Parity scenarios for the paths that B2 does not test (gaps G1–G7) | BKT-01, BKT-02 | done (PR #115) |
| B3 | Engine port, fractal (ATR, SAR) | BKT-03 | done (PR #126) |
| B4 | Runner: path model, higher timeframes, costs, gap model, web worker | BKT-04, BKT-09 (TS) | done (PR #130) |
| B5a | Page `/backtest` with one run; test button of a zone opens it; run log texts; netting refusal | BKT-06, BKT-10, BKT-12 (zone → backtest) | done (PR B5a) |
| B5b | Move `CsvImportPanel` selection: data source MT5 or CSV in the run; `csv_gap` text | BKT-05, BKT-06 | done (PR B5b) |
| B6 | Chart with equity area and replay | BKT-07 | done |
| B7 | More setups: badges, duplicate, compare table, equity overlay | BKT-08, BKT-13 | open |
| B8 | Presets (worker and UI) and "apply to zone" | BKT-11, BKT-12 | open |
| B9 | CSV import (worker process and dialog) | BKT-05 | done (PR #129); VPS check open |

Order (changed 2026-10-06 after the B1 check): B0 → B1 → B2 → B2.1 → B3 → B9 → B4 → B5 → B6 → B7 → B8. MT5 on the VPS does not give 1 year of M1 (see "Result of the history check"). Thus, B9 (CSV import) comes before B4. B2.1 comes from the review of PR #114.

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

## Items from the first concept

The first concept (a draft from 2026-10-03, not committed) had these items. This plan, `docs/analyse-regeln.md` and the code do not have them yet. They are proposals, not decisions.

| # | Item | Status in the code | Proposal |
|---|---|---|---|
| 1 | Estimated total costs (spread + commission + swap) as a KPI | `computeStats` does not add the costs. The plan shows the spread as information only. | One KPI "costs": commission + swap of all trades; "of which spread" as information. |
| 2 | Recovery factor | Missing | Net ÷ max. drawdown; `null` when the drawdown is 0. |
| 3 | Max. losses in a row | Missing | Count in the sorted trades of `computeStats`. |
| 4 | Win rate for long and short | `Trade.side` exists; `breakdown` has no split by side | New `BreakdownKind` `side`, or two KPIs. |
| 5 | Mean hold time | `Trade.entryTime` exists and can be `null` | Mean of `exitTime − entryTime`; trades without entry do not count, the count shows. |
| 6 | Grid cycles per day | `cycles` is a sum only | `cycles` ÷ trading days of the period. |
| 7 | Time in profit and time in loss | Missing; needs the equity curve | Backtest only: part of the time with equity above or below the start capital. |
| 8 | CSV files from MT4 and MT5 | BKT-05 checks time order, OHLC and time zone, but names no format | B9 defines the accepted formats. |

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
| `src/lib/backtest/candles/` | `loadRates.ts` (pages through `/rates` with `next_from`, collects `missing`), `bars.ts` (higher TFs without future data), `pathModel.ts`. The folder is not called `data/`, because `.gitignore` ignores every `data/` folder. |
| `src/lib/backtest/` | `backtest.worker.ts`, `protocol.ts` (message types), `runContext.ts` (run log), `runSummary.ts` (end of test: open P/L, end equity, open positions), `runner.ts` (calculation core), `runJob.ts` (one job: load, calculate, report; the worker only calls it) |
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
- Rejects, vanished orders (ENG-25), auto pause (ENG-11), partial fills. Also rejects for the stops level and the freeze level: the `simBroker` accepts each order.
- The top-up after a partial fill (gap G6 of B2.1): in V1 the top-up branch of `process_partial_fills_and_tpsl` never runs, because the `simBroker` always fills the full volume. No golden file checks it (V2).
- Remote commands, reconnect, more zones of one account at the same time. V1 tests one zone for each setup.
- Two symbols or more zones in one run (gap G4b of B2.1): no golden file checks the port for this (V2).
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

## Result B2.1 (PR #115)

Before B2.1, all 18 scenarios used 1 zone, 1 symbol with `trade_stops_level` 0 and without tick values, the exit target "Farketmez (Hepsi)" and `max_positions` 10, 3 or 1. A backtest with real symbols (B4) reaches more paths. B2.1 adds 11 scenarios with golden files (now 29; 24 of them for BKT-02). The 18 old scenario and golden files did not change (byte-equal).

| Gap | Scenario | Path |
|---|---|---|
| G2 | `exit_ui_default_up` | UI default of a new zone (`zoneHelpers.ts` `defaultZone`: exit side SELL, target only BUY, only pending orders), exit up: the side does not agree, nothing is cancelled, the zone still gets AUTO_CLEAR; `clean_zombie_orders` cancels the orders in the next tick. |
| G2 | `exit_ui_default_down` | UI default, exit down: only the BUY orders are cancelled in the exit tick, the SELL orders in the next tick. |
| G2 | `exit_up_sell_only_all` | Exit up, "Tüm İşlemler", target only SELL: the SELL positions close, the BUY positions stay open. |
| G1 | `grid_stops_level` | `trade_stops_level` 50 points, TP 0.03: `enforce_stops_level` moves the TP of the orders; TP resync (`sltp`) for BUY and SELL, and the wait when the new TP is on the wrong side. Records a bot defect, see `2026-10-06-stops-level-order-flood.md`. |
| G3 | `grid_step_by_loss_tick_value` | `step_by_loss` with tick value 3.0 / tick size 0.01 (300 for each price unit), BOTH without sync, SELL with its own lot; distances rounded to points. |
| G5 | `grid_max_positions_unlimited` | `max_positions` 0 = no limit (500): 15 fills. |
| G5 | `grid_lot_below_min` | `volume_min` and `volume_step` 0.1: BUY lot 0.05 → 0.1, SELL lot 0.25 → 0.3. |
| G5 | `grid_sell_lot_empty` | BOTH without sync, `sell_lot_size` "": SELL uses the BUY lot 0.03 (not `volume_min`). |
| G5 | `grid_sync_ignores_sell` | BOTH with sync: all `sell_*` fields are ignored. |
| G4a | `grid_start_outside_no_clear` | The run starts above the zone, `clear_on_exit` off: the bot trades the grid of the first zone of the symbol before the price enters, and does not clean up at the exit. |
| G7 | `exit_stored_magic` | Zone with the stored `magic` 200007: orders, comment `AutoGrid_Z7`, exit and clean-up use this magic. |

| File | Change |
|---|---|
| `worker_python/tests/parity/make_scenarios.py` | `add(..., symbol=None)` merges extra symbol fields into `SYMBOL`; 11 new scenarios; `UI_CLEAR` = exit fields of the UI default. |
| `worker_python/tests/parity/scenarios/`, `golden/` | 11 new scenario files and 11 new golden files. |
| `frontend_nextjs/e2e/mocked/backtest-grid-parity-lib.spec.ts` | Count 24. One guard test for each new scenario: the golden file reaches the path (for example `sltp` events, 15 fills, the cancels in the exit tick and in the next tick). |

Result: the TS port agrees with all 24 scenarios on the first run. No change in `src/lib/backtest/` was necessary.

Decisions:

- Mutation check, because all new scenarios were green at once. Procedure: one change in the TS port, then the BKT-02 spec, then restore the file. Each change made only its new scenario red, and no old scenario:

  | Change in the TS port | Red scenario |
  |---|---|
  | Exit target filter and exit side ignored | `exit_ui_default_up`, `exit_ui_default_down` |
  | `tpslOnWrongSide` always false | `grid_stops_level` |
  | `enforceStopsLevel` without effect | `grid_stops_level` |
  | Tick value ignored | `grid_step_by_loss_tick_value` |
  | `max_positions` 0 → 10 | `grid_max_positions_unlimited` |
  | `""` is not empty | `grid_sell_lot_empty` |
  | Sync reads `sell_grid_step` | `grid_sync_ignores_sell` |
  | Stored magic ignored | `exit_stored_magic` |
  | `clear_on_exit` ignored | `grid_start_outside_no_clear` |

- Before B2.1, no scenario left a zone with `clear_on_exit` off.
- A guard test compares the exit fields of `exit_ui_default_*` with `defaultZone()`. When the UI default changes, the test fails.
- G1 uses price steps of 0.07 and 1 level for each side. With steps of 0.02 the defect prevents all fills (no `sltp`), and the golden file had 3,493 events.
- G4b (two symbols, more zones) and G6 (top-up after a partial fill) are not in B2.1. See "Not simulated".

## Result B3 (PR #126)

Before B3, 4 fractal scenarios had golden files: breakout with buffer SL, rebound with opposite-fractal SL, ATR SL with 2 orders, and SAR SL with a TP as money. B3 adds 10 scenarios for the paths that these 4 do not reach (now 38 scenarios; 14 of them for BKT-03). The 28 old scenario and golden files did not change (byte-equal).

| Scenario | Path |
|---|---|
| `fractal_next_loss_pips` | ENG-30, mode "pips": after the fill at 97.45 the bot cancels the BUY STOP 97.8. It sets the order again when the price is 0.3 against the position. At bid 97.15 the difference is 0.2999… as float, so the gate opens only at 97.14. |
| `fractal_next_loss_money` | ENG-30, mode "money": FakeMT5 gives a profit of 0, so the limit 1.0 is never reached. The BUY STOP 97.8 comes back only after the SL exit. |
| `fractal_max_positions` | `max_positions` 1: after the fill the bot cancels all fractal orders. After the SL exit it sets them again, without the done fractal. |
| `fractal_bid_touch_kept` | Rebound BUY LIMIT 96.5: the bid touches the level, the ask does not. The order stays and fills later (fix of PR #97, `2026-10-02-fractal-bid-touch.md`). |
| `fractal_stops_level` | `trade_stops_level` 100 points, no SL: the BUY STOP waits until the price is far enough. The SELL (lot 0.02, TP 1.5 as money = 0.075) never comes, because the TP is too near the entry. |
| `fractal_live_m1` | M1 without history: no order until 6 candles exist; then fractals from the ticks. |
| `fractal_atr_fallback` | ATR period 40 with 30 candles: no ATR, the SL comes from the candle ± buffer. `fractal_rr` 0: no TP. |
| `fractal_sl_invalid` | Rebound, 2 orders, ATR period 25, buffer 0: the older fractal 96.4 has no ATR and no valid SL (no order, the slot stays empty). The newer fractal 96.6 gets the ATR SL. |
| `fractal_sell_count_range` | BOTH without sync: 2 BUY orders, 1 SELL order with lot 0.02. The upper fractal 97.8 is above `max_price` 97.7 and gets no order. |
| `fractal_done_after_fill` | The ask fills the BUY STOP 97.45, the bid stays at 97.44. The candles (bid) do not reach the fractal, but the fill marks it as done. After the SL exit there is no new order. `fractal_rr` 1.5. |

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/backtest/engine/fractalEntry.ts` | New. Port of `fractal_entry.py` (`manage_fractal_orders`): desired orders, match / modify / cancel / place, done list, position limit, ENG-30 gate, SAR trailing. |
| `frontend_nextjs/src/lib/backtest/engine/fractalSignals.ts` | New. `atr`, `parabolicSar` of `fractal_signals.py`. |
| `frontend_nextjs/src/lib/analysis/fractals.ts` | The 5-candle rule is now `fractalsOf()` (with index, high and low). The chart (`findFractals`) and the engine use it. The chart result did not change. |
| `frontend_nextjs/src/lib/backtest/engine/` | `config.ts`: the fractal fields. `state.ts`: `fractalTracked`, `fractalDone`, `fractalLogged`. `orders.ts`: `fractalComment`, `parseFractalComment`, `modifyPendingOrder`. `helpers.ts`: `zoneLogId`. `handler.ts`: a fractal zone goes to `manageFractalOrders` (no error `engine.fractalNotPorted` now). `types.ts` / `simBroker.ts`: `Position.profit` (0 in parity mode, as FakeMT5). |
| `worker_python/tests/parity/make_scenarios.py` | `FRACTAL_SHAPE_TWO` (two fractals on each side that the price did not reach) and 10 new scenarios. |
| `frontend_nextjs/e2e/mocked/backtest-fractal-parity-lib.spec.ts` | New. `@BKT-03`: 14 scenarios equal to the golden files, one guard test for each new scenario, a second run gives the same sequence. |

Result: the TS port agrees with all 14 scenarios on the first run.

Decisions:

- Mutation check, because all scenarios were green at once. Procedure as in B2.1: one change in the TS port, then the BKT-03 spec, then restore the file.

  | Change in the TS port | Red scenario |
  |---|---|
  | Gate "pips" never opens | `fractal_next_loss_pips` |
  | Gate "money" always open | `fractal_next_loss_money` |
  | Position limit ignored | `fractal_max_positions` |
  | A consumed fractal does not keep its order | `fractal_bid_touch_kept`, `fractal_rebound_opposite`, `fractal_sl_invalid` |
  | `priceOk` ignores the stops level | `fractal_stops_level` |
  | `stopsOk` always true | `fractal_stops_level` |
  | Fallback SL with buffer 0.1 | `fractal_atr_fallback`, `fractal_sl_invalid` |
  | `fractal_rr` fixed at 2 | `fractal_done_after_fill` |
  | SELL count = BUY count | `fractal_sell_count_range` |
  | Range check removed | `fractal_sell_count_range` |
  | `fractal_use_sl` ignored | `fractal_stops_level` |
  | SAR trailing off | `fractal_sar_money_tp` |
  | Done list off | `fractal_done_after_fill` |
  | Minimum of 6 candles ignored | none: equivalent. With fewer than 6 candles (5 closed) no fractal can exist. |

- Two first scenario versions were quiet at the end. The Python test "later prices do not change earlier decisions" (BKT-09) then failed in its check "the change has an effect". The scenarios got SL exits or a TP at the end; the test did not change.
- The done list is visible only when a fill does not consume the fractal. A fill normally consumes it, because the candle reaches the level. Only a BUY STOP that the ask fills while the bid stays below the level shows the done list (`fractal_done_after_fill`).
- The 5-candle rule is in one place (`fractalsOf` in `lib/analysis/fractals.ts`), as `levels.ts` for the grid. ATR and SAR are only in the engine.
- `sum()` in `atr`: the port adds from left to right, as Python 3.11 (worker venv). From Python 3.12, `sum()` of floats is compensated, and the golden files can change.
- `Position.profit` is 0 in parity mode, as FakeMT5. Thus the ENG-30 mode "money" opens the gate only when no position of the direction is open. B4 calculates the profit for real runs.
- Not ported: the file `fractal_state_<account>.json` (a run starts without it, as `reset_bot_state` in the runner) and the orders of removed extra setups (`legacy_setup_orders.py`; the backtest makes none). A manual delete or the expiry of a fractal order does not occur in a backtest.
- The engine writes log codes `fractal.*` with values (`fractal.placed`, `fractal.nextLossWait` …), as in B2. The run log (B4) translates them.

## Result B9 (PR #129)

The import is a separate data source. The candles go to `rates` with `source = csv:<import_id>`; the MT5 candles (`source` = server name) are never changed. Files: `worker_python/src/utils/csv_import.py` (all logic), 4 routes and `GET /imports` in `src/api/market.py`, table `csv_imports` (schema version 2) in `market_db.py`, `CsvImportPanel` and `CsvImportDialog` in `frontend_nextjs/src/components/backtest/`.

- Process: `POST /imports` (symbol, timeframe, size, offset) → `PUT /imports/{id}/chunk?index=n` (raw bytes, in order, max. 4 MB each, file max. 150 MB) → `POST /imports/{id}/commit {replace}`. `DELETE` removes staging or a committed import. The id is made by the worker (32 hex characters) and every route checks account and id (`account_access`, then the id must belong to that account: else 404).
- Checks at commit (first pass, nothing stored): known layout (header names, or MT5 export with date and time apart, or position only), prices positive and finite, high/low contain open and close, time on the timeframe grid, strictly rising time, time between 2000 and now + 1 day, max. 2 million rows. The first 20 errors come back with line numbers (422). A wrong file is deleted at once, so it can never be selected. The second pass writes in one transaction in batches of 50,000 rows.
- Overlap: a committed import of the same account, symbol and timeframe with an overlapping range gives 409 with the old import. Only `replace: true` deletes the old one (in the same transaction as the new write).
- Gaps: a break longer than 4 days (`MAX_PAUSE_SEC`) in the file is stored as `unavailable`; `rates?source=csv:` shows every range outside the file as `missing` with the reason `csv_gap` (rule 4 of this plan). Weekends are not gaps.
- Limits: max. 3 unfinished imports per account; unfinished imports older than 24 hours go away at the next create; the database size limit (`MARKET_DB_MAX_MB`) is checked at create and before the write (507). Deleting an account deletes its imports.
- Time zone: the file time plus `time_offset_sec` (−14 to +14 hours) is the MT5 server time. The worker cannot know the time zone of a file; the user sets it. This is the main risk (see open points).
- Assumption: the import has one timeframe (as the file). `rates?source=csv:<id>` refuses another timeframe or symbol (400). The browser builds higher timeframes in B4.
- The dialog sits in the Backtest tab of `/chart`, because `/backtest` comes with B5. The catalog text says so.
- Changed test: `test_fehlgeschlagene_migration_laesst_alte_version_und_antwortet_503` had the schema versions 1 and 2 fixed in it. With migration 2 it uses `SCHEMA_VERSION` and `+ 1`. The checks did not change.
- Review fixes (reviewer, before the commit): the dialog never deletes an import blindly after a network or 5xx error at commit (it asks the list first; a committed import counts as done); symbol, timeframe and offset are locked while "replace" waits; a file that is not UTF-8/UTF-16, a binary file, and a volume of `inf` or above 2^62 give 422 and the staging goes; a repeated chunk cuts the leftover bytes of a failed write; a commit locks the import against a second commit, chunk and delete; the commit needs the file size to equal the announced size; the raw file that cannot be removed after the commit only gives a log warning; deleting imports gives the space back (`reclaim_space`); the delimiter comes from the first line (the sniffer failed on `;` with decimal comma and no header).
- Evidence: `pytest tests → 674 passed`; mutation check (no overlap check, no grid check, no order check, no size check) turns `test_csv_import_api.py` red; `npm run test:e2e → 331 passed` (before the review fixes; after them `csv-import` + `tooltips` spec → 21 passed); `tsc` and `eslint` clean; `scripts/features/run.sh BKT-05 → api ✅ e2e ✅`. Not checked: real MT5 data and a 1-year file on the VPS.

## Result B4 (PR #130)

The runner plays every candle along its price path and calls the bot port (`engine/`) with a broker that triggers orders, TP and SL in price order and books costs. Files (all under `frontend_nextjs/src/lib/backtest/`):

| File | Content |
|---|---|
| `candles/loadRates.ts` | Pages through `GET /market/{id}/rates` (`next_from`), `Float64Array` columns, `missing` stays. The live candle (`live_from`) is cut off. Stops with a code above 1 million candles, on a time that does not rise, on a column that is not a list. |
| `candles/bars.ts` | `TimeframeAggregator`: higher timeframe from closed base candles plus the path of the running candle so far. Keeps the last 1,000 bars. |
| `candles/pathModel.ts` | Waypoints (rising: O→L→H→C, falling: O→H→L→C; forced paths for "both paths") and the time on the path (by length, last point exactly 1 s before the candle end). |
| `broker/costs.ts` | Snapshot of the symbol values, profit, commission per half, swap per night, triple day, spread setting. |
| `broker/pathBroker.ts` | `PathBroker` extends `SimBroker`: `nextTrigger`/`fire`, `rollover` (swap), trades in the `Trade` format, equity, the bars for the bot. |
| `runner.ts`, `runSummary.ts`, `runContext.ts` | Calculation core, end of test, run log (codes with values). |
| `runJob.ts`, `backtest.worker.ts`, `protocol.ts` | Job (load, calculate, report; errors as message with code), thin web worker, message types. |
| `broker/simBroker.ts` | Fields are `protected`; the hook object `hooks` (`openedByBot`, `closedByBot`) lets the subclass book market requests of the bot. Parity mode is not changed. |
| `engine/pyRound.ts` | `pyRound` has a fast path now (see below); the exact way is `pyRoundExact`. |

Model (all in `runner.ts` and `pathBroker.ts`):

- Per candle: swap for each broker midnight that passed; the jump from the last close to the open (gap); then segment by segment. On a segment the next mark is the first one in travel direction: a pending order, a TP or an SL. After each fill or exit the bot runs. The bot also runs when the mid price crosses a zone border (the bot checks `(bid + ask) / 2`), and at the end of each segment. More than 100,000 events in one candle stop the run with `run.tooManyEvents`.
- The candles are bid candles. A buy order triggers at `bid = order price − spread`, a sell TP at `bid = TP − spread`. The spread of the candle is the MT5 value (`spread` mode `candle`), a fixed value, or the larger of both. A candle without a value (CSV: `NaN`; MT5: 0, which means "not recorded") uses the current spread of the symbol, with the warning `run.spreadFallback`; without that value the run stops.
- Fill model `gap` (default): when the price jumped over the mark (gap between two candles, or the bot put the order behind the price), the fill or exit uses the market price (ask for buy, bid for sell). Model `parity`: always the price of the order or the TP/SL.
- "SL first" decides only at the same trigger price (TP before SL is the default). A price path inside a candle is not known; the option "both paths" (two runs) shows the range. The run needs no other rule, because the segments are monotone.
- Profit: ticks × `trade_tick_value_profit` (gain) or `_loss` (loss) × lots, to the cent. Commission per lot (round turn) half at entry and half at exit, negative as in MT5. Swap at each broker midnight (Saturday and Sunday cost nothing; the triple day of the symbol costs 3, else 1; so a week costs 7). The spread is in the fill prices; "of which spread" is information only.
- End of test: realized, open P/L (with entry commission and booked swap), end equity, open positions, max. drawdown (from the start capital, sampled at the candle ends). The curve is reduced to 20,000 points; low and high of each group stay.
- Run log (codes): `run.marginNotChecked`, `run.rejectsNotSimulated`, `run.stopsLevelNotSimulated`, `run.costsEstimated`, `run.currencyToday`, `run.dataMissing`, `run.liveCandleDropped`, `run.spreadFallback`, and the engine codes (`zone.entered` …). Max. 2,000 lines; the counters go on.
- Preconditions that stop the run with a code: a missing, non-positive or non-whole symbol value (`run.symbolFieldMissing` with the field names), a calculation type outside the list (`run.calcModeUnsupported`; the approximation mode only warns), a swap mode other than 0, 1, 4 (`run.swapModeUnsupported`), a triple day outside Monday to Friday, a zone symbol other than the symbol (`run.symbolMismatch`), a strategy timeframe finer than the data (`run.timeframeFinerThanData`), no candles in the period.
- The zone copy gets `is_active: true`. The bot reads at most 301 bars of the strategy timeframe; the lead-in before the start is 301 bars (+ 40 % for weekends, at most 100,000 data candles) for fractal zones.

Tests (hand-calculated, in `frontend_nextjs/e2e/mocked/`):

| Spec | Content |
|---|---|
| `backtest-data-lib.spec.ts` (27) | Profit with gain and loss tick value, commission, swap in points and in money, triple day Wednesday/Friday, symbol snapshot (missing, implausible, unsupported), loading with `next_from`, limits, live candle, higher timeframes without future data, path and time on the path, run log. |
| `backtest-runner-lib.spec.ts` (32) | Fill on the path and open loss (−4.20 = −4.00 − 0.20), TP exits with net 9.60, "close at the end", gap vs. parity (54.00 vs. 48.00), swap with triple day (−1.95 vs. −0.65; two weeks −9.10), zone border in the middle of a segment (49.3633 s), trigger order and spread offset in the broker, close by the bot (sell at the ask, buy at the bid, with commission and swap), the bars of the bot, the equity curve, HTTP errors, preconditions, job and messages. |
| `backtest-future-lib.spec.ts` (52) | BKT-09 in TypeScript: all 38 scenarios of the golden files; the calculator with grid and fractal zone, three paths, cuts at two candles; the second half of a candle path changes nothing that the bot did before the first extreme. |

Evidence:

- `npx tsc --noEmit` and `npx eslint` clean. `scripts/features/run.sh BKT`: unit 120 passed, api 34 passed, e2e 190 passed (BKT-02/03 golden files unchanged, byte-equal).
- Mutation checks (one change, run the spec, restore the file). Each change turned only the expected tests red:

  | Change | Red |
  |---|---|
  | Loss tick value ignored | profit test |
  | Triple day fixed to Wednesday | night weights, swap tests |
  | Gap fill off (`useMarket` false) | gap test, broker test |
  | Gap flag of the jump off | gap test |
  | Sell TP without spread offset | broker test |
  | Swap without booking in `net` | swap tests |
  | Tie order TP/SL swapped | trigger order test |
  | Zone border wake-up off | zone border test |
  | `is_active` not set | inactive zone test |
  | Peak equity starts at −∞ | first run test (max. drawdown) |
  | The bot sees the low of the candle at the open | BKT-09 candle tests (grid and fractal) |
  | The running candle is added to the timeframe at the open | BKT-09 candle test (fractal) |
  | The bot's close request uses the wrong side of the spread | the two close tests of the bot |
  | The equity curve drops its last point | curve test (the last value must not be a high or low) |
  | Swap booked without rounding the sum | the two-week swap test |
  | No time limit on the HTTP request | HTTP test |

  A first version of the curve test and of the swap test did not turn red for the last two changes (the last value was a high; one addition has no rounding rest). They were changed until they did.

- Measurement before the first speed fix: grid zone, 30,000 M1 candles, 60.6 s (2 ms per candle); fractal zone (M15) 7.3 s. A CPU profile of 4,000 candles: 87 % of the time was in `pyRound` (BigInt). After the fast path in `pyRound`: 12.0 s for the same 30,000 candles (0.4 ms per candle). One year of M1 (about 370,000 candles) is then about 2.5 minutes for a busy grid zone. Not measured: 1 million candles, memory, the real web worker in the browser.

Review fixes (reviewer, before the commits): the equity curve keeps its first and last point; trade times are whole seconds like MT5 deals (the run log keeps fractions); the swap of a position is rounded to cents after each night; the zone-border wake-up rounds a quotient that is just below a whole number (BTC: 1e7 steps); the HTTP request of the worker has a limit of 120 s and gives `run.network` (no net, time-out, no JSON) or `run.http` (status); an unexpected error is also written with `console.error` in the worker; the `pyRound` test covers 0 to 15 digits; candle data and the swap mode check got range checks (see the first review in the commit "Backtest B4 (1/2)").

Decisions:

- `pyRound` fast path: for `0 ≤ ndigits ≤ 15` and `|x| · 10^n < 10^12` the product has an error below 1.2e-4, so a distance of more than 1e-3 from a half value fixes the direction. Then `k / 10^n` is the correctly rounded division of two exact numbers, equal to `Number("k.ddd")`. Near a half value it calls the exact way. The test compares both ways on more than 100,000 values (prices, half values, −0, values near 1e11). The golden file `pyround.json` is unchanged.
- The structure change in `simBroker.ts` (fields `protected`, hook object) does not change parity mode: all golden files agree.
- The `candles/` folder replaces `data/` of the plan (`.gitignore` ignores `data/`).
- The run log has codes only. The texts (tr/en/de) come with the page (B5), together with the UI that shows them. Changed from the B2 note, which said B4.
- The exact MFE/MAE of the simulator (plan, "Modules that the backtest uses again") is not in B4. It comes with B5/B6, when `TradesTable` takes ready values.
- Hedging check: the run does not know the account model. The page (B5) must refuse netting accounts (`docs/analyse-regeln.md` §6; `GET /market/{id}/time-check` gives the model).
- Swap mode numbers: the MQL5 page names the modes, but gives no numbers. 0, 1 and 4 are the first, second and fifth name in that order. Not checked against MT5 (see open points).

## Result B5a (page `/backtest`)

Branch `claude/backtest-b5a-page`. The page runs one test of one setup in the web worker of B4.

**Done**

- Page `/backtest` (menu item "Backtest"), state in the URL (`account`, `zone`, `range`). The setup card (account, setup, range) copies `/chart`. The Backtest tab of `/chart` is gone; `CsvImportPanel` moved to `/backtest` unchanged.
- Settings card: data resolution, spread, commission (proposal from `proposeCommission` with the deals of the last year), swap, start capital, fill model, SL first, candle path (also "both"), close at end, approximate mode. Start and cancel (`terminate()`), progress bar.
- Result: end of test (realized, open P/L, end equity, open positions, drawdown, commission, swap, spread), `StatsKpis`, `CurveChart` (equity, drawdown), run log. "Both" shows two columns.
- Run log and error texts in tr/en/de for every code (`backtest.log.<code>`, `backtest.error.<code>`). A test reads the sources of `lib/backtest` and fails if a code has no text.
- Notes block (BKT-10) above each result: no close button. It shows the `run.*` lines of the log, a note for resolution M5 or coarser, and "uncertain" when the grid distance is smaller than the mean candle range (`RunResult.avgRange`, new). The check only applies to the grid mode with a fixed distance.
- Test button of a setup (`ZoneHeader`) writes a copy of the setup, with unsaved changes, to `useBacktestHandoffStore` and opens `/backtest?account=&zone=`.
- A change of account stops a running test and clears the result (`useBacktestStore.clearUnless`). Messages with an old `runId` are ignored.

**Decisions**

- The handoff is in memory only (changed from the plan, which said sessionStorage). The page reads it once at open and clears it. A reload or a link in a new tab uses the saved setup. The unsaved values of the setup page are lost at a reload too, so a stored handoff would show values that the setup page no longer has.
- Netting refusal without a worker change: `GET /history/{id}/deals` (any user) has `account.margin_mode`. Hedging (2) runs, netting (0) and exchange (1) block the start with the reason, an unknown mode shows a warning. The plan said to extend `/clock`; that is not needed. The admin-only `time-check` is not used.
- The web worker builds in Next 16.3.3 (Turbopack). The `@/` aliases resolve inside the worker; the e2e tests run a real worker against the mock.
- Not in B5a: the zone fields in the page (`ZoneFieldsEditor`, B7), `TradesTable` with exact MFE/MAE and the chart (B6), the data source selection and the `csv_gap` text (B5b).

**Defects found in the second test round (fixed before merge)**

- The range "All" has no start. The page used 0, and the run subtracts the warm-up time, so `from` became negative and the worker refused the request (422, `ge=0`). Fix: with "All", the start is blocked with a reason. Lesson: a range without a start is not a valid run range; block it on the page.
- Without the handoff (for example from the menu), the page loaded the settings with `ifMissing`. The store can still hold unsaved changes from the setup page, but the page said "the saved setup is tested". Fix: the page loads the settings again (`always`) and shows the setups only after that load. The setup page loads again at return too, so no unsaved value is lost that would otherwise stay.
- Because of that fix, a new unsaved setup from the test button was not in the saved list and had no number ("Setup 0"). Fix: the page inserts the setup of the handoff into the list (`insertSetup`), as the symbol card shows it. The start is blocked until the settings are loaded.
- An error of a run stayed visible after a change to another setup. Fix: the error is bound to the account and the setup of its run, as the result is.
- Each defect has an e2e test that failed before the fix.

**Measured**

- `npx playwright test --project=mocked`: 459 passed, 0 failed (after the review fixes). In the second round: 458 passed, 1 failed (`ZON-05`, timeout on the account select under load; it passes alone, no B5a code).
- After the fixes of the second round: `backtest-page.spec.ts`, `csv-import.spec.ts`, `tooltips.spec.ts`, `mobile-layout.spec.ts`: 60 passed, 0 failed.
- `npm run lint`, `npx tsc --noEmit`: clean.

## Result B5b (data source in the run)

Branch `backtest-b5b-data-source`. The settings card has the field "Data source": the MT5 server of the account, or one CSV import.

**Done**

- `useCsvImports` (new hook) loads the import list of the account one time. `CsvImportPanel` and the data source field use the same list, so an import, a replace or a delete in the panel changes the field at once.
- The field shows only imports with status `committed`, the symbol of the setup (`SymbolDetail.name`) and a timeframe M1, M5, M15 or H1. The worker refuses a different symbol or timeframe (`csv_import.get_rates`, 400), so the page does not offer them.
- With a CSV import, the data resolution is the timeframe of the import. The resolution field is disabled and its tooltip tells why. The run sends `source=csv:<import_id>` to `GET /market/{id}/rates`; it never reads MT5 then.
- A change of account or setup symbol sets the field back to "MT5 server", as it resets the commission. When the selected import is deleted, the field shows "MT5 server" and the run uses MT5. When the list cannot be loaded again, the page keeps the last list of the account, so a selected CSV source does not change to MT5 without a sign.
- Text for the reason `csv_gap` in tr/en/de (`analysis.data.reason.csv_gap`). The run log and the notes block show it for each range without candles in the import ("No candle in the CSV import …"). Nothing is filled.
- Mock worker: `rates?source=csv:<id>` copies `csv_import.get_rates` (409 if not committed, 400 for another symbol or timeframe, candles only inside `first_t`…`last_t`, the rest is `csv_gap`, no spread, no live candle).

**Decisions**

- The CSV answer of `rates` stays without `account_id`, `server_now` and `offset_sec` (open point of B5). The run does not read them: the range comes from the broker clock of `/clock`, and `loadRates` reads only the candle columns. Add them only when a page shows CSV candles on the chart (B6).
- The import list is local state of the page, not a Zustand store. Only `/backtest` reads it.
- The result does not show the data source yet. Add it when B7 compares more runs.

**Measured**

- `npm run test:e2e -- e2e/mocked/backtest-page.spec.ts e2e/mocked/csv-import.spec.ts`: 25 passed, 0 failed. The new CSV test failed with the `source` parameter removed from the run (1 failed), and passed again after the restore.
- `npx tsc --noEmit`, `npx eslint` on the changed files: clean.

## Result B6 (chart and replay)

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/backtest/candles/displayBars.ts` | Builds complete display-timeframe candles from the loaded data. It returns no more than 50,000 candles and clips missing ranges to the chart window. |
| `frontend_nextjs/src/lib/backtest/protocol.ts`, `backtest.worker.ts`, `runJob.ts` | Adds a `bars` request. The worker keeps loaded rates and returns display candles only after their full timeframe ends. |
| `frontend_nextjs/src/components/backtest/BacktestChart.tsx` | Adds timeframe selection, playback at 1x/5x/10x/Max, price candles, zone and grid levels, trade markers, balance/equity areas, and the trade table. Replay filters candles, curves, markers, and closed trades by its cursor. |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | Adds lower-pane balance and equity areas and keeps the chart at the replay cursor. |
| `frontend_nextjs/src/lib/backtest/broker/pathBroker.ts`, `runner.ts` | Tracks favourable and adverse prices along the simulated path and returns exact MFE/MAE for each closed trade. |
| `frontend_nextjs/src/components/analysis/TradesTable.tsx` | Accepts ready excursion values, so the backtest table does not request M1 data. |
| `frontend_nextjs/src/hooks/useBacktestRun.ts`, `store/useBacktestStore.ts`, `RunResultView.tsx` | Keeps the worker alive for chart requests after the run and stores chart data for the active run. |
| `frontend_nextjs/src/i18n/messages/backtest.ts`, `hints.ts` | Adds Turkish, English, and German chart and replay text. |
| `docs/features/features.yaml` | Records BKT-07 as the B6 chart and replay feature. |

The playback cursor is an exclusive end time. Both the worker and chart omit a display candle until its complete timeframe ends. The chart therefore cannot reveal the unfinished candle's future high, low, or close.

Verification: `npx tsc --noEmit` passed. `npx eslint` on changed files passed. Tests were not added or run at the user's request.

## Open points

- [x] B1: cost values of the symbol, commission proposal (PR #111).
- [x] B1, manual check on the VPS (DEMO, read only; the worker runs only there): in the MT5 terminal, set Tools → Options → Charts → "Max. bars in chart" to "Unlimited" and restart the terminal. Then examine `/chart` or `GET /api/market/{id}/coverage` for 1 year of M1. If MT5 does not give 1 year, do B9 (CSV import) before B4.
- [x] B2: engine port, grid; the 13 grid, exit and instant scenarios give the same event sequence as the golden files (PR #114).
- [x] B2 follow-up from the review of PR #114 = B2.1 (PR #115): 11 new scenarios, and the TS port agrees with all 24 (see "Result B2.1"). Two symbols and the top-up after a partial fill stay V2 (see "Not simulated").
- [ ] Bot defect found in B2.1: with a stops level larger than the TP or SL distance, the bot cancels and sends all orders in each loop (`2026-10-06-stops-level-order-flood.md`). A fix changes `grid_stops_level.json` and the TS port.
- [x] B4: `simBroker.bars()` builds all candles again from all ticks at each call. Done differently: a real run uses `TimeframeAggregator` (incremental, last 1,000 bars). `simBroker.bars()` stays for the parity scenarios (a few hundred ticks).
- [x] B4 (from B2.1): `simBroker.symbolInfoOf` uses the FakeMT5 default for a missing symbol field. In a real run, `snapshotSymbol` blocks the run (`run.symbolFieldMissing`).
- [x] B4 (from B2.1): the run log tells that rejects for the stops level and the freeze level are not simulated (`run.stopsLevelNotSimulated`, `run.rejectsNotSimulated`).
- [x] B4 (from B2.1): set `is_active: true` on the copy of the zone.
- [x] B3: engine port, fractal; all 14 fractal scenarios are equal to the golden files (PR #126, see "Result B3"). The plan said 5 scenarios, but before B3 there were 4.
- [x] B4: runner; hand-calculated cases (buy, sell, gap, swap with triple day, open loss at the end) agree; no event is skipped without a message (see "Result B4").
- [ ] B4, manual check on the VPS (DEMO, read only): list the distinct `swap_mode` values of the symbols from `GET /api/symbols` and compare them with the names of the MetaTrader5 constants (`SYMBOL_SWAP_MODE_*`). Only 0, 1 and 4 are accepted; the numbers of `SWAP_MODE_POINTS` and `SWAP_MODE_DEPOSIT` in `broker/costs.ts` must agree.
- [ ] B4: the engine is slow for a busy grid zone (0.4 ms per candle). A profile after the fast path in `pyRound` is not done. Measure 1 million candles and the memory in the real web worker (B5), before a decision to optimize `getAllRobotOrders`, `orderSend` (copies the order book for the recorder) or the log.
- [x] B5a: the web worker is not built by Next yet (no page uses `new Worker(new URL('…/backtest.worker.ts', import.meta.url))`). Check the build (Turbopack) and the import of `@/` aliases in the worker.
- [x] B5a: texts (tr/en/de) for the run log codes and the error codes (`run.*`); refuse netting accounts; show the pair of results of "both paths"; build the request headers with `getWorkerHeaders()` (X-API-Key and ngrok header) and the base address with `apiUrl('')`, because `RunRequest.headers` is a plain record and nothing forces it.
- [x] B5/B6: exact MFE/MAE from the simulator, and the `bars` message for chart display candles.
- [ ] B4 model limits, to show on the page: the bot runs at path points, after each fill or exit and at zone borders, not every second as live. Rules that depend on the wait time between two loops (the 30-s brake) use the simulated clock. Weekend swap only through the triple day. Samples of the equity are at the candle ends, so the max. drawdown inside a candle is not seen.
- [x] B5a: page `/backtest`, test button; no `POST /settings`; an old result never shows under a different account.
- [x] B6: chart; max. 50,000 displayed candles; replay does not show candles or trade events after its cursor.
- [ ] B7: more setups; a late run does not overwrite a different setup.
- [ ] B8: presets and "apply to zone"; the transfer stays unsaved; a new zone is inactive.
- [x] B9: CSV import; an aborted or wrong import cannot be selected (see "Result B9").
- [ ] B9, manual check on the VPS (DEMO): import one real M1 CSV of about 1 year, then read it with `GET /api/market/{id}/rates?source=csv:<id>`, and check the time zone offset against a candle that MT5 also has.
- [x] B5a done (moved): `CsvImportPanel` is on `/backtest`. B5b: add the selection "data source: MT5 server or CSV import" (only `committed` imports are in the list). Done in B5b.
- [ ] B9 (review, not done): the commit holds the database write lock while it parses and writes (up to 2 million rows); saving settings waits in that time. Use staging tables or write in parts if this shows on the VPS.
- [ ] B9 (review, not done): a fixed time offset cannot follow the summer time of a broker. A UTC file over several months is 1 hour off in half of the year; the grid check sees whole hours only. Add a plausibility check against the broker clock log, or an offset per range.
- [ ] B5 (review, not done): an abort during `POST /imports` leaves one unfinished entry (it can be deleted in the list). The text for `csv_gap` is done (B5b). The missing `account_id`, `server_now`, `offset_sec` in the CSV answer of `rates` are not needed by the run; add them with B6 if the chart shows CSV candles.
- [x] B4: the runner reads `rates?source=csv:<id>`. It has one timeframe only; higher timeframes come from the candles in the browser (`TimeframeAggregator`). The test of the job uses `source`.
- [ ] B5/B7: decide which KPIs of "Items from the first concept" (1–7) `computeStats` gets.
- [x] B9: define the accepted CSV formats (item 8 of "Items from the first concept"): header names or position, MT5 export with date and time apart, separators `,` `;` tab, UTF-8 or UTF-16, epoch seconds/milliseconds or text times (see "Result B9").
