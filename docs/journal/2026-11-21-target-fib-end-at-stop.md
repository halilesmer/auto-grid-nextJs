---
date: 2026-11-21
author: Claude
type: fix
status: closed
pr: []
features: [FRM-05, FRM-07, FRM-12, FRM-39]
areas: [frontend]
---

# The running target Fib ends at the stop (1121-A14.1)

## Request
The XAUUSD H1 history scan (main ed0f2dcd, `FORMATION_HISTORY_TFS=H1`, step 4) showed 18 `targetNotOnProfitSide` violations: 16 for one M15 Bat buy and 2 for one H4 AB=CD buy. In all of them the running `tp1` was below the entry of a buy.

## Cause
The running targets use the Fib `from → outermost wick`. The stop triggers only on a close; the emergency stop (Not-SL) is one ATR farther. A wick between the stop and the Not-SL, with the close before the stop, moved the end of the target Fib. When the wick goes more than 0.618 × (from − entry) past the entry, TP1 is on the loss side. This is possible when ATR > 0.236 × (from − entry). All harmonics (GAR, BAT, BUT, CRB, CYP) and AB=CD had this path. PR 638 (harmonic `tp1AtEntry`) and PR 643 (frozen AB=CD `from`) did not change the end of the Fib.

- M15 Bat buy (X 4629.28, A 4670.90): entry at the D level 4634.02, stop 4619.94, Not-SL 4603.79. The entry candle (2026-04-07 17:00) had a low of 4607.91 and closed at 4622.28. TP1 = Fib(4670.90 → 4607.91, 0.382) = 4631.97.
- H4 AB=CD buy (C 4531.20): entry 4451.63, stop 4421.23, Not-SL 4394.37. The candle 2026-05-27 16:00 had a low of 4401.50 and closed at 4450.82. TP1 = 4451.05.

Effect: the guard of 1120-A35.1 does not count a target on the loss side, and TP2 waits for TP1. The Bat trade stayed `open` although the price went to 4857 in the next three days.

## Decision
1121-A14.1 (Halil, 2026-11-21, option A): the end of the target Fib is the outermost wick, but not farther than the stop. Point D stays at the wick. A close beyond the stop is a stop. Then TP1 = stop + 0.382 × (from − stop) = entry + 0.146 × (from − entry), always on the profit side. The alternative B (clamp a loss-side target to the target at entry) was not chosen.

## Change
- `trade.ts`: `targetEnd(from, extreme, stop)`.
- `tradeApply.ts`: `harmonicTrade` and `abcdTrade` compute TP1, TP2, TP3 and the big target from this end; `harmonicTargetEnd` for the drawings.
- `tradeStatus.ts`: the targets of each candle use the same end; "new extreme" still uses the raw wick.
- `cypChecks.ts`: the same for the Cypher trade.
- Drawings Z-ABCD-05, Z-GAR-06, Z-BAT-06, Z-BUT-05, Z-CRB-04, Z-CYP-03 end at the same price as TP1 (time of D).
- Tests: `e2e/mocked/formation-target-loss-side-lib.spec.ts` (real Bat M15 and AB=CD H4 candles; GAR, BAT, CYP with synthetic candles; BUT and CRB through `harmonicTrade` and `tradeStatusOf`). Three tests that fixed the old end were changed to the new rule: `formation-abcd-lib.spec.ts` (`S_PAST_FAR`, wick 160 beyond the stop 155.46) and `formation-abcd-frozen-from-lib.spec.ts` (the 643 case: wick 4666.82 beyond the stop 4669.91; `crb-form-h4-01`: now TP1 and TP2 on the profit side, status `tp12`), and the UI test in `formation-trade.spec.ts` for the same fixture (status `tp12` and the Yeniden giriş section instead of `open`).

## Evidence
- On the old code, 15 tests of `formation-target-loss-side-lib.spec.ts` and `formation-abcd-frozen-from-lib.spec.ts` failed; the two changed `S_PAST_FAR` assertions in `formation-abcd-lib.spec.ts` fail with the new code and the old values. With the change, all formation lib specs passed (2211).
- Live scan, XAUUSD H1, DEMO account, read-only, under the heavy lock (`E2E_LIVE=1 FORMATION_HISTORY_TFS=H1 FORMATION_HISTORY_SYMBOLS=XAUUSD FORMATION_HISTORY_BARS_H1=6240 FORMATION_HISTORY_STEP_H1=4`, 1560 scans):
  - before: `targetNotOnProfitSide` 18, `candidateVanished` 135;
  - after: `targetNotOnProfitSide` 0, `candidateVanished` 132 (M15 Bat buy 9 → 6: the Bat trade now ends). No new violation type. The AB=CD status counts did not change.
  - The test is still red because of `candidateVanished`. That violation was there before this change and is not part of it.

## Open
- Visible: `crb-form-h4-01` now reaches TP1 and TP2 and the trade block shows the Yeniden giriş section again. Before 1120-A35.1 this came from a loss-side TP1; now the targets are on the profit side.
