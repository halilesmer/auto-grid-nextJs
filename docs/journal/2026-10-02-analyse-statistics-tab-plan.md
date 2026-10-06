---
date: 2026-10-02
type: plan
status: open
pr: [86, 87, 88, 89, 90, 91, 93, 94, 96, 98, 100, 101, 102, 108, 109]
features: [ZON-18, ENG-28, ANA-09, ANA-12]
areas: [frontend]
---

# Analyse page: next steps (statistics, backtest)

## Request

- 2026-10-01: an Analyse page with chart, statistics and backtest. The rules are in `docs/analyse-regeln.md` (time, data completeness, key figures §4, simulation model).
- 2026-10-02 (approved plan): more fractal setups in one zone (PR A), and a statistics tab with a split for each setup (PR B).
- 2026-10-06 (decisions for PR B): the user selects the scope: the whole account, one zone with all setups, or one setup of a zone. MFE/MAE (ANA-12) moves to a separate PR.
- 2026-10-06 (decisions for step 6b): one trade table (`TradesTable`) in both tabs, at the bottom of the statistics tab and in the chart tab. One button computes MFE/MAE for all trades in the table. Values in points and in account currency.

## Status

| Step | Content | State |
|---|---|---|
| 0, 0b, 1–5 | Rules, fixed magic, page shell, database, chart tab, golden scenarios, trades and archive | done (PR #86–#98) |
| PR A | More fractal setups in one zone (ZON-18, ENG-28) | done (PR #100, live test #101, follow-up fix #102) |
| 6 = PR B | Statistics tab (ANA-09) | done (PR #108, live check on DEMO passed) |
| 6b | MFE/MAE (ANA-12) | done (PR #109), live check open |
| 7 | Bot logic in the browser (`frontend_nextjs/src/lib/backtest/engine/`) | open |
| 8 | Backtest runner, CSV import with checks | open |
| 9 | Backtest tab | open |

ANA-09 (PR #108) and ANA-12 (PR #109) are in `docs/features/features.yaml`.

## Solution (plan for PR B)

PR B replaces the placeholder in `frontend_nextjs/src/app/chart/page.tsx` (`tab === 'stats'`). Data: `useDealsHistory` and `pairTrades` (`tradePairing.ts`). For filters, weekday and hour, use the close time (MT5 time). Trades that opened before the period count, with a mark. "Zone unknown" stays unknown.

| Part | File | Content |
|---|---|---|
| Key figures | `src/lib/analysis/stats.ts` | Trades, positions (unique `positionId`), win rate, net (profit + commission + swap + fee), gross profit and loss, profit factor ("—" if there is no loss), average trade, largest win and loss, grid cycles (TP closes), max. drawdown of the realized curve |
| Curves | `src/lib/analysis/curves.ts` | Realized profit (account, zone or setup). Balance, calculated back from today, only if the archive has no gap up to now; else hidden, with the reason. Drawdown. No equity curve for real accounts (MT5 has no history): note "backtest only". |
| Groups | `src/lib/analysis/groupings.ts` | For each zone (zone registry), setup (sid from the order comment; "no setup"; "setup k (deleted)"), weekday and hour; cycles per day |
| MFE/MAE | `src/lib/analysis/excursions.ts` | From M1 candles between the entry candle and the exit candle. The value is a lower limit ("estimated"). Missing candles: "cannot be calculated", never 0. Load only on request. |
| UI | `src/components/analysis/` | `StatsTab`, `StatsKpis` (`data-testid="stat-*"`), `CurvePanel`, `BreakdownTable` (zone, setup, weekday, hour), `TradesTable` with setup and MFE/MAE columns, `DataQualityBanner` |

Acceptance: missing data never gives wrong numbers (the curve is off, with the reason). Hand-calculated cases agree.

Tests: catalog entries ANA-09 (statistics, curves, split for each setup) and ANA-12 (MFE/MAE). `e2e/mocked/analysis-stats-lib.spec.ts` with hand-calculated cases. `e2e/mocked/analysis-stats.spec.ts` with tag `@ANA-09`.

## Open points

- [x] Step 6 (PR B): statistics tab (PR #108). Live check on DEMO, 2026-10-06, read only: the net value and the trade count for one zone and for the whole account are equal to a separate calculation from the raw `/deals` response.
- [x] Step 6b: MFE/MAE (ANA-12), with the setup and MFE/MAE columns in `TradesTable` (PR #109). Rule in `docs/analyse-regeln.md` §4.
  - Lower limit: only the M1 candles strictly between the entry candle and the exit candle count, plus the entry and exit price. SELL uses Ask = Bid + candle spread.
  - Money comes from the trade itself (profit ÷ price distance). This needs no new symbol values (tick value) from the worker.
  - M1 loads once for each symbol, only on the button, newest trades first, at most 100,000 M1 candles. Older trades stay open; a second press loads them.
  - Missing candles, a missing entry, a SELL candle without spread or a trade open for more than 100,000 minutes: "cannot be calculated", never 0.
  - A gap only because the account is busy (or an MT5 error) is temporary: the trade stays open for the next press. Symbols load one after the other, because the worker reads only one range from MT5 at a time (`market_sync._FETCH_SLOT`, 30 s wait). Parallel requests came back as "busy" (review finding).
  - Open: live check on DEMO (read only) and the manual test of ANA-12.
- [ ] Step 7: bot logic in the browser. The event sequence must be equal to the golden scenarios.
- [ ] Step 8: backtest runner. No event is skipped without a message. An aborted import cannot be used.
- [ ] Step 9: backtest tab. The real zone is never saved. An old result never shows under a different account.
- [x] The zone registry of the DEMO account has entries since 2026-10-02. Trades that opened before the registry entry stay "zone unknown" (by design). On 2026-10-06 this was most trades of the last 30 days.
- [ ] Observation (2026-10-02): `/api/logs` requests waited up to 15 s while a long `/rates` fetch from MT5 ran. The cause is not known.
- [ ] Manual tests that are still open: see `docs/features/FEATURES.md` (`scripts/features/run.sh next`).
