---
date: 2026-11-05
author: Claude
type: fix
status: done
features: [BKT-16, BKT-14]
areas: [frontend]
---

# Backtest-live pairing by order level, criteria K1–K4 in code

## Cause
Two trades on the same order level in a short time were paired by time only. Live and backtest fill the same levels in a different order, so a live SL met a backtest TP and the reverse. The exit reasons then looked different (USOUSD: 13 such pairs). This was an error of the comparison, not of the engine.

## Change
- `pairByOrder` pairs first by side and order level (entry prices within half a grid step, at least one spread), nearest time first, inside the 1 h window. The rest is paired by order and time as before.
- `evaluateBtLive` is a pure function for the criteria: K1 count, K2 same M1 candle (90 % of pairs), K3 same exit reason, K4 net result of the backtest not above live plus a tolerance. Option `excludeEntryBefore` drops live trades that opened before the window.
- Not changed: backtest engine (another session works on spread, SL slip, start state).

## UI effect
No visible change in layout. The pair list in the live comparison can show other pairs and other deviations.
