---
date: 2026-11-07
author: Claude
type: plan
status: open
pr: [434]
features: [BKT-05, ANA-04, ANA-07, ACC-05, USR-04, ANA-26, ANA-27]
areas: [worker, frontend, docs]
---

# Plan 1107-A4: one year of history in the chart

The project owner approved this plan on 2026-11-07. The plan has five steps. Each step runs in its own session and its own PR. This entry stores the approved plan. The entries of the single steps (for example `2026-11-07-csv-imports-per-server.md`) store what happened.

## Request
The project owner wants one year of history in the free chart mode on every timeframe from M1 to MN.

## Findings
A measurement on a DEMO account (symbol USOUSD, market closed) gave these facts:

- MT5 returns one year of M1 candles. The terminal setting "Max bars in chart" is "Unlimited".
- Two sample days were complete on three symbols. The candles equal the CSV export of the project owner.
- The worker has no data gap. The CSV path is not necessary for this goal.
- The chart side lacks two things:
  1. W1 and MN do not exist. The worker table `TIMEFRAMES` and the chart list know only M1 to D1.
  2. The chart draws at most `MAX_CHART_BARS = 100_000` candles in one view. One year of M1 has about 360 000 candles. The chart loads only the end of a longer range (`clipped`). There is no way to load older candles later.
- A separate session changes the database limit from 5 GB to 10 GB. That work does not share files with this plan.

## Decisions

| Code | Decision |
|---|---|
| 1107-A4.1 | The scope is the free chart mode (`FreeChartPanel`) only. Setup mode and formation mode do not change. Trade markers in setup mode must sit on a candle time. W1 and MN need an alignment job of their own. |
| 1107-A4.2 | The browser builds W1 and MN from D1 candles. The worker does not change. The week starts on Sunday 00:00 broker time. The month starts on the 1st at 00:00 broker time. Variable month length does not fit the fixed-second logic of the worker. |
| 1107-A4.3 | Loading older candles stays inside the selected range. With "All" selected there is no limit: the chart loads back to the start of the MT5 history. |
| 1107-A4.4 | The total limit is 400 000 candles. The first load stays at 100 000 candles at most. Pages of 50 000 candles come when the user scrolls left. Step S2 measures the time of one page. If a page takes more than 1 second at 400 000 candles, the limit goes down. The journal then states the reason. Result of S2: the limit is 240 000 candles in pages of 20 000 (`2026-11-07-chart-older-candles.md`). |
| 1107-A6.1 | The key of MT5 candles, tick spread, tick replay, symbol information and the broker clock offset stays the MT5 server (`source`). These data stay after an account delete. Each account on the same server shares them. Demo servers and live servers stay apart. |
| 1107-A6.2 | A CSV import belongs to the MT5 server of the account that uploaded it. Each user with an account on that server sees and uses the import. The admin sees all imports. |
| 1107-A5.2 | A new import that overlaps an old import does not delete the old import. The old option `replace` goes away. Each import keeps all of its own candles. A read joins all imports of the same server, symbol and timeframe. The oldest import wins a minute that two imports hold. The source `csv:<id>` reads the whole series. Old presets stay valid. |
| 1107-A6.3 | An account delete removes only the account record. The deal archive, the account information, the backtest reports, the CSV imports and the favorites stay. The same account id gets its data back. |
| 1107-A7.1 | Only the admin can delete an import by hand. The confirm dialog says that the delete is permanent. Other users do not see the button. |

## Steps

| Step | Model | Level | Content |
|---|---|---|---|
| S0 | Sonnet | medium | Design of four visual items as an Artifact. The project owner approved it. |
| SW | Sonnet | high | Data persistence: migration on the live database, access rule change, security review. |
| S1 | Sonnet | medium | W1 and MN in the free mode (`ANA-26`). |
| S2 | Sonnet | high | Load older candles on M1 (`ANA-27`). The chart view alignment (`fittedKey`, `rememberChartView`) broke before. |
| S3 | Sonnet | low | Read-only live check on the DEMO account. |

Order: S0, SW, S1, S2, S3. SW, S1 and S2 touch common files (`features.yaml`, `FEATURES.md`, `hints.ts`). They do not run at the same time.

### SW data persistence
- Migration: `csv_imports.server`. The migration fills the server from `configs/accounts.json`. An import without an account keeps `NULL`. Only the admin sees it.
- `csv_import.commit` never deletes an import. `get_rates` joins the series.
- Endpoints check the server of the import against the server of the account. A mismatch gives 404. `DELETE` needs the admin.
- `market_db.delete_account` stops deleting. The favorites file stays.
- Frontend: one row per series, a files list, an extend warning, a delete confirm for the admin only.
- Done when: `precheck.sh` is green, the security review has no open finding, and the PR is in auto-merge.
- Check after the merge (read-only): `GET /api/market/<account>/imports` lists the existing imports with their server, and `GET /rates?source=csv:<id>` returns 1 380 candles for 2025-11-10.

### S1 W1 and MN
- New `ChartTimeframe = Timeframe | 'W1' | 'MN'` and `dataTimeframeOf` (W1 and MN map to D1).
- New `lib/analysis/calendarBars.ts` with `weekStart`, `weeklyFromDaily`, `monthStart`, `monthlyFromDaily` and `barEnd`.
- `FreeChartPanel` requests D1 for W1 and MN. The request start aligns to the period start. The live D1 candle joins the last week or month.
- The trend path does not exist on W1 and MN.
- Tests: logic tests without a page, and a page test `@ANA-26`.

### S2 Load older candles on M1
- `useMarketRates.loadOlder()` requests one worker page and prepends it. `hasOlder` and `loadingOlder` join the state.
- `mergeHead` and `MAX_TOTAL_BARS = 400_000` join `candles.ts`.
- `ChartCore` shifts the visible logical range by the number of added points. At 50 candles from the left edge it calls `onNeedOlder`.
- The banner and the edge hints get the approved texts.
- Tests: `mergeHead` logic test, page test `@ANA-27`, and a performance measurement with 360 000 fake M1 candles.

### S3 Live check
- Free mode, USOUSD, "Last 12 months", M1: scroll left to 2025-11. `missing` is empty and the view does not jump.
- W1 and MN: compare the open, high, low and close of the last 3 weeks and 3 months with the MT5 terminal. If the broker starts the week on Monday, evaluate "variant B" of the formation journal again.
- Sign `ANA-26` and `ANA-27`.

## Open points
- [ ] SW: merged and checked on the VPS (read-only).
- [ ] S1: W1 and MN.
- [ ] S2: load older candles.
- [x] S3: live check and signatures. `ANA-27` signed. `ANA-26` stays open until the owner checks the MT5 week start (Sunday or Monday) and the W1/MN values; the worker serves no W1 or MN, so only MT5 can answer this. See `2026-11-07-chart-older-candles.md`.
