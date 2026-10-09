---
date: 2026-10-08
author: Codex
type: feature
status: done
pr: [136]
features: [BKT-08, BKT-13]
areas: [frontend, docs]
---

# Compare independent backtest setups

## Request

| Item | Scope |
|---|---|
| Development | Implement B7 after B6. This implementation is Codex work. |
| Verification | Keep the user's existing preference: do not add or run tests. Use TypeScript and ESLint checks. |
| Excluded | B8 presets and transfer to real zones. No VPS checks or branch deletion. |

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/src/store/useBacktestStore.ts` | Stores up to six local setup copies with separate forms, periods, run contexts, results, errors, and chart requests. Enforces two concurrent runs. |
| `frontend_nextjs/src/hooks/useBacktestRun.ts` | Owns one worker per setup. Cancels and releases workers after removal, edits, account changes, and page exit. |
| `frontend_nextjs/src/components/backtest/BacktestView.tsx` | Adds a saved setup or an empty setup. Selects independent run settings and results. Reads the zone-button handoff. |
| `frontend_nextjs/src/components/backtest/SetupCards.tsx` | Shows parameter and status badges. Selects, duplicates, edits, and removes copies. |
| `frontend_nextjs/src/components/backtest/SetupEditor.tsx` | Edits symbol and zone fields in a local dialog. Applying changes clears the previous result. |
| `frontend_nextjs/src/components/zone/ZoneFieldsEditor.tsx` | Shares the existing field components, lot normalization, precision handling, and loss-distance conversion with `ZoneCard.tsx`. |
| `frontend_nextjs/src/components/backtest/SetupComparison.tsx` | Compares existing `computeStats` metrics and run summaries. Includes data source and period snapshots, plus setup, weekday, and hour breakdowns. |
| `frontend_nextjs/src/components/backtest/EquityOverlay.tsx` | Shows selected equity curves with setup colours and different line styles for alternative candle paths. |
| `frontend_nextjs/src/lib/backtest/comparison.ts` | Checks aggregation eligibility and sums independent equity curves without using future samples. |
| `frontend_nextjs/src/components/backtest/BacktestChart.tsx` | Reads chart data for its own setup. Result views remount when the setup or run changes. |
| `frontend_nextjs/src/i18n/messages/backtest.ts`, `hints.ts` | Adds Turkish, English, and German labels and tooltips. |

## Why

Each setup has a stable browser ID. Run IDs increase across the whole session and are never reused after cancellation.
A worker message must match both its setup and its current run. Chart responses must also match the latest request.
The store enforces the run limit synchronously, so rapid clicks cannot start a third run.

An account change retains setup parameters but clears all run state. It resets account-specific commissions and CSV selections.
Results are also gated by the account during render, before effect cleanup runs.
Editing a running setup is disabled. Duplicates copy parameters only and can run independently.

The source selector chooses the template for the Add action. Setup cards select the local copy being tested.
The dialog edits zone fields; the existing page controls edit the selected copy's period, costs, data, and model.
The session is held in memory. A full browser reload does not restore drafts or results.

The comparison uses the existing KPI definitions. The proposed additional KPIs from the first concept remain outside B7.
Realized drawdown and equity drawdown stay separate. Alternative candle paths have separate comparison columns.
The comparison hides during replay, so it cannot reveal the final metrics or future equity of the selected result.
Weekday and hour breakdowns use one selected result, so alternative paths never mix their trades.

Aggregation requires at least two different setups, identical start and end times, and the same known account currency.
Only one candle path per setup can contribute. The sum includes each setup's own start capital.
It does not simulate shared margin or a portfolio. Between samples, the sum uses the last known equity value.
The existing sampled equity curves can omit intermediate changes. The UI states this limitation.
Monetary overlays also require the same known currency.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` in `frontend_nextjs` | Passed after implementation. |
| `npm run lint` in `frontend_nextjs` | Passed. Changed files were checked again after final edits. |
| `git diff --check` | Passed. |
| Automated tests | Not added or run, as requested by the user. |
| Browser, real workers, and mobile layout | Not verified at runtime. |
| VPS | Not accessed. |

## Lessons

A completed worker still owns candle data for replay. Release it when a result becomes invalid, not only during an active run.
Do not sum two candle paths of the same setup: they describe alternative outcomes of one allocation.

## Follow-up authorization (2026-10-09)

The user requested tests, merge, and deployment. This supersedes the earlier no-tests instruction.
Verification and CI fixes are recorded in `2026-10-09-backtest-b7-b8-verification.md`.
