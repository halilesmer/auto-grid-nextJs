---
date: 2026-11-13
author: Claude
type: feature
status: open
pr: []
features: [BKT-30]
areas: [frontend, backtest]
---

# Backtest engine takes the live bot turn schedule (BKT-30, PR-1)

## Request

The browser backtest must match live trades closely. The main remaining difference is the turn timing of the live bot. Source: project owner, 2026-11-13 (decisions 1113-G4 to G6, K39).

## Solution

| File | Change |
|---|---|
| `lib/backtest/botTurns.ts` | `BotTurns` type, op costs (`BOT_OP_COST_S`), `BOT_TURNS_MAX_PASSES` = 8 |
| `lib/backtest/runner.ts` | `RunModel.botTurns`; replay minute runs the bot only at turn starts; `RunResult.sendMinutes` |
| `lib/backtest/broker/pathBroker.ts` | `retypePending(ticket)` |
| `lib/backtest/runJob.ts` | XSEND: send minutes stay in later passes; pass limit 8 with a schedule |

- With `botTurns`, in a replay minute: the bot runs only at `starts`, with the quote of that moment. A new order cannot fill before `zoneAt` plus the costs of the earlier ops of the turn. At that time the order picks limit or stop with the fresh quote. Trigger, periodic and end-of-minute runs do not happen.
- Without `botTurns` (missing, empty, or lists of different length) the code path and the result are unchanged. A test compares the whole result.
- Op costs: setup 0.225 s, delete 0.102 s, SLTP 0.10 s. Source: order history of two 24-hour windows, 3571 ops (plan note bt-n1, section 1.3). The runner counts setup and delete; SLTP is part of `zoneAt`.
- The schedule is not built here (PR-2) and not wired into `runJob` params (PR-3). Default stays off.
- Not included on purpose (decision G6.1): delete delay and a fresh position view at the start of the zone.

## Measurement

Fixed data, schedule from live order history (prototype arm orcR), all 24 setups:

| Window | Engine | Sum of net differences | Unmatched trades | K4 failed |
|---|---|---|---|---|
| P7 | without schedule (cbl) | 12.63 | 5 | 2 |
| P7 | new API, fill latency 5 ms | 0.46 | 0 | 0 |
| P7 | new API, fill latency 1 ms (main) | 1.48 | 0 | 0 |
| P6+ | without schedule (cbl) | 4.48 | 2 | 0 |
| P6+ | new API (both latencies) | 0.01 | 0 | 0 |

The prototype numbers hold when the 5 ms fill latency (N2) of the prototype is used. Main has 1 ms. Setups 200050 and 200056 in P7 depend on it (1.02 and 4.83 gross). N2 is a separate one-line PR (decision G6.2); until then the schedule arm is 1.48 on P7.

## Open points

- PR-2: schedule source (telemetry first, order history as fallback), then PR-3: wiring and the default decision after NFP and P8.
- N2 (fill latency 5 ms) as its own PR.
