---
date: 2026-11-20
author: Claude
type: feature
status: closed
pr: []
features: [FRM-05, FRM-39]
areas: [frontend, tests]
---

# Note under the large AB=CD target when the harmonic D broke after entry (1120-A14.2)

## Request
Since PR 573 the large target exists or not on the entry candle (frozen). The checklist row "D is the D of a harmonic formation" (`ABCD-16`) is still recalculated on every candle. After entry, a close beyond X breaks that row, while the trade block still shows the large target. The screen looked contradictory. Decision 1120-A14.2: the row stays live, the block gets a short note.

## Change
- `abcdChecks.ts`: when `big` exists and `ABCD-16` is not met, the trade gets `tpBigHarmonicBroken: true`. `Trade` (`types.ts`) and `withTrade` (`tradeApply.ts`) carry the field. Entry, stop, target, shares and the checklist do not change.
- `FormationTrade.tsx`: an amber note box (`trade-tpBig-broken-note`) directly under the large target row, only when the flag is set. Text and hint in tr/en/de (`formation.trade.big.harmonicBroken`, `.hint`).
- Desktop only; the box is a normal block row, no layout change at 375 px.

## Evidence
- Red first: `formation-abcd-lib.spec.ts` "Büyük hedef bayrağı" failed with `Expected: true, Received: undefined` before the change; 188 tests of the file pass after it.
- `formation-trade.spec.ts` "harmonisches D gebrochen" (2 tests): no note without a break; with a close below X the large target stays and the note shows.
- Screenshots: `docs/journal/images/harmonic-d-broke-note-light.png` and `-dark.png` (checked by eye: theme and frame are right, no account number visible).
