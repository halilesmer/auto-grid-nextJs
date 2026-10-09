---
date: 2026-10-09
author: Codex
type: diagnosis
status: done
pr: []
features: [BKT-02, BKT-04]
areas: [frontend, tests, docs]
---

# Profile a busy browser grid worker

## Request

- Measure one million synthetic candles in the real browser Web Worker after the first `pyRound` fast path.
- Separate loading, simulation, result delivery, memory observations, cancellation, and frontend responsiveness.
- Optimize only a measured bottleneck. Preserve trading behavior and the existing parity files.

## Cause

| Finding | Evidence | Cause |
|---|---|---|
| The first active BUY-only probe did not sustain enough trading. | 10,000 candles produced 240 closed trades. | Open positions could hold the position limit during repeated price swings. |
| A busy BUY/SELL zone remained slow. | 30,000 candles produced 7,833 trades in 18.431 seconds, including result delivery. | The CPU profile attributed 60.59% of all samples to exact binary scaling in `pyFormatFixed`. |
| Integer rounding still used BigInt. | Parent stacks attributed 9.732 seconds of exact scaling to `pyRoundExact`, versus 2.415 seconds to volume decimal detection. | The earlier fast path accepted only explicit decimal precision. Grid-level rounding omits that precision. |

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/backtest-performance-worker.spec.ts` | Start the production Web Worker through the page. Mock paginated HTTP candles and measure the worker with CDP. |
| `frontend_nextjs/src/lib/backtest/engine/pyRound.ts` | Round finite doubles to an integer without BigInt when decimal precision is omitted. Preserve ties to even and positive zero. |
| `frontend_nextjs/e2e/mocked/backtest-grid-parity-lib.spec.ts` | Compare integer rounding with the unchanged exact reference across half values, adjacent doubles, signs, and exponents. |
| `docs/features/features.yaml` | Document the browser profiling test and the million-candle command. |

## Why

The input uses a continuous synthetic M1 sequence, not a broker calendar. Both directions use a 0.1 grid and 0.2 TP.
The 0.5 SL lets the zone continue trading. Spread is 20 points of 0.001. Swap is disabled.
Prices follow two deterministic sine waves. The candles contain a 0.06 wick beyond the open and close.

For finite doubles below `2^52`, subtraction from the integer floor gives the exact fractional part.
At and above `2^52`, every representable double is an integer. An exact half rounds to the even integer.
The result retains positive zero when precision is omitted. Explicit precision keeps the existing algorithm.

The profile supports the integer-rounding change. Keep `getAllRobotOrders`, recorder copies, and log behavior unchanged in this work.
The remaining volume-formatting cost is measured and recorded. A further optimization is outside this profiling change.

## Measurement method

| Measurement | Method and limit |
|---|---|
| Browser | Headless Chromium from the installed Playwright runtime; production Next.js build. No FastAPI process or VPS connection. |
| HTTP | Browser routes return at most 50,000 candles per page and check the synthetic API header. No real account data. |
| Load | Worker `performance.now()` from receiving `run` to its first simulation progress message. Includes HTTP, JSON, validation, and typed-array construction. |
| Simulation | Worker `performance.now()` from the first simulation progress message to the start of posting the result. Includes result construction. |
| Serialization | Worker time spent in `postMessage(result)`. Main-thread receipt is measured separately and can include scheduling and deserialization. |
| CPU | CDP `Profiler`, 1,000 microsecond sampling interval. Profiles include load and idle samples. Measurements include profiling overhead. |
| Memory | CDP `Runtime.getHeapUsage` for the worker isolate. `usedSize` is the JavaScript heap; `backingStorageSize` includes array buffers and external strings. |
| Memory limits | Samples are observations, not an exact peak or process RSS. Request and response times show delayed samples. No browser-wide memory API is claimed. |
| Candle storage | Six `Float64Array` columns contain exactly 48,000,000 bytes for one million candles. This excludes response arrays, broker history, trades, and charts. |
| Responsiveness | A frontend 50-ms timer records heartbeat counts and the largest observed gap while the worker runs. Cancellation uses the visible page control. |
| CI | Normal runs use 10,000 candles. Set `BKT_PROFILE_CANDLES=1000000` for the full measurement. No CPU duration threshold is a correctness assertion. |

## Baseline measurements

| Item | One million candles, before integer rounding |
|---|---|
| Browser | Chromium 153.0.8010.12 |
| Load | 1.977 seconds |
| Simulation | 595.037 seconds |
| Result serialization | 0.391 seconds |
| Simulation through frontend receipt | 596.065 seconds |
| Closed trades | 260,944 |
| Grid placement log count | 351,488 |
| Out-of-window grid log count | 162,985 |
| Log lines dropped above the bounded log | 512,478; counters continue |
| Equity samples | 20,002; downsampling can retain two boundary points |
| Frontend heartbeats | 11,948; largest observed gap 54.5 ms |
| Worker heap samples | 121, approximately every five seconds |
| Largest observed JavaScript heap | 299,325,704 bytes |
| Largest observed backing storage | 48,791,753 bytes |
| Counter scope | Grid counts are log-message counts. Each message can describe more than one placed or cancelled order. |

## Repeat after integer rounding

| Item | One million candles |
|---|---|
| Load | 2.999 seconds |
| Simulation | 164.512 seconds; 3.617 times faster than the baseline |
| Result serialization | 0.308 seconds |
| Simulation through frontend receipt | 165.388 seconds |
| Workload | The candle, trade, grid-log, dropped-log, and equity-point counts equal the baseline. |
| Frontend heartbeats | 3,356; largest observed gap 53.6 ms |
| Worker heap samples | 35; largest observed heap 293,489,936 bytes; largest backing storage 59,156,728 bytes |
| Cancellation | 29.4 ms after simulation progress; the worker terminated and no result appeared during the next second. |
| Remaining exact scaling | 40.98% of all CPU samples, entirely under volume decimal detection. |
| Raw observations | `docs/backtest/worker-performance-2026-10-09.json` preserves times, counters, and heap samples for both runs. |

## Comparison limits

| Limit | Effect |
|---|---|
| One full run per version | The ratio is an observed result on this Mac, not a cross-device benchmark or confidence interval. |
| Browser cancellation case | The repeat starts a separate cancellation case during its first seconds. Its load phase includes that overlap. |
| Baseline test overlap | The baseline overlapped a CPU-heavy assertion loop in another process. Compare the CPU profiles and parity evidence with the wall times. |
| Sampling overhead | CPU and memory instrumentation remained enabled. The CPU profiler includes load and idle time. |
| Correctness | The captured workload counts match. Full trade-by-trade correctness is covered by the unchanged parity fixtures, not a million-trade byte comparison. |

## Verification

| Check | Result |
|---|---|
| `scripts/features/run.sh e2e BKT-04` | Initial BUY-only probe: 67 passed. |
| `BKT_PROFILE_CANDLES=30000 scripts/features/run.sh e2e BKT-04` | Busy BUY/SELL baseline: 67 passed. |
| `BKT_PROFILE_CANDLES=1000000 scripts/features/run.sh e2e BKT-04` | Optimized workload and cancellation: 68 passed in 3.0 minutes. |
| Million-candle baseline | All workload assertions completed. Trace cleanup failed because another Playwright invocation removed its artifact directory. Measurement values remain in the log. |
| Integer rounding negative control | Reversing the half-value rule failed: `round(2.5)` returned 3 instead of 2. Restored regression passed in 646 ms. |
| `scripts/features/run.sh e2e 'BKT-02\|BKT-03\|BKT-09'` | 120 passed: grid, fractal, and future-data checks. Golden files remain unchanged. |
| `scripts/features/run.sh BKT` | Unit: 120 passed. API: 43 passed. Browser: 234 passed in 48.3 seconds. |
| Final `scripts/features/run.sh e2e BKT-04` | 68 passed in 12.5 seconds. The frontend timer also ticks specifically during simulation. |
| `scripts/features/run.sh check`, `git diff --check` | Catalog valid with 157 features; no whitespace errors. |
| `npm run lint`, `npx tsc --noEmit` | Passed after the integer rounding change. |

## Lessons

A zone inside the price range is insufficient evidence of sustained trading. Record closed trades and grid operations.
Keep the loading and simulation clocks inside the worker. Page receipt also includes result transfer and frontend scheduling.
