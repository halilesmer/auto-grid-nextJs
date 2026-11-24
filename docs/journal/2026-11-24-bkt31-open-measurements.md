---
date: 2026-11-24
author: Claude
type: diagnosis
status: open
pr: []
features: [BKT-31, BKT-23, BKT-24, BKT-29]
areas: [backtest, worker]
---

# Backtest vs live: open measurements (fill latency, orders route, c2, b, data completeness)

## Request

Step 6 of the BKT-31 plan. Close or date the measurements that were still open. Read only, DEMO account A, no code change.

## fillLatencyMs: why the sample count is 0

Root cause: nothing produces the samples. `CalibrationInput.fillLatencySamplesMs` is declared in `calibrationDerive.ts`, but `loadCalibration` (`calibrationLoad.ts`) never builds it, and no other caller does. The worker and the page are not at fault. `deriveProfile` always takes the fallback (`fillLatencyMs` 5, samples 0).

Measurement of the real value (GET only, orders of the last 3 days plus ticks of 2 s before the fill, 99 filled pending orders, five symbols). Latency = `time_done_msc` of the order minus the first tick after `time_setup_msc` that crosses the price (buy limit: ask <= price, sell limit: bid >= price, buy stop: ask >= price, sell stop: bid <= price).

| Result | Value |
|---|---|
| Median | 1 ms |
| Range | 1 to 3 ms |
| Samples | 99 (two runs, the second lost 21 of 60 to tunnel errors) |
| DEFAULT (N2) | 5 ms |

20 samples are enough (`MIN_FILL_SAMPLES`), so a producer would give a derived value of about 1 ms. With `CALIBRATE_DEFAULT` on this would change every run from 5 ms to 1 ms. N2 raised the value from 1 to 5 ms for P7 (setups 200050 and 200056 depend on it), and the acceptance script is not in the repository. So the producer is not built here. Decision for the owner: build the producer (pure function plus replay minutes of the fill, about 60 samples) and run the P7 and P8 arms with it, or keep 5 ms as a fixed value and remove the unused input.

## GET /history/{id}/orders on the VPS

Measured through the tunnel, two runs each, `/market/{id}/clock` as baseline (0.12 s):

| Span | Time | Size |
|---|---|---|
| 1 hour | 0.41 to 1.14 s (first call) | 13 KB |
| 1 day | 0.44 to 0.48 s | 151 KB |
| 3 days | 0.48 to 0.54 s | 177 KB |
| 7 days | 0.67 to 0.81 s | 633 KB |

All below the 2 s limit of the earlier decision. Decision: the route stays out of `mt5_reader.run()`. Measure again if a call goes over 2 s.

## Open points of 2026-11-10 (trigger replay)

- c2 (orders that wait at the start): built as BKT-24 (seeded orders, 2026-11-11) and passed in the P8 acceptance of 2026-11-17 (private note). Closed.
- b (bot placement delay): BKT-29 `botReact`, delay 1 s, on by default since 2026-11-17. P8: unmatched 5 to 1, K4 failed 2 to 0. Closed.
- Data completeness (1110-K3.3): the first run had missing candles. The cause was never proven. Since 2026-11-12 the run log has a WARN for each unexplained hole (BKT-27) and a page with `syncing` is requested again. Not reproducible now. Closed as mitigated.

## Open points
- [ ] Owner decision: fill latency producer or fixed 5 ms (see above).
