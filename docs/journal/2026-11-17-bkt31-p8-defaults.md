---
date: 2026-11-17
author: Claude
type: feature
status: open
pr: []
features: [BKT-29, BKT-30, BKT-24]
areas: [frontend, backtest]
---

# Backtest: P8 defaults on, telemetry coverage fix (BKT-29, BKT-30, N2)

## Request

Plan 1117-K1. The P8 holdout (11-15 21:00 UTC to 11-16 21:00 UTC, 24 setups, M1) passed the criteria that were written before the run. The coordinator decided to switch three defaults on and to fix a bug that the P8 run found.

## P8 result

| Arm | Unmatched | Σ\|ΔNet\| | K4 failed |
|---|---|---|---|
| Old default (off) | 5 | 42.72 | 2 |
| botReact (BKT-29) | 1 | 17.45 | 0 |
| Telemetry turn schedule (BKT-30, `tl`) | 0 | 0.37 | 0 |
| N2 (fill latency 5 ms) | no change in this window | | |

- PR-2 (turn phases) and PR-3 (zone start) passed too. They come in separate PRs.
- The window was quiet (no news turn, 678 live operations). N1, PR-2 and PR-3 cannot be told apart with this data. Only setup 200044 (Sunday market open) shows a difference.

## Solution

| File | Change |
|---|---|
| `botTurns.ts` | `BOT_TURNS_DEFAULT` = true. |
| `runner.ts` | `BOT_REACT_DEFAULT` = true. |
| `calibration.ts` | `DEFAULT_PROFILE.broker.fillLatencyMs` 1 to 5 (N2). `REPLAY_FILL_LATENCY_MS` follows it. |
| `botTurnsLoad.ts` | New `telemetrySpan`. The coverage check counts all turn kinds (t/m/c/n). The schedule is still built from `t` turns only. |

Not changed: `CALIBRATE_DEFAULT`, `REPLAY_LOOP_FROM_ACCOUNT_DEFAULT` and the PR 516 flags stay off.

## Root cause of the coverage bug

The coverage check used the first and last `t` turn. A window that starts on a weekend has only `m` turns (60 s rhythm, market closed) until the market opens. In P8 the first `t` turn was at 22:03:39 UTC, 63 minutes after the window start. The check rejected the telemetry and the run fell back to the order history without a message. With the fix, `m`, `c` and `n` turns count as "bot alive". A real gap (no turn of any kind) still falls back to the order history.

## Verification

- Tests: `backtest-bot-turns-load-lib.spec.ts` (default on, window with `m` turns first uses telemetry, real gap uses the order history). Tests that assumed the old defaults now set the old behavior explicitly (`botReact: false`); the trigger-replay ticks moved to match 5 ms. No assertion was loosened.
- Measurement (GET only, default arm, no flags, no `TELFROM`):

| Window | Source | Σ\|ΔNet\| / unmatched / K4 failed | BKT-30 baseline |
|---|---|---|---|
| P8 | telemetry | 0.37 / 0 / 0 | 0.37 / 0 / 0 |
| P6+ | liveOrders | 0.01 / 0 / 0 | 0.01 / 0 / 0 |
| P7 | liveOrders | 1.10 / 0 / 0 | 1.78 / 0 / 0 |
| NFP | liveOrders | 57.72 / 4 / 2 | 57.72 / 4 / 2 |

No setup got worse by more than 0.02. No new unmatched trade and no new K4 failure.

## Open points

- PR-2 and PR-3 defaults wait for a window with a news turn (next NFP with telemetry).
- NFP stays at 57.72 / 4 / 2 (accepted earlier).
