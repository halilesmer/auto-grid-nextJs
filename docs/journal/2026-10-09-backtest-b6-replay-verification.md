---
date: 2026-10-09
author: Codex
type: fix
status: done
pr: [139]
features: [BKT-07]
areas: [frontend, tests, docs]
---

# Verify chart and preserve replay boundaries

## Request

- Complete B6/BKT-07 with automated coverage and a PR to main.
- Use synthetic or mocked annual data. Do not claim a VPS annual check.
- Do not change real accounts, setups, bots, or orders.

## Cause

| Finding | Evidence | Cause |
|---|---|---|
| A trade at the next candle's open appeared during replay. | The first candle showed two rows instead of one. | Trades and curves accepted events at the exclusive end with `<=`. |
| A timeframe change revealed all trades and end results. | The M5 switch showed three rows instead of one. | The selector cleared replay state. Missing chart data also made the local cursor `null`. |
| Initial spread was missing from MAE. | Buy and sell tests gave 0.1 instead of the hand-calculated 0.2. | `PathBroker.register` started extrema at the entry price and omitted the opposite quote. |
| Plan status was stale. | GitHub confirms PR #123 and PR #136 are merged. | The plan still listed the order flood as open and B7/B8 as implemented only. |

## Solution

| File | Change |
|---|---|
| `BacktestChart.tsx` | Keep an absolute replay end across timeframe changes and loading. Only completed candles and earlier events appear. |
| `BacktestChart.tsx`, `backtest.ts`, `hints.ts` | Add an explicit End replay button with texts and tooltips in three languages. |
| `ChartCore.tsx` | Record the last balance and equity points alongside existing chart diagnostics for browser assertions. |
| `pathBroker.ts` | Start excursion tracking with the liquidation quote at entry. Keep buy/sell tick values and spread in the hand-calculated checks. |
| `backtest-chart-lib.spec.ts` | Cover 525,600 synthetic M1 candles, complete aggregation, missing ranges, buy/sell excursions, and stale message rejection. |
| `backtest-chart-worker.spec.ts` | Run the real browser Web Worker over a mocked calendar year with pagination and a known missing day. |
| `backtest-replay.spec.ts` | Cover exclusive events and curves, hidden end results and comparison, timeframe changes, speeds, pause, restart, and replay exit. |
| `features.yaml` | Describe the automated annual test scope and replay behavior. |
| `2026-10-06-backtest-module-plan.md` | Correct B1 history, the resolved order flood, and merged B7/B8 status. CSV chart data needs no new response metadata. |

## Why

The replay end is a time, not a candle index. A different display timeframe must not change which events the user knows.

An explicit exit restores the complete result. A timeframe change pauses playback and preserves the time boundary during loading.

The initial opposite quote belongs to the held position's path. Otherwise an immediate favorable movement can hide the entry spread from MAE.

## Verification

| Check | Result |
|---|---|
| Initial BKT-07 regression | Buy/sell MAE and the exclusive trade boundary failed before their repairs. The timeframe case failed after the first repairs. |
| Negative control | Temporary wrong speeds, a 60,000 candle limit, removed missing ranges, and removed message guards caused nine failures. All mutations were restored. |
| `scripts/features/run.sh` | Unit: 452 passed. API: 231 passed. Initial browser run: 477 passed, 12 timeouts. The two-worker browser repeat passed all twelve cases, with 488 passed and one tooltip hover failure. |
| `scripts/features/run.sh e2e 'BKT-07\|UI-07'` | 34 passed, including all 16 BKT-07 cases, the fixed 2025 annual range and the previously failing German tooltip. No test was weakened or skipped. |
| `PLAYWRIGHT_JSON_OUTPUT_NAME='../.feature-results/e2e.json' npx playwright test --project=mocked --workers=2 --reporter=list,json` | Final full browser suite: 489 passed in 3.7 minutes. `scripts/features/run.sh render` imported this report and refreshed the generated catalog. |
| Visual review | Desktop 1280px and mobile 375px screenshots inspected in light and dark themes. Replay controls remain visible without page overflow. |
| `scripts/features/run.sh check`, `git diff --check` | Feature catalog valid (157 features); no whitespace errors. |
| `npm run lint`, `npx tsc --noEmit` | Passed after the replay and excursion repairs. |
| `pyright` | 33 errors in the unchanged Python files. No worker file or Python configuration changed. |
| Initial test build | Turbopack failed on process/port permissions. A fresh generated cache with approved execution recovered the build. |
| Test setup correction | Speed tests needed tab selectors and a fixed future pause time. The yearly H1 view includes past candles outside the clipped M1 window. |

## Limits

| Check | Scope |
|---|---|
| Annual data | Synthetic 525,600-minute input and a mocked calendar-year HTTP feed. No VPS annual check. |
| Annual Web Worker | A setup outside the synthetic price range checks loading and chart storage. It does not measure busy-grid performance. |
| MFE/MAE | Exact within the simulated price path, including spread. It does not establish tick-exact market excursions. |
| VPS | No worker start, deployment, real CSV import, or live account changes. Existing B4/B9 live checks remain open in the plan. |

## Lessons

Use an exclusive replay end for all event consumers. Preserve it when chart data is temporarily unavailable.

Test entry spread before the first subsequent quote. Buy and sell need separate cases because they close on different quotes.
