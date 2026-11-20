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

## Follow-up 2026-11-20: first window with derived zone overhead and SLTP cost (1117-K21)

Before 2026-11-19 no calibration window W_c had the telemetry fields `z0` and `nsl0`, so `zoneOverheadS` and `opCost.sltp` stayed at DEFAULT. This is the first measurement where both are derived.

- Evaluation window W_e: 2026-11-18 21:00 UTC to 2026-11-19 21:00 UTC, 24 setups, M1, turn source telemetry, GET only. Code: main v0.7.670 (backtest code unchanged since PR 597).
- W_c from `calibrationFrom` (3 trading days by broker date): 2026-11-13 21:00 UTC to 2026-11-18 21:00 UTC. It includes one hour of Friday 2026-11-13 and the weekend; the data is 11-16, 11-17 and 11-18. Telemetry covers W_c and W_e. One bot gap of about 4.5 h on 2026-11-16 from 23:04 UTC.

Derived profile (DEFAULT in brackets):

| Field | Value | Samples |
|---|---|---|
| opCost.pending | 0.235 s (0.225) | 386 |
| opCost.remove | 0.103 s (0.102) | 483 |
| opCost.sltp | 0.103 s (0.100), derived | 113123 |
| headS | 0.072 s (0.105) | 117166 |
| zoneOverheadS | 0.003 s (0), derived | 112060 |
| clockShiftS | -0.027 s | - |
| fillLatencyMs | 5 (DEFAULT, not measured by the page) | 0 |

Arms on W_e (Σ\|ΔNet\| / unmatched / K4 failed):

| Arm | Result |
|---|---|
| def (main, calibration on) | 0.37 / 0 / 0 |
| nocal (DEFAULT profile) | 0.37 / 0 / 0 |
| cal-zo (calibration on, zoneOverheadS and sltp pinned to DEFAULT) | 0.37 / 0 / 0 |
| only zoneOverheadS pinned | 0.37 / 0 / 0 |
| only sltp pinned | 0.37 / 0 / 0 |

The trades of all 24 setups are identical in all five arms. One setup (200062) fails K2 in all arms. P8 check: def stays 0.37 / 0 / 0.

Result: the rule written before the runs holds (def is not worse than nocal and cal-zo, no setup regression). No code change.

Why the two values have no effect here: with telemetry `z0`, `opCost.sltp` is used only by the turn phases model (`turnPhases`, off by default); the zone start already contains the SLTP time through `z0`. `zoneOverheadS` = 3 ms moves the zone start by at most 23 × 3 ms; the op times of def and cal-zo are identical, so no tick changed.
