---
date: 2026-11-01
author: Claude
type: fix
status: done
pr: []
features: [BKT-04, BKT-10, BKT-14]
areas: [frontend]
---

# Backtest: required notes, spread history, drawdown start, live period

## Request
Fix four findings of an external error search on `/backtest` (package 3): B7, B4, B8, B6.

## Cause
- B7: `RunLog.add()` drops lines after 2000. `run.spreadFallback` is added after the simulation, and the notes block reads only the kept lines. After 4500 trades the counter was 1 but the line was missing.
- B4: live, the relative spread guard keeps one learning history per symbol for all zones. The run calculates one setup alone, so limits can differ.
- B8: `drawdownCurve()` started its peak at the first equity point, not at the start capital. Start 1000, equity 900: summary 100, chart 0.
- B6: `read_deals()` also returns the earlier part of open positions. `LiveCompareSection` took every paired trade. Period [t+120, t+240) with exits at t+60 and t+180 gave 2 trades, net 10 instead of 1 trade, net 5.

## Solution
| File | Change |
|---|---|
| `runContext.ts` | `run.*` lines are never dropped by the line limit (only the runner writes them; the engine writes none) |
| `spreadHistoryNote.ts`, `BacktestView.tsx`, `protocol.ts`, `runJob.ts` | New note `run.spreadHistoryShared` when the tested setup and another setup or saved zone (active or not; the worker learns from all) of the same symbol use the relative guard. Passed as `RunParams.notes` into `RunInput.notes` |
| `curves.ts`, `RunResultView.tsx` | `drawdownCurve(points, startPeak)`; the backtest chart passes the start capital. `StatsTab` keeps the old behaviour |
| `liveCompare.ts`, `LiveCompareSection.tsx` | `pairLive()` pairs first, then keeps trades with `from <= exitTime < to`; entries stay. Display and saved report use the same data |
| `i18n/messages/backtest.ts` | Text for the new note in tr, en, de |

## Why
- No joint simulation of all setups: the owner chose a note. Zones with the same id count once, because live there is one zone.
- `SetupComparison` and `EquityOverlay` show `summary.maxDrawdown` or equity, not the drawdown curve. They need no change.

## Verification
See the PR description (commands and numbers).
