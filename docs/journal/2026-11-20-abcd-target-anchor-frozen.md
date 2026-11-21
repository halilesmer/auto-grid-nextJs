---
date: 2026-11-20
author: Claude
type: fix
status: done
pr: [643]
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD: the target Fib start is frozen at the entry; a target counts only on the profit side

## Request
The XAUUSD H1 history scan (`2026-11-20-formation-measure-xauusd-h1.md`) found 11 new AB=CD violations on the buy side: `fillOnLossSide` 10 times (`tp1Fill`, state `breakeven`) and `targetNotOnProfitSide` 1 time (`tp1`, state `open`). The cause was not known. The coordinator asked for a diagnosis, then for the fix that Halil chose.

## Cause
`abcdChecks.ts` gave `tradeStatusOf` the current target Fib start (`from`): A when ABCD-19 (divergence) or ABCD-16 (harmonic D) is met now, C if not. The stop uses `frozenFrom`, the start at the entry candle. When D ran on after the entry, ABCD-19 could change from met to unmet. Then `from` changed from A to C, and `tradeStatusOf` calculated a trade that had already ended again with the new start.

Example (buy, key `buy|1778752800|1778756400|1778770800`): A 4718.75, B 4692.14, C 4710.02, level 1 (entry) 4683.41. The entry candle (2026-05-14 16:00) touched level 1 exactly (wick 4666.82). ABCD-19 was met, so `frozenFrom` = A and the stop = 4669.91. TP1 counted in the candle 17:00, and the same candle closed below the entry (rest at entry). Up to 22:00 `tp1Fill` was 4686.66 (+0.120 R). After the candle 22:00 (D 4653.15) ABCD-19 was unmet, `from` = C, and `tp1Fill` of the same candle became 4683.32: 0.09 below the entry of a buy (−0.003 R). From C the running TP1 goes below the entry when D is more than 0.618 × (C − entry) beyond the entry; here the limit was 4666.96, and D was 4666.82.

## Decision 1120-A35.1
Halil chose "B + guard":
- After the entry, the target Fib starts at the `from` of the entry candle (`frozenFrom`). This applies to the trade status (`tradeStatusOf`), the running TP1, TP2 and TP3 (`abcdTrade`) and the target Fib drawing Z-ABCD-05. Before the entry, the start follows ABCD-19 and ABCD-16 as before. The stop already used `frozenFrom`. The big AB=CD target (D + offset) does not use the start and does not change.
- Guard: in `tradeStatusOf` a target (TP1, TP2, big target) counts only when its price is on the profit side of the entry (buy: above, sell: below). Even with a frozen start, a very deep wick (no close beyond the stop, no touch of the emergency stop) can pull the running TP1 behind the entry; the target does not count in that candle. The early reversal and the re-entry do not use `tradeStatusOf` for their own targets and do not change.

## Solution
| File | Change |
|---|---|
| `lib/formation/abcdChecks.ts` | `targetFrom = frozenFrom ?? from`; `abcdTrade`, `tradeStatusOf` and `drawingsOf` (Z-ABCD-05) use it. `frozenFrom` is set only when level 1 is reached, so before the entry nothing changes. The TP3 condition (divergence now) does not change. |
| `lib/formation/tradeStatus.ts` | `touchesTarget` is true only on the profit side of the entry. |
| `e2e/mocked/formation-abcd-frozen-from-lib.spec.ts` | New. The real case (86 H1 candles, only H1, default trend settings): `tp1Fill` above the entry, the status of the ended trade does not change with later candles, TP1, TP2 and Z-ABCD-05 run from A. The first two tests failed before the fix. Guard tests (sell and buy): a TP1 behind the entry does not count; a TP1 on the profit side counts as before. |
| `e2e/mocked/formation-abcd-lib.spec.ts` | New test: up to the entry the target Fib starts at C without divergence and at A with divergence at the entry candle. |
| `e2e/mocked/formation-trade.spec.ts` | Re-entry tests changed (Decision 1120-A47.1), see below. |
| `docs/features/features.yaml` | FRM-05: frozen start after the entry, guard. |

## Decision 1120-A47.1: re-entry tests
The guard made 5 re-entry tests in `formation-trade.spec.ts` fail: "Nach zwei Zielen …", "375 px: Abschnitt und Warnzeile …", "Zwei Ziele …", "Ein Ziel …" and "375 px: der Abschnitt mit zwei Zielen …". They used the real fixture `crb-form-h4-01` (buy, now 2025-11-18 20:00) and expected the state `tp12` and the re-entry section. In that fixture the entry is 100.57 and the target Fib starts at C 101.129. The wick of the entry candle (100.142) pulls the running TP1 to 100.519, below the entry of a buy. The old expectation `tp12` came from a TP1 fill on the loss side (`tp1Fill` 100.519). That is the defect that the guard removes, so the old expectation was wrong. This is not a weaker test.
- The 5 tests now use a synthetic candidate: the same fixture with the low of the entry candle (index 199) at 100.30. Then TP1 (100.617) and TP2 (100.812) are above the entry and count in candle 200; the re-entry values are the same as before (target 101.123, second target 101.403 with the higher high of candle 201). The re-entry section, TP1/TP2 and the state chain are tested as before.
- The real `crb-form-h4-01` stays as a guard test: in the UI (`formation-trade.spec.ts`, "Schutz …") and in the library (`formation-abcd-frozen-from-lib.spec.ts`). Expected: state `open`, no `tp1Fill`, no re-entry, no warning line.

## Verification
- Mocked, `--grep @FRM-05`: 292 passed. The new tests in `formation-abcd-frozen-from-lib.spec.ts` failed before the change (2 of 3) and pass after it.
- XAUUSD H1, window 2026-05-14 10:00 to 2026-05-21 00:00, step 1, the same contexts (H4, H1, M15) as the history spec, candles read from the DEMO worker today: before the change 42 AB=CD trade states with `fillOnLossSide` (all the example key); after the change 0 `fillOnLossSide` and 0 `targetNotOnProfitSide` in 48 trade states.
- Live history spec, `FORMATION_HISTORY_TFS=H4 FORMATION_HISTORY_SYMBOLS=EURUSD FORMATION_HISTORY_BARS_H4=400`: 400 scans, 7 AB=CD candidates, 0 violations.

## Open
- The single `targetNotOnProfitSide` `tp1` `open` hit of the history scan has no example key. The window scan (14 to 21 May) did not contain it. Assumption: the same cause (the start changed to C while the trade was open). A full XAUUSD H1 history scan after the merge shows if it is gone.
