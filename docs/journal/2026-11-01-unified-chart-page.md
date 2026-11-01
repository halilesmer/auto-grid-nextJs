---
date: 2026-11-01
author: Claude
type: plan
status: open
pr: []
features: [MET-02, UI-06, ANA-21, UI-10]
areas: [frontend, docs]
---

# One chart page for all chart views

## Request
The user wants one candle chart. It must look the same on all pages and contain all its settings. No chart setting stays above or below the chart. The reference is `/formasyon`: the chart fills the page.

## Current state

| Place | Engine | Layout | Controls outside the chart |
|---|---|---|---|
| `/formasyon` | Own `createChart` in `FormationChart.tsx` | Full page (`overlayLayout`) | None |
| `/chart` free | `ChartCore` | Page with title and card | Account, mode, range, symbol, timeframe |
| `/chart` setup | `ChartCore` | Page with title, card, `ChartFrame` | Same as free, plus setup, legend switches, live stats, zone card, notes |
| `/backtest` | `ChartCore` | Card in the result | Timeframe, replay, speed |

The `Trend` button is missing on `/formasyon` and `/backtest`. Only the two `/chart` panels pass `toolbarActions`. `CurveChart.tsx` is not a candle chart and stays as it is.

## Decisions

| Topic | Decision |
|---|---|
| Engine | `ChartCore` is the only place with `createChart` for candles. |
| Page | A new component `ChartPage` comes from `formasyon/page.tsx`. `/chart` and `/backtest` use it. |
| Top bar | It holds account, symbol, mode, setup, timeframe and range. The second row holds the controls of the page: formations, legend switches or replay. |
| Floating card | `FormationDetailsPanel` becomes general. It holds the zone card, live stats, trades and the backtest figures. |
| Warnings | They float on the chart. The data quality warning stays visible (`docs/analyse-regeln.md` §3, §7). |
| Statistics | The statistics view stays a normal page. A switch in the top bar opens it. |
| Backtest | Input and report stay a normal page. The chart opens as a full page. A switch selects the run for "both paths". |
| System RSI | The RSI(7) of the formations stays, because the detection reads it. |

Approved design: https://claude.ai/artifact/4mXjBGcm6mby1MNghnMT4x

## Steps

Each step is one PR. The steps run in sequence because they change the same files. Structure comes before behavior.

| Step | Content | Status |
|---|---|---|
| S0 | Design | Approved on 2026-11-01 |
| S1 | Remove `ChartViewer.tsx` and the code that only it used | This entry |
| S2 | `FormationChart` runs on `ChartCore`, with slots instead of flags. A check blocks other `createChart` calls. | Open |
| S3 | Extract `ChartPage` and a general `ChartPanel`. `/formasyon` shows no visible change. | Open |
| S4 | `/chart` moves into `ChartPage`. `ChartFrame` and the page title go. | Open |
| S5 | `/backtest` moves into `ChartPage`. Remove `overlayLayout`. | Open |
| S6 | `TrendToggle` moves into `ChartWorkspace`, so all pages have the same buttons. | Open |

## Why
- `FormationChart` and `ChartCore` repeat the chart lifecycle. Two engines drift apart, and each new chart feature needs two implementations.
- `overlayLayout` stays until S5. A single switch of all pages in one PR is too large to review and to revert.
- Slots keep `ChartCore` free of formation logic. A flag for each caller makes the shared code worse with each caller.

## S1 result

| File | Change |
|---|---|
| `frontend_nextjs/src/components/ChartViewer.tsx` | Removed. No file imported it. |
| `frontend_nextjs/src/store/useWebSocketManager.ts` | Removed the `always` option. `ChartViewer` was its only caller. |
| `frontend_nextjs/src/i18n/messages/chart.ts` | Removed the `chart.viewer.*` keys. |
| `frontend_nextjs/src/components/chart/LiveStats.tsx` | Removed the default parameter. Corrected the comment. |
| `docs/features/features.yaml` | MET-02 and UI-06 point to `LiveStats.tsx`. MET-02 describes what its test checks. |

The MET-02 test opens `/chart` and reads the live values. It did not touch `ChartViewer`, so the test stays unchanged.

## Open points
- [ ] S2 to S6.
- [ ] Trap for S6: do not use `useTrendPath` on the backtest chart. It loads MT5 candles up to today. In replay, this shows the future, and it does not match CSV data. Calculate the path from the candles of the run, up to the replay cursor. Write a failing test first.
- [ ] Add the feature `UI-10` and its e2e test before S4.
- [ ] `.claude/skills/ui-design/SKILL.md` §8 still names `ChartViewer.tsx`. Rule files change only on request of the project owner (`hooks/RULES.md` §6.6). Ask the owner.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Exit 0 |
| `npx eslint` on the changed source files | Exit 0 |
| `scripts/features/run.sh MET` with `E2E_PORT=3150` | 3 e2e tests passed |
| `scripts/features/run.sh UI-06` with `E2E_PORT=3150` | 1 e2e test passed |

The first run on port 3100 failed. An unrelated Python process held this port, so Playwright reused it and no WebSocket opened.

## Lessons
A session started from Remote Control cannot start another session. The session that received the approval then does the step itself.
