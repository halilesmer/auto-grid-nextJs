---
date: 2026-11-14
author: Claude
type: decision
status: done
pr: []
features: [FRM-48]
areas: [frontend]
---

# Chart first, formation search on request

## Request
Plan 1114-A1. On `/chart`, the chart must come before the formation search. Not every symbol needs the search. The system asks "Search formations for {symbol}?" and runs the search in the background after "Yes". The design is approved as an Artifact (2026-11-14).

## Solution
| File | Change |
|---|---|
| `src/components/chart-page/FormationAskStrip.tsx` | Thin strip below the top bar: question, running state with progress line, failed state with retry. No modal. |
| `src/hooks/useFormationAsk.ts` | Answer state (not remembered, one answer per account and symbol), favorite shortcut, toast after the first search since the release, error toast. |
| `src/hooks/useFormationScan.ts` | New `enabled` parameter. No candle request goes out before the answer AND before the chart's own candles are here. The calculation runs in a Web Worker. |
| `src/lib/formation/scanRun.ts`, `scan.worker.ts` | `FormationContext` + `scanFormations` as a pure function; the worker calls it. The page reads only the last ATR per timeframe (`scan.atr`) instead of the context. |
| `e2e/fixtures/test.ts` | Option `formationAsk` (`auto` by default): the fixture presses "Yes" for all older tests. `manual` is for FRM-48. |

Favorites search (`FormationScanRunner`) is unchanged. A favorite symbol gets no question; the search starts after the candles.

## Measurement (1114-A1.5)
The live worker was not reachable from this session (no stored connection in the browser pane), so the number is from a synthetic series, not from real data. Test: random-walk candles in the real request sizes (D1 400, W1 150, H4 720, H1 960, M15 960 bars), `new FormationContext` + `scanFormations` in one Node process, 7 runs, a Mac with other sessions running:

| Run | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| ms | 3148 | 2051 | 1574 | 2128 | 1673 | 947 | 1806 |

The result is far above 50 ms, so the calculation moved to a Web Worker.

### Live measurement, side by side (2026-11-15)
Old code (`main`) and new code (this branch) under the same conditions: both `next dev`, the live VPS worker, the DEMO account, H4, XAUUSD and EURUSD, headless Chromium with one fresh browser context per page load. The runs alternate old/new. The Mac had a load average of 17–31 from other sessions. Runs with a cold dev compile or a timeout are left out.

| Value | Old (main thread) | New (Web Worker) |
|---|---|---|
| `data-scan-ms` (calculation time) | 95–554 ms | 250–405 ms |
| First chart draw after navigation (median) | 3.1 s (2.1–4.2) | 2.9 s (2.7–3.6) |
| Longest main-thread long task per page load | 75–225 ms | 154–255 ms |

Findings:
- On real data the calculation takes 0.1–0.5 s. That is above the 50 ms limit, so the Web Worker stays.
- In the Worker the time is a little longer: it includes the copy of the candles into the Worker. This time does not block the page.
- The chart comes first in the new code (median 0.2 s earlier). The search requests start only after the chart's candles.
- The long-task value does not show a clear difference. Under this load the long tasks come mostly from other work (dev build, JSON parse of the candle responses, chart draw), not from the search. A clean value needs a production build on an idle Mac.

## Why
- A strip, not a modal: the chart must stay usable while the question waits.
- The answer is not remembered (decision of the project owner): the symbol list is long and most symbols have no use for the search.
- The Web Worker keeps the main thread free. A fallback runs the same function in the main thread if `Worker` is not available.
