---
date: 2026-10-02
type: plan
status: open
pr: [86, 87, 88, 89, 90, 91, 93, 94, 96, 98, 100, 101, 102]
features: [ZON-18, ENG-28, ANA-09, ANA-12]
areas: [frontend]
---

# Analyse page: next steps (statistics, backtest)

## Request

- 2026-10-01: an Analyse page with chart, statistics and backtest. The rules are in `docs/analyse-regeln.md` (time, data completeness, key figures §4, simulation model).
- 2026-10-02 (approved plan): more fractal setups in one zone (PR A), and a statistics tab with a split for each setup (PR B).

## Status

| Step | Content | State |
|---|---|---|
| 0, 0b, 1–5 | Rules, fixed magic, page shell, database, chart tab, golden scenarios, trades and archive | done (PR #86–#98) |
| PR A | More fractal setups in one zone (ZON-18, ENG-28) | done (PR #100, live test #101, follow-up fix #102) |
| 6 = PR B | Statistics tab (ANA-09, ANA-12) | **next** |
| 7 | Bot logic in the browser (`frontend_nextjs/src/lib/backtest/engine/`) | open |
| 8 | Backtest runner, CSV import with checks | open |
| 9 | Backtest tab | open |

ANA-09 and ANA-12 are not in `docs/features/features.yaml` yet. PR B adds them.

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

- [ ] Step 6 (PR B): statistics tab.
- [ ] Step 7: bot logic in the browser. The event sequence must be equal to the golden scenarios.
- [ ] Step 8: backtest runner. No event is skipped without a message. An aborted import cannot be used.
- [ ] Step 9: backtest tab. The real zone is never saved. An old result never shows under a different account.
- [ ] The zone registry of the DEMO account is empty until somebody saves its zones one time. Until then, all trades show "zone unknown".
- [ ] Observation (2026-10-02): `/api/logs` requests waited up to 15 s while a long `/rates` fetch from MT5 ran. The cause is not known.
- [ ] Manual tests that are still open: see `docs/features/FEATURES.md` (`scripts/features/run.sh next`).
