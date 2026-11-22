---
date: 2026-11-21
author: Claude
type: fix
status: done
pr: [647]
features: [FRM-07, FRM-39]
areas: [frontend]
---

# Harmonics: a running trade stays in the search, C freezes at entry

## Request
The live history scan (FRM-39, EURUSD H4, PR 642) found harmonic candidates that had an entry and a running trade, and that vanished in a later scan (`candidateVanished`). Decision 1120-A42.1 says that only a finished trade can drop out. Halil approved two changes on 2026-11-21: 1121-A1.3 = 1A (prefer the base with an entered, unfinished trade, searched in `HISTORY_DAYS`) and 1121-A2.1 = A ("C girişte donar": after the entry candle closes, `shiftC` does not move C).

## Cause
- `analyzeXabcd` (`src/lib/formation/xabcd.ts`) returned one candidate per timeframe: the base with the fewest `misses` among the last `lookbackPivots` pivots, the youngest on a tie. When a new pivot came, a base without a trade replaced the base with the running trade (EURUSD H1 Bat, 2026-08-31).
- `shiftC` moved C when a candle closed beyond B, also when that close came after the entry. Entry and stop stayed, but C, the correction depth and the verdict changed after the entry (EURUSD H4 Gartley and Bat, 2026-09-14).

## Change
- `Trade.entryIdx`: the freeze candle of a harmonic trade (set in `withTrade` when the trade has a status).
- `shiftC` and `shiftBase` take `untilIdx`: only a close beyond B up to and including the entry candle moves C. `candidateOf` measures with the moved C first; if the first close beyond B is after the entry candle, it measures again with C at the pivot. The rule before the entry (Halil 2026-11-13) does not change.
- `analyzeXabcd`: an entered trade that is still running, or that ends in the last candle, has priority if its base was the best base at the close of the entry candle ("shown at entry"). The search uses all bases with X in `HISTORY_DAYS`. Of more than one, the first entered trade stays; then fewest `misses`; then the youngest. The best key for a time is cached per context and checker.
- While a running trade continues, a new valid candidate on the same timeframe is not visible. This is the known cost of 1A; 1B (more than one candidate per timeframe) stays an option for later.
- `formation-gar-bat-lib.spec.ts` (approved by the coordinator, 1120-A48.1): `bat-sell-h4-02` checks the sell Bat with its points through `checkBatCandidate` (all states and the verdict as before). A new test shows that the search keeps the running buy Bat (entry 10-23 16:00) and shows its end once (TP2, candle 10-27 12:00). After that, the sell Bat does not become the candidate, because its own trade ended before (candle 10-24 16:00, TP2).

## Evidence
- `e2e/mocked/formation-harmonic-vanish-lib.spec.ts` (@FRM-07, real EURUSD candles): the H1 Bat and the H4 Gartley tests, a guard that walks both windows candle by candle for GAR, BAT, BUT, CRB and CYP (a running trade keeps its points, entry and stop while its pivots stay), a guard that the result at time t is the same with and without later candles, and a `shiftC` unit test. With the code of `main`: 4 failed, 1 passed (the look-ahead guard). With the change: 5 passed.
- All `formation-*-lib` specs: 1997 passed.
- Live scan, DEMO account, read-only, heavy lock: `FORMATION_HISTORY_TFS=H4 FORMATION_HISTORY_SYMBOLS=XAUUSD FORMATION_HISTORY_BARS_H4=1560 FORMATION_HISTORY_STEP_H4=1`.

| Code | harmonic `candidateVanished` | `entryChanged` | `targetNotOnProfitSide` | ms per scan |
|---|---|---|---|---|
| `main` | 16 (20 with AB=CD) | 0 | 3 (AB=CD) | 284 |
| this change | 9 (14 with AB=CD) | 0 | 3 (AB=CD) | 352 |

- A first version gave priority to every running trade in the window, also to trades that were never shown: 339 `candidateVanished` and 397 `targetNotOnProfitSide`. A second version checked "shown" at every candle since the entry: correct for the scan, but a first analysis with a new context took 12 to 24 s per form. Both are not used.
- Cost of one analysis (XAUUSD, one form, all three timeframes): `main` about 120 ms; this change about 150 ms with a filled cache, up to 710 ms with a new context.

## Open
The 9 harmonic `candidateVanished` of the XAUUSD scan, replayed from the same candles:
- 6: the trade ended between two scans of the H1 context timeframe (in one of them, H1 BUT buy X 2026-06-08 08:00, the pivot of C also moved) (the scan reads H1 only at each H4 step). At the vanish scan the trade is finished (stop, breakeven or TP2), but the scan did not see the finished state. Examples: H1 CRB sell X 2026-03-25 05:00, end 04-08 01:00; H1 GAR buy X 2026-09-02 06:00, end 09-14 09:00.
- 1: the trend moved the pivot of C after the entry (H1 BUT sell X 2026-01-14 21:00, C 01-29 17:00 → 01-30 11:00). This is a trend question, not `shiftC`.
- 2: the trade became the best base only after its entry, and later another base became the best (H4 GAR buy X 2026-10-07 12:00; H1 GAR buy X 2026-10-02 04:00). The stateless check "shown at entry" does not keep it; a check at every candle since the entry is too slow without state.
These need a decision: a spec change for the H1 cadence (check the trade status at the vanish scan), a rule for the moving last pivot, and state or 1B for the trades shown only after entry.
