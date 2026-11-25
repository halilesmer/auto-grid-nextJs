---
date: 2026-11-25
author: Claude
type: fix
status: closed
features: [FRM-50, FRM-13, FRM-05]
areas: [frontend]
---

# D stays at the end of the trade; entry line on five formations

## Request
Halil (1124-A1, 1124-A2.1, 1124-F2.6): on a GBPUSD M15 sell Butterfly the trade stopped out at 1.30638. D then moved to 1.3105 with later candles, and D-based checks ("Takviyeler 7/9") changed. The chart also showed no entry line, only the stop line.

## Cause
D is the outermost wick after C. The search ran to the last candle (`extremeAfter` in `abcd.ts` had no upper bound). The candle where the trade ended (`status.endIdx`) was known but not used for D.

## Decision
Halil: D freezes at the stop candle ("Stop'un olduğu yerde donsa daha mantıklı olur"). A running trade keeps today's behavior (D follows the outermost wick). The entry line was approved with 1124-F2.6.

## Change
- `extremeAfter`, `shapeOf`, `shapeOfX` take an optional last candle (`limit`).
- Harmonics: `evaluateFrozenD` (`xabcd.ts`) measures once. If the trade ended before the last candle, it measures again with D up to and including `endIdx`. It is used in `candidateOfBase` and `checkXabcd`. Own points with a D are not changed.
- AB=CD: `evaluateFull` and `tradeOnlyOf` (`abcdChecks.ts`) do the same two-pass measurement.
- The trade status does not depend on D (entry = first touch, stop and targets run inside `tradeStatusOf`), so `endIdx` is the same in both passes. `tradeKey` uses side, entry candle and entry price, `pointsKey` uses X, A, B, C: neither contains D, so the ended-trade caches stay valid.
- New drawings: `frozenEntryDrawings` (`tradeApply.ts`), ids Z-GAR-09/10, Z-BAT-09/10, Z-BUT-09/10, Z-CRB-08/09, Z-ABCD-11/12. Line from the entry candle to the right edge, label at the right edge (`label: 'entry'`, tone `entry` = blue, i18n `formation.draw.entry` tr/en/de). The price is the "Giriş" of the trade block. Cypher has no entry line (its stop is a Fib, not a frozen line).
- Test: `e2e/mocked/formation-d-freeze.spec.ts` (FRM-50).

## Fallback: D keeps running when freezing would change the trade
`evaluateFrozenD` measures a second time with D up to `endIdx`. If the second measurement gives another entry, stop, entry candle or end candle (or no trade), the first measurement stays and D keeps running. Reason: for some invalid bases the entry is the first touch of the level, but the "reached" check (BAT-07, CYP-07) passes only with a later wick. With D cut at `endIdx`, such a trade would vanish.
- Measured on all scan fixtures (84 479 ended-trade measurements, unique rows): 79 758 froze, 4 721 fell back (BAT 4 200, CYP 521). GAR, BUT and CRB never fell back.
- BAT: in every fallback, B retraces at least 0.886 of X → A (BAT-14 excludes this base, so it is never valid). The D level lies inside B, so the first touch comes before D passes B (BAT-07 also needs D beyond B).
- CYP: D at `endIdx` retraces 0.30–0.73 of X → C, below the 0.786 level, while the trade has an entry. Cause not fully diagnosed; the same quirk (entry before the "reached" wick) shows in the measurement.
- Halil's Butterfly case freezes (BUT never falls back).

## Base choice and 1123-A
- The choice among bases (`misses`) keeps measuring with the running D (`rankSource`). Without this, the base of an ended trade with a frozen D stayed the best one and hid new bases (20 shown bases changed in the golden comparison).
- Rule 1123-A (lost proportion) measures the D leg to the last candle with `shapeOf` (not the frozen D of the trade).

## Golden comparison (`formation-scan-golden`), before and after
- 202 shown candidates changed in 417 fixture/time keys. All 202 have the same base (X, A, B, C), side, entry, stop, entry candle and trade status (also open trades). Changed fields: D (point), checks that depend on D (value and state), TP1/TP2 and `missed` of the trade, SIG-29, `invalidBy`, and in 2 cases `verdict`. The number of hits per key did not change.
- Existing tests changed (expected consequence of the freeze): `formation-abcd-frozen-from-lib` (ABCD-19 stays ☑ after the end), `formation-abcd-lib` (sig-rsi-h4-01: RSI at the frozen D is 78.9, ABCD-17 ☐ and ABCD-18 ☑; sig-diverg-h4-01: ABCD-18 ☑, ABCD-20 bonus instead of required; drawing id lists with the new entry line). The verdicts of both stay invalid (ABCD-22).
