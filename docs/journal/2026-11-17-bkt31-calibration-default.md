---
date: 2026-11-17
author: Claude
type: decision
status: open
pr: []
features: [BKT-31]
areas: [frontend, backtest]
---

# Backtest: calibration default on, replay loop flag stays off (BKT-31 PR-4)

## Request

Plan 1117-K11. The two PR-4 flags (`CALIBRATE_DEFAULT`, `REPLAY_LOOP_FROM_ACCOUNT_DEFAULT`) were off since PR 555 and no measurement backed the decision. The decision rule was written before the runs.

## Measurement

Four windows (P8, P6+, P7, NFP), 24 setups, M1, cached data, GET only. Account LOOP value: 2 s in all four. Default arm on v0.7.634 reproduced the known baseline.

| Window | Source | def | cal | loop | cal+loop |
|---|---|---|---|---|---|
| P8 | telemetry | 0.37 / 0 / 0 | 0.37 / 0 / 0 | 0.37 / 0 / 0 | 0.37 / 0 / 0 |
| P6+ | liveOrders | 0.01 / 0 / 0 | same | same | same |
| P7 | liveOrders | 1.10 / 0 / 0 | same | same | same |
| NFP | liveOrders | 57.72 / 4 / 2 | same | same | same |

Cells show Σ\|ΔNet\| / unmatched / K4 failed. No setup got worse in any arm.

Information arms (not part of the decision):

| P8 arm | Σ\|ΔNet\| / unmatched |
|---|---|
| liveOrders (lo) | 35.16 / 2 |
| liveOrders + cal | 0.37 / 0 (setup 200044: 34.81 to 0.02) |
| no turn schedule (off) | 17.45 / 1 |
| off + loop 2 s | 0.54 / 0 |

## Decision

- `CALIBRATE_DEFAULT` = true. Criteria 1 and 2 hold (no window worse, no setup worse). Criterion 3 holds on the P8 lo arm: calibration closes the two unmatched trades of setup 200044.
- `REPLAY_LOOP_FROM_ACCOUNT_DEFAULT` stays false (no gain). With a turn schedule the runner never reads `botIntervalSec`, and `BacktestView` applies the flag only when `BOT_TURNS_DEFAULT` is off. The off path gain (17.45 to 0.54) is a path the app does not use.

## Open points

- The two info arms lo+loop and lo+cal+loop were not run to the end (heavy lock busy). They cannot change the decision: loop has no effect when a turn schedule is active.
- Follow-up idea: when the page falls back to no schedule (no telemetry or order data), the loop flag is also not applied. A separate decision.
