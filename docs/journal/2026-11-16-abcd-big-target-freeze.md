---
date: 2026-11-16
author: Claude
type: fix
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD trade: the large target is frozen at the entry candle

## Request
Decision owner: Halil, 2026-11-16 ("Evet, dondur"). Whether the large AB=CD target exists is decided at the entry candle (the candle that fills level 1) and does not change later.

## Root cause
The harmonic check of ABCD-16 ran on all loaded candles at each calculation. After the entry, a later candle could break it: a close beyond X (GAR-18), a new zone, or a new inner pivot changes the check result, while the D ratio and the X pivot stay the same. Then `big` became null. An open trade fell back from thirds to halves, and the large target line disappeared.

## Solution
`abcdChecks.ts`: when level 1 was reached before the last candle, `evaluate` builds the environment at the close of the entry candle and takes `big` (offset, activation) from that run. This also covers the drawings `Z-ABCD-09` and `Z-ABCD-10`, which read `tpBig`. If the entry candle is the last candle, or level 1 is not reached, nothing changes. `tradeStatus.ts`, `trade.ts`, `reentry.ts` and `earlyReversal.ts` are unchanged. No visible text changed.

## Rules
- Large target exists at the entry candle: it stays, also after a later candle breaks the harmonic check.
- It does not exist at the entry candle: it does not appear later.
- No entry yet: the decision follows the last candle as before.

## Verification
- Test `Büyük hedef dondurulur` (Gartley fixture, one close below X after the entry): failed before the fix (`tpBig` undefined), passes after.
- No fixture exists where the harmonic D forms only after the entry; the "not at entry" case is covered with the fixture without a harmonic D plus later candles.
