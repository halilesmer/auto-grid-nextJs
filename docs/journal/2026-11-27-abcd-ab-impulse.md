---
date: 2026-11-27
author: Claude
type: decision
status: closed
features: [FRM-05, FRM-08]
areas: [frontend]
---

# AB=CD: AB must be an impulse of the trend line

## Request
Decision 1126-A13.2 (assumption, rulebook of 2026-11-26). ABCD-01: "A = start of the first impulse, B = end of the impulse, C = end of the correction". Definition: "second impulse CD as long as the first AB". Trend link: "the trend change … decides which move is AB". So AB is an impulse of the trend line of the formation timeframe, BC the correction. Before this change `selectOrder` took the newest triple with a valid depth and did not look at the type of AB.

## Decisions of the coordinator (1126-A13.2.1 to .4)
- The assumption stays. The real series in the tests (`gar-buy-h4-01`, `sig-diverg-h4-01`, `abcd-double-h4-01`) are market data; their triples were the old choice, not teacher drawings. "With trend" trades are about the next higher timeframe (ABCD-14); in the formation timeframe AB is an impulse (TRD-11, TRD-13, TRD-15).
- `selectOrder` does not check the type of C. It changes later through events in the D leg, which ABCD-05 and ABCD-26 measure; the choice does not.
- Synthetic test points are changed so that AB is an impulse of the trend line; the rule under test stays the same.
- 1126-A20.2 is not changed. A close without a rule-conform AB=CD has an empty candidate (see below).

## Change
- `abcd.ts`, `selectOrder`: candidates are the triples of the last `lookbackPivots` pivots with `pivots[j - 1].kind === 'impulse'` and a valid depth, newest first. Fallback as before: the last three pivots, appended when they are not a valid choice (depth wrong or AB not an impulse). Their ABCD-01 is unmet.
- `abcdChecks.ts`, `abIsImpulse(trend, s)`: if B is a pivot of the trend line (same index and side) its `kind` counts; if not (own points) the direction of AB must equal `trend.dir`. ABCD-01 requires it. `formHolds` (trade of the choice) uses the same function, so an unmet ABCD-01 gives no trade (1126-A20.2).
- `ruleTexts.ts`: ABCD-01 text now says "AB is an impulse in the trend direction" (tr/en/de).
- Not changed: trend rules, harmonics, priority rule (1122-A1.3), the 1126-A20.2 rules, D rules, entry time (question 1126-A20.2.1).

## Tests (`formation-abcd-ab-impulse-lib.spec.ts`, @FRM-05, XAUUSD H1 `long-leg-xauusd-h1.json`)
1. 2026-01-02 22:00: shown A 4549.88, B 4274.05, C 4402.30 (before: A 4274.05, B 4402.30, C 4315.17, AB up in a down move).
2. Without an impulse triple the last three pivots stay (pure `selectOrder`).
3. Closes with only a non-impulse triple: the candidate exists, ABCD-01 is unmet. 36 of 5999 closes have no candidate (below).
4. Own points: AB a correction gives ABCD-01 unmet; AB an impulse gives it met.
`abcd-breakc-h4-01` 2026-11-10 20:00 (existing test, `formation-abcd-lib.spec.ts`): ABCD-26 invalid again, because the choice no longer reads the type of C. It failed with the first version of the change (C condition) and stays green after the coordinator's decision .2.

## Closes with an empty candidate (1126-A13.2.4)
XAUUSD H1, close = open of candle + 1 h, candle index: 680–704, 1410–1411, 3337–3338, 4847–4850, 5809–5811 (36 closes; EURUSD 12). There the triple with an impulse AB is missing and the fallback (last three pivots, ABCD-01 unmet) is dropped by `proportionLost` (1123-A: D leg beyond 1.618 × AB). No AB=CD meets the rules at that moment, so the empty candidate is correct. Test 3 holds candle 680, 1410, 3337, 4847 and 5809 as empty.

## Changed fixed expectations
- `abcd-double-h4-01`, ABCD-20 test (2025-11-18 12:00): old shown triple sell A 178.962, B 179.635, C 179.256 (AB up, impulse). The search now shows the running buy (A 179.963, B 178.962, C 179.635), so the test measures the old triple directly with `checkAbcdCandidate`; same rule states (ABCD-23 ☐, ABCD-10 ☑, ABCD-20 ☐, invalid by ABCD-20) plus ABCD-01 ☑.
- `sig-diverg-h4-01`, SIG-24 test (2025-12-02 12:00): old shown sell A 1764590400, C 1764619200 (AB a correction in a down move). Now shown is the buy A 1764288000, C 1764345600, `stopped`; this is the triple the test measures. Entry check on the old sell removed.
- `gar-buy-h4-01`, 1123-A test (`formation-abcd-broken-shape-lib.spec.ts`): old triple A 1.17279, B 1.15764, C 1.16472 (AB down in an up trend, ABCD-01 unmet, `invalid`). Same case on an impulse AB at 1761105600: A 1.15419, B 1.17279, C 1.15973, valid shape, no entry, `forming`.
- `invalidBy` test (`formation-abcd-lib.spec.ts`): C 95 under A 100 turns the trend line, so AB read as a correction. C 99.9 (wick only) keeps ABCD-01 ☑ and gives the same `invalidBy` ABCD-05, ABCD-06.
- "Büyük hedef" (two tests): buy triple 130 → 111.46 → 124.94 got a lead-in 140 → 100 (down trend), indices a 28, b 32, c 36. "Erken dönüş" (4 tests): lead-in 60 → 140, `ER_ABC` a 18, b 26, c 34.
- `formation-abcd-vanish-classes-lib.spec.ts`, rule B (1122-A1.4 b), two tests: the M15 case (A 07-06 04:45) and the older-trade case (A 07-10 00:00) no longer exist after the new choice. The rule still acts in `abcd-buy-h4-02`: with the memory switched off the search shows trades at 2025-06-11 12:00 (A 06-10 08:00, C 06-11 00:00) and at 2025-06-19 00:00 (A 06-17 20:00, C 06-18 12:00) that were not shown at their entry; with the memory they never appear. The two new tests hold that.

## Page tests (`formation-trade.spec.ts`, FRM-39 trade block; failed in `precheck.sh`, 13 tests)
The tests check how the trade block looks, not the choice. At the old moments the new choice shows another triple (AB not an impulse) without a trade. Changed moments:
- AB=CD with TP2 (`124`, `220`, `287`): `abcd-buy-h4-02` 1752624000 − 30 × 14400 (sell, A 1752019200) → 1752206400 (sell, A 1752105600, C 1752163200, status `open`).
- TP1 taken (`164`, `181`): `abcd-double-h4-01` 1763452800 (sell, TP1) → `abcd-buy-h4-02` 1752235200 (same triple, TP1). New values by hand: entry 0.82528, stop 0.82675834, TP1 fill 0.8241292, TP2 0.8230908, risk 0.00147834; "so far" ½ · 0.0011508 / 0.00147834 = 0.389 (+0,39, was +0,43); "if TP2" ½ · (0.0011508 + 0.0021892) / 0.00147834 = 1.130 (+1,13, was +1,19). Plan values +0,50 and +1,31 stay.
- Big target of a harmonic D (`256`, `278`, `760`, `766`): `gar-buy-h4-03` 1765569600 → `crb-buy-h4-01` 1763395200 (EURUSD buy, A 1763049600, C 1763136000, entry 1.15908, `open`, big target set). The break test uses 1763395200 + 14400.
- Synthetic (1127-A1.1), TP1 with big target (`269`): `crb-buy-h4-01`, candle 1763438400 (index 190): open 1.15903 → 1.1591, low 1.15877 → 1.1591, high 1.16033 → 1.1612. The real series has no case with TP1 and big target on an impulse AB. The change lets price reach TP1 (1.16097) before the stop and without touching the entry (else the status is `breakeven`).
- Synthetic (1127-A1.1), early reversal buy (`298`, `333`): `frz-support-h4-01`, candle 1759507200 (index 118): close 24399.79 → 24392; candle 1759521600 (index 119): close 24398.19 → 24390. Two closes under the counter point 24395.47 turn the trend down (TRD-15), so the buy triple A 24550.19, B 24345.79, C 24458.17 has an impulse AB. Entry 24442.92 and the early reversal come back.
- Synthetic (1127-A1.2), early reversal sell (`kei-sell-h4-01` replaced, test "Verkauf: Status Erken dönüş…"): price mirror of `frz-support-h4-01` with the 1127-A1.1 changes, every candle p → 48800 − p, high and low swapped. The buy becomes a sell with early reversal. Target 1 by hand: 48800 − 24450.97 = 24349.03; the page shows 24.349,030 (the mirror is symmetric: no buy/sell asymmetry). Old case: `kei-sell-h4-01` 1763668800 (sell, early reversal, "target 1 — noZone"). Now the newest triple there is a buy with an impulse AB and a running trade (priority, 1122-A1.3), and the sell triple has an AB that is a correction in a down trend.
- OHLC check of all changed candles (low ≤ open, close ≤ high): `frz-support-h4-01` 1759507200 close 24392 (low 24350.09, high 24415.94) ok; 1759521600 close 24390 (low 24345.79, high 24400.19) ok; `crb-buy-h4-01` 1763438400 open 1.1591, low 1.1591, high 1.1612, close 1.15975 ok. The mirror keeps the order by construction.

## Lost coverage (1127-A1.3)
The page no longer checks "target 1 `—` with reason `noZone`, ratio `—`" in an early reversal (old test on `kei-sell-h4-01`). The data side is tested for both directions in `formation-abcd-lib.spec.ts` ("işlem yönünde hiç bölge yoksa hedef 1 ve hedef 2 yok"). The mirror cannot hold the claim: target 1 comes from two opposing zones (24450.97–24451.97, candle 112; 24481.94–24550.19, candles 115 and 116). Candle 115 is point A, so the zones cannot go without moving A; a new synthetic early-reversal series is outside this change.
Next candidate: `fib-levelprice-h1-01` at 1764000000 (H1, sell, early reversal): `trade.tp1` is null with reason `noZone`, `earlyReversal.target2` is null. A page test needs an H1 main series (`openPage` takes H4 rows).

## Golden comparison
Before and after with `GOLDEN_FULL_DIR`: 142 of 417 stored scan results changed. No other form than AB=CD changed. Classes (hits):
- (a) 88 hits: the chosen triple changed and its AB is an impulse (ABCD-01 met).
- (b) 11 hits: the chosen triple changed to the fallback (ABCD-01 unmet). 68 hits keep the triple but ABCD-01 is now unmet (checks and `invalidBy` changed; 11 of them also lose the trade and the verdict).
- 8 hits: only the nested `displaced` field changed.
- 25 results with another hit count: 28 new triples with AB an impulse, 14 new triples with ABCD-01 unmet, 70 old hits gone. Of the 70 gone hits, 19 are results where the fallback is dropped by `proportionLost` (1123-A); with that rule switched off these results keep a hit. 3 results (`crb-bad-h4-01@0.8`, `cdt-top-h4-02@1`, `tdf-bowl-h4-01@0.6`) lose a hit whose triple still has an impulse AB: the shown-trade memory (1122-A1.4) hides it, because at its entry the new choice showed another triple. That is a ripple of the choice, not a rule change (same as in 1126-A20.2).
Hashes updated (`GOLDEN_UPDATE=1`; limits `__keyBuildsMax` and `__evaluatedMax` kept).

## Trades over every H1 close (default trend setting, candle 300 to the end of the fixture)
- XAUUSD (6000 closes): 25 → 26 trades; closes with a candidate 5991 → 5964; empty 9 → 36.
- EURUSD (6326 closes): 21 → 23 trades; with a candidate 6323 → 6314; empty 3 → 12.
(A trade is one A/B/entry combination that was shown with an entry at any close.)
