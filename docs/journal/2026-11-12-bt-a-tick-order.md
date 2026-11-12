---
date: 2026-11-12
author: Claude
type: feature
status: open
pr: []
features: [BKT-26]
areas: [frontend, backtest, tests]
---

# Backtest: tick order and bot delay (off by default)

## Request
Fix class A of the BT↔MT5 diagnosis, the XAUUSD event at 13:30 UTC in window P7.
Live, three limit orders fill on one tick and close within 0.5 s at the level SL/TP.
The backtest ran the bot after the first fill, deleted the other orders and moved TP/SL at once.
Decision 1112-K5.3: build A1, A2 and the reaction delay B, keep all switches off, and let the P8 window decide.

## Cause
- The bot in MT5 needs time between a fill and its TP/SL change (live median 0.70 s, XAUUSD 0.76 s).
  In this time the position has only the level SL/TP.
- Live, the bot also reacts to a close after several seconds. The backtest re-placed orders in the same second.
- The backtest ran the bot after the first trigger of a tick. MT5 fills all triggers of one tick first.

## Solution
| File | Change |
|---|---|
| `src/lib/backtest/botDelay.ts` | One source for all bot delays: delay table per symbol (A2) and `BOT_REACT_DELAY_S = 2` (B). |
| `src/lib/backtest/broker/pathBroker.ts` | A2: after a replay fill the level SL/TP stays for the delay. The bot's TP/SL request is held, then applied. |
| `src/lib/backtest/runner.ts` | A1 `sameTickBatch`, A2 `fillSltpDelay`, B `botReact` (+ `botReactDelay`). All defaults are `false`. |
| `e2e/mocked/backtest-tick-order-lib.spec.ts` | 14 logic tests (`@BKT-26`). |

B replaces A2. With B on, the broker hold is off, so the two delays never add up.
Measured: with both on, the result equals B alone, in P7 and in P6+.

## Why
- Acceptance criterion: sum of |ΔNet| and K4 (K4 never relaxed). The old criterion "P7 unmatched ≤ 4" fails
  because a better pairing shows BT-only trades that were hidden before.
- A random delay was rejected: it makes the result differ between runs.
- No UI switch. Rollback is one constant. A1 works on the same replay tick only. Path mode is not changed.
- The value 2 s comes from one event window. P8 must check it.

Measurement (window P7 = 2026-11-09 21:00Z to 2026-11-10 21:00Z; P6+ = 2026-11-08 21:00Z to 2026-11-09 16:18Z):

| Arm | P7 unmatched | P7 sum abs ΔNet | P7 K4 fails | P6+ unmatched | P6+ sum abs ΔNet | P6+ K4 fails |
|---|---|---|---|---|---|---|
| all off (= main) | 7 | 56.41 | 2 | 2 | 9.92 | 3 |
| A1 + A2 | 11 | 57.40 | 1 | 2 | 9.92 | 3 |
| B (2 s) | 9 | 24.61 | 1 | 2 | 8.66 | 2 |
| B delay 1 s | 10 | 52.56 | 1 | | | |
| B delay 4 s | 8 | 28.08 | 1 | | | |

Entry exact match: P7 80.8 → 81.6 %, P6+ 88.7 → 88.5 %. Exit exact match: P7 95.3 → 96.9 %, P6+ 97.7 % (same).
The A1 + A2 event at 13:30:07 (three fills, close within 0.5 s) now matches live.

Unmatched in P7 after B (2 s): 200041 (1 live-only, 4 BT-only), 200042 (1 BT-only, new, exposed by the pairing),
200044 (1 live-only, class D, false `gap_confirmed`), 200047 (2 BT-only, class C, short spike).

The four BT-only trades of 200041 are a rest of class B:
the first is a re-entry at 13:30:02, the other three are re-entries at 13:30:08, :09 and :13 after the SL closes at :07.
Live, the next fill is at 13:30:14. Several closes arrive in one burst, so the bot needs more than 2 s.
With 4 s the trade at :13 goes away, the other three stay. A fixed delay does not fit a burst; the delay depends on load.
One more live-only trade (15:50) is not in this group.

## Verification
- 14 tests in `backtest-tick-order-lib.spec.ts` pass; the 354 BKT logic tests pass.
- Default off equals main: the trades of all 48 magic runs in P6+ and P7 are byte-identical to the base commit (0 differences).

## Open points
- [ ] P8 (after 2026-11-16 21:10 UTC): measure the three switches. Switch on only if the sum of |ΔNet| falls,
  K4 does not get worse, and each rise of the unmatched count has a reason.
- [ ] Check the 2 s value in P8. If it fails, find a delay that depends on the burst size.
- [ ] Class C (200047) and class D (200044) stay open in other sessions.

## Lessons
- A better pairing can raise the unmatched count while the real difference falls. Judge by sum of |ΔNet| and K4.
- A delay value from one window is a hypothesis. Keep it in one file and keep the switch off until a second window agrees.
