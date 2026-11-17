---
date: 2026-11-17
author: Claude
type: fix
status: done
pr: []
features: [FRM-39]
areas: [frontend]
---

# Butterfly and Crab: entry freezes at first touch

## Request
Decision 1116-A29.1: for Butterfly (BUT) and Crab (CRB) the trade entry freezes at the first touch of the D level, like the stop.

## Cause
The stop of BUT and CRB was frozen at the wick of the first touch candle (`freeze.touchEnd`), but the entry stayed `d.price`, which follows the outermost wick. When price went on past the touch, the entry moved away from the frozen stop. A one-year gold H4 scan gave 518 cases where the entry passed the stop (example: entry 4098.69, stop 4192.04), so the risk was zero or negative.

## Change
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/tradeApply.ts` | `harmonicTrade`: `entry` is `freeze.entryLevel ?? freeze.touchEnd` (was `?? d.price`). TP1 still follows `d.price`. `tp1AtEntry` stays GAR/BAT only. |
| `frontend_nextjs/src/lib/formation/butChecks.ts`, `crbChecks.ts` | Comment only. |
| `frontend_nextjs/e2e/mocked/formation-trade-lib.spec.ts` | New tests (BUT, CRB, buy, sell): entry does not move when D goes on, also when the wick passes the frozen stop; buy: entry > stop, sell: entry < stop. |
| `docs/features/features.yaml` | FRM-39 text and check list. |

## Decision
Entry = wick of the first touch candle (not the level price as in GAR/BAT). Reason: the stop is already computed from this value, so entry and stop use one anchor. GAR, BAT and AB=CD are unchanged.

## Open points
- [ ] Bar-by-bar backtest numbers that used BUT/CRB entries change (the entry is no longer the moving wick).
