---
date: 2026-10-30
author: Codex
type: feature
status: open
pr: []
features: [ANA-16, ANA-17, ANA-18, ANA-19]
areas: [frontend, tests, docs]
---

# Shared charts and free broker symbols

## Request
- Implement the approved chart workspace design.
- Add free broker symbol selection without a setup or running bot.
- Add drawing tools, configurable standard indicators, RSI and EWO.
- Keep broker time, data warnings and existing trading behavior.

## Solution
| File | Change |
|---|---|
| `chart-workspace/ChartWorkspace.tsx` | Shared controls, drawing objects, history and replay visibility. |
| `chart-workspace/FreeChartPanel.tsx` | Authenticated broker symbol lookup and periodic market data requests. |
| `chart-workspace/indicators.ts` | Linear-time indicator calculations, gap resets and confirmed higher timeframe aggregation. |
| `chart-workspace/runtime.ts` | Public Lightweight Charts APIs for appearance and independent indicator panes. |
| `useAnalysisPrefsStore.ts` | Keep overlay previews out of persisted preferences until Apply. |
| `docs/chart-workspace.md` | Complete setting-to-effect mapping and supported indicator behavior. |
| `useChartWorkspaceStore.ts` | Versioned browser preferences, templates and context-specific documents. Image bytes use separate local storage entries. |
| `ChartCore.tsx`, `BacktestChart.tsx`, `FormationChart.tsx` | Adapters keep existing zones, trades and the system RSI independent. |

## Why
The built-in TradingView RSI uses Wilder averages. A plain SMA of gains and losses gives different values.
EWO uses SMA(5) minus SMA(35). Its percentage mode divides the result by the closing price.
The drawing extension is a third-party package. It does not provide TradingView Advanced Charts or Pine execution.
Each document key includes source, view, mode, account and actual symbol. Backtests also include their result context.
Replay hides future drawing anchors without changing saved user visibility flags.
Confirmed higher timeframe values appear at their last constituent candle, after the higher candle closes.

## Verification
| Check | Result |
|---|---|
| `npx tsc --noEmit` and `npm run lint` | Passed on the final source before publication. |
| `next build --webpack` with synthetic mocked-worker configuration | Passed, including TypeScript and static generation. |
| Indicator and settings calculation tests | Four reference tests passed on the first run. |
| Free chart, settings rollback, saved indicator selection | Three browser tests passed. |
| Combined regression run | 54 passed; five failures. Two tests needed explicit setup context or the free-chart clock badge. Three found a formation layout regression. |
| Formation layout regression | Fixed the root positioning and preserved the existing main-pane stretch factor. The focused run passed all 31 tests. |
| Full mocked browser run | 1,534 passed. One tooltip assertion matched the new translated tool options as well as the intended field. Its locator now uses exact text. |
| Final affected browser run | `E2E_PORT=3325 scripts/features/run.sh e2e 'ANA\|@UI-07\|@BKT-07\|@FRM-2'`: 147 passed in 1.6 minutes on the final production build. Includes the added formation switching and image checks. |
| Feature catalog | `scripts/features/run.sh check`: 190 features valid. Generated report: 186/190 checked, no failed feature. Remaining checks require separate live/manual verification. |
| Test server isolation | One early manual server start inherited the local SSH setting. Later starts explicitly cleared `VPS_SSH_HOST`; no trading test ran. |
| Preview persistence | Appearance and overlay transactions keep their previous persisted state until Apply. Focused reload check added. |
| Formation switching | A new regression test reproduced `Value is null` after the parent removed the previous chart. Bindings now expose disposal state, effects reject obsolete bindings, and both scheduled redraw frames are cancelled. The final 14 drawing/formation checks passed. |
| Local image storage | Import places the image immediately at the pane centre. The test now checks the actual placement contract, metadata separation, delete/undo and restored objects after chart readiness. Passed. |
| Live worker and trading | Not run. No live trade tests are authorized. |

## Performance comparison

| Item | Result |
|---|---|
| Method | Isolated production-mode bundles of baseline `ef80141` and the new `ChartCore`; same browser, CSS and 100,000 synthetic candles. |
| Runs | One warm-up per variant, then two measured runs each. |
| Baseline | RSI pane; initial rendering 437 and 450 ms. |
| New workspace | RSI, smoothing, gradient fills, EWO and drawing controls; initial rendering 1,662 and 1,587 ms. |
| Mouse events | 90 moves per run. New mean frame time 16.5–16.6 ms; baseline 17.4–17.7 ms. |
| Canvas identity | All existing canvas nodes stayed connected in every run. No browser errors. |
| Limit | Local measurements, with additional displays enabled. They are not a cross-device performance guarantee. |

## Review

| Area | Result |
|---|---|
| Data flow | Existing authenticated market APIs. Broker names retain their actual case. No setup fetch in free mode. |
| Context isolation | Source, mode, account, symbol and result-specific tests; CSV source belongs to the backtest input snapshot. |
| Time | Broker-time anchors, replay masks, gap resets and delayed higher-timeframe publication checked. |
| Cleanup | Explicit disposal before chart removal; callbacks reject obsolete managers. Local images remain available for undo. |
| UI | Desktop/mobile screenshots checked. Native fullscreen keeps settings dialogs inside the fullscreen element. |
| Scope | No worker, authentication, trading engine or version-file changes. |
| Dependency | This branch contains the open formation work from PR #240. Merge that dependency first. |

## Open points
- [x] Run the full mocked suite and repair the identified regressions.
- [x] Review responsive screenshots, persistence boundaries and the final diff against `hooks/RULES.md` section 9.
- [ ] Open the PR and record its checks.

## Lessons
Keep chart cleanup explicit. The parent can remove its chart before child effects release series and drawing subscriptions.
Cache drawing input bars when candle data changes. Do not copy 100,000 candles on pointer movement.
Preserve original pane geometry when adding chart controls over an existing full-page view.
