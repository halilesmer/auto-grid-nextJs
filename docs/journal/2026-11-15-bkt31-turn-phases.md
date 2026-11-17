---
date: 2026-11-15
author: Claude
type: feature
status: open
pr: []
features: [BKT-31]
areas: [frontend, backtest]
---

# Backtest: two-phase bot turn (BKT-31, PR-2)

## Request

The live bot reads the price at the start of a turn, applies TP/SL to the positions it sees right after, reads each zone fresh, and each op takes effect at the broker at op time. The backtest did all of this at one instant. Source: plan 1114-M1 §3, decision 1114-K63 (flag off by default).

## Solution

| Part | Change |
|---|---|
| `engine/orchestrator.ts` | `turnHead` (commands, spread guard, read 1, price read, zombie delete, read 2, vanished, TP/SL) and `turnZones` (zone loop with the head prices). `manageDynamicGrid` is their composition; the result is the same. |
| `runner.ts` | Flag `turnPhases` (needs `botTurns`; default `TURN_PHASES_DEFAULT` = false). Event queue per replay minute: head at `snapAt`, zones at `zoneAt` (never before `snapAt`), ticks in between. A zone run in a minute without replay runs at the start of that minute, before the candle path. |
| `broker/pathBroker.ts` | `sltpClock`: TP/SL requests of the head take effect at op time (`snapAt` + 0.10 s per request); the bot sees the new value at once. Sub-flag `removeAtOp` (default on with `turnPhases`): a delete is done for the bot at once and hidden from `ordersGet`, but the order can still fill until op time (`removeRaced`). |
| Protocol | Log line `run.turnPhases`: heads, straddled, zoneBeforeSnap, removeRaced. |

## Verification
- `npx tsc --noEmit`: no error.
- Lib tests `@BKT-31` in `backtest-tick-order-lib.spec.ts` (flag off byte-equal, fresh zone view, head prices, race on delete, TP/SL at op time, minute overflow): pass.
- Acceptance run: see `bt-bkt31-pr2-olcum.md` in the notes folder.

## Open points
- [ ] Default decision (`TURN_PHASES_DEFAULT`) waits for P8 and a news window with telemetry.
- Known small difference: in the same zone pass, a level whose order was hidden but filled gets a new order; live, read 3 would show it.
