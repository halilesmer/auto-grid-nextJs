---
date: 2026-11-13
author: Claude
type: feature
status: open
pr: []
features: [BKT-29, BKT-26]
areas: [frontend, backtest, tests]
---

# Backtest: reaction delay blocks the periodic bot run (PR-1, off by default)

## Request
Plan 1113 (bot time model), PR-1. Decisions 1113-G1…G3: PR-1 holds only E1 and B 1 s.
Flags stay off. P8 (after 2026-11-16 21:10 UTC) decides the default.

## Cause
- In a tick replay minute the bot also runs on a fixed interval (`REPLAY_BOT_INTERVAL`, 1 s).
- With `botReact` on, a trigger sets `pendingBot` (trigger time + delay). The periodic run still fired in between,
  so the bot ran before the delay ended. The delay of BKT-26 (B) had no effect on the XAUUSD event of P7.

## Solution
| File | Change |
|---|---|
| `src/lib/backtest/runner.ts` | E1: the periodic run is skipped while `pendingBot` is set. `pendingBot` is only set with `botReact`, so there is no separate flag and "delay on, E1 off" cannot be set. |
| `src/lib/backtest/botDelay.ts` | `BOT_REACT_DELAY_S` 2 → 1. |
| `e2e/mocked/backtest-tick-order-lib.spec.ts` | Two `@BKT-29` tests; the BKT-26 default test expects 1 s. |

Not changed: `BOT_REACT_DEFAULT` (false), `REPLAY_BOT_INTERVAL` (1), `TRIGGER_REPLAY_LIMITS.passes` (4), A1/A2 flags.
No bot period and no XSEND in this PR. They are measured in P8 with the experiment patch.

## Verification
Fixed data, recorded worker answers, close-rate mode, 24 setups.

| Window | Flags off: unmatched / sum abs ΔNet | `botReact: true`: unmatched / sum abs ΔNet |
|---|---|---|
| P7 | 6 / 53.06 (K4 fails 2) | 6 / 23.92 (K4 fails 1) |
| P6+ | 2 / 5.71 (K4 fails 1) | 2 / 4.85 (K4 fails 0) |

Flags off equals the base. `botReact: true` equals the experiment arm e1b1.
The new test fails when the E1 line is removed and passes with it.
Known new unmatched trade with the flag on: 200042 in P7 (0 → 1), class phase.

## Open points
- [ ] P8: measure PR-1 (E1 + B 1 s), B 1.3 s and the other arms. Turn `BOT_REACT_DEFAULT` on only if sum, unmatched count and K4 are not worse than the base.
- [ ] Bot period and XSEND stay open until P8 shows a gain.

## Lessons
- A delay in a replay loop needs the periodic path to respect it. Otherwise the delay value is not what the test measures.
