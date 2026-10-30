---
date: 2026-10-30
author: Codex
type: feature
status: done
pr: [241]
features: [ANA-16, ANA-17, ANA-18, ANA-19]
areas: [frontend, tests, docs]
---

# Shared charts and free broker symbols

## Request
- Implement the approved chart workspace design.
- Save the reset appearance and view for each chart product on `/chart`.
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
| `ChartCore.tsx`, `ChartWorkspace.tsx`, `SettingsDialog.tsx` | Save appearance and visible bar range per chart context. Restore the range when a product returns. |
| `ChartCore.tsx`, `BacktestChart.tsx`, `FormationChart.tsx` | Adapters keep existing zones, trades and the system RSI independent. |

## Why
The built-in TradingView RSI uses Wilder averages. A plain SMA of gains and losses gives different values.
EWO uses SMA(5) minus SMA(35). Its percentage mode divides the result by the closing price.
The drawing extension is a third-party package. It does not provide TradingView Advanced Charts or Pine execution.
Each document key includes source, view, mode, account and actual symbol. Backtests also include their result context.
The chart reset view can include the full data range. Restore it with `fitContent()` so the chart does not clamp the first bars.
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
| Per-product appearance and view | `E2E_PORT=3361 scripts/features/run.sh e2e ANA-19`: 8 passed. The test resets appearance, fits the chart, switches symbols, returns, and reloads. |
| Feature catalog | `scripts/features/run.sh check`: 190 features valid. Generated report: 186/190 checked, no failed feature. Remaining checks require separate live/manual verification. |
| GitHub verification | The complete worker, catalog and frontend jobs are recorded per revision in [PR #241 checks](https://github.com/halilesmer/auto-grid-nextJs/pull/241/checks). This is the publication check record. |
| Hosted preview | Vercel reports a successful deployment. An independent HTTPS request reaches Vercel authentication; public page-content verification is blocked by preview protection. No protection setting was changed. |
| Test server isolation | One early manual server start inherited the local SSH setting. Later starts explicitly cleared `VPS_SSH_HOST`; no trading test ran. |
| Preview persistence | Appearance and overlay transactions keep their previous persisted state until Apply. Focused reload check added. |
| Formation switching | A new regression test reproduced `Value is null` after the parent removed the previous chart. Bindings now expose disposal state, effects reject obsolete bindings, and both scheduled redraw frames are cancelled. The final 14 drawing/formation checks passed. |
| Local image storage | Import places the image immediately at the pane centre. The test now checks the actual placement contract, metadata separation, delete/undo and restored objects after chart readiness. Passed. |
| Image cold-cache race | The first GitHub run passed 1,614 browser checks and retried the image check once. A local repeat reproduced four failures in 20 runs; delayed decoding reproduced it directly. The drawing library's default image reader rejects uncached names and removes their drawings before the host preload finishes. Register `setImageReader` against validated local image bytes before importing drawings. The regression now delays native image decoding by 500 ms. |
| Image correction evidence | Fresh production build, TypeScript and ESLint passed. The delayed image test then passed all 20 repetitions without retries (`--repeat-each=20 --workers=4`, 27.6 seconds). |
| RSI axis switching | A separate pixel check keeps the overbought fill within the upper portion of the 0..100 RSI pane after moving the axis left. Passed; no further chart change was needed. |
| Old setup links | A regression test reproduced a switch to free mode after changing accounts from a legacy `zone=` URL. Account changes now preserve the resolved setup mode while discarding the old account's zone. Fresh build, TypeScript, ESLint and all 15 affected account/link/stream checks passed. |
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
- [x] Open PR #241 to `main`.
- [x] Link the per-revision GitHub checks and record the protected preview verification boundary.

## Lessons
Keep chart cleanup explicit. The parent can remove its chart before child effects release series and drawing subscriptions.
Cache drawing input bars when candle data changes. Do not copy 100,000 candles on pointer movement.
Preserve original pane geometry when adding chart controls over an existing full-page view.
