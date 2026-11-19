---
date: 2026-11-19
author: Claude
type: decision
status: done
pr: []
features: [ANA-21, FRM-03]
areas: [frontend]
---

# EWO trend rules: the color holds within two candles

## Request

The EWO lags the price. After a fast move, rules `welle` and `welle382` rejected the outermost wick, because the EWO still had the old color at the fractal candle. A later, less extreme fractal was drawn instead, and the formations (A, B, C) used it. Diagnosis: `2026-11-13-ewo-rule-pivot-one-bar-late.md` and `2026-11-19-trend-pivot-not-drawn-diagnosis.md`. The project owner decided (2026-11-19, 1119-A6.1.2): the color holds within two candles.

## Solution

| File | Change |
|---|---|
| `lib/formation/trdZug.ts` | `waveRule` (used by `welle` and `welle382`): a fractal passes when the EWO has the color of its side at any candle from the fractal candle (`idx`) to the candle that completes it (`doneAt`), both included. Green for a high, red for a low. |
| `i18n/messages/workspaceHints.ts` | The hint of the rule list says the color can come from the fractal candle or one of the next two candles (tr/en/de). |
| `e2e/mocked/formation-trd-lib.spec.ts` | New test (both rules): a low on a green candle with a red EWO at `doneAt` is the pivot. Two tests changed (see below). |

- The decision stays at `doneAt`. No later candle is used. The tests "Kein Blick in die Zukunft" stay green.
- `geruest`, `filter` and `groesse` are unchanged. Assumption: `welle` and `welle382` both use `waveRule`, so both change. The owner named the rule `welle382` and the cause is in `waveRule`.
- `earlyReversal.ts`, `diag.ts` and the formation code are untouched.

## Tests changed (owner-approved rule change, not a relaxation)

- "Regel welle: ein Hoch liegt in einer grünen, ein Tief in einer roten Phase" held the old rule. It now asks for the color at one candle from `idx` to `doneAt`. The GBPUSD D1 fixture gives 9 points with the new rule (5 before).
- "Regel welle: in jeder EWO-Welle steht höchstens ein Punkt, im GBPCAD-Chart 10 von 12 Referenzpunkten" held a result of the old rule: a pivot could not share an EWO wave with another one. With the window two pivots can share a wave (the GBPCAD run: 21 points in 18 waves). The test now checks the color window; the hit count 10 of 12 stays.

## Tests that went red in the precheck (fixture `abcd-breakc-h4-01`)

The fixture uses `welle382` (`FIXTURE_TRENDS`). Eight tests pinned a state that the old rule produced. The setup moved, the checks did not.

| Test | Old expectation | New setup, same expectation | Cause |
|---|---|---|---|
| `formation-abcd-lib` "abcd-breakc-h4-01: Verkauf, der Trend dreht vor D abwärts…" | before 2026-11-11 08:00 (forming, ABCD-26 unmet), after 12:00 (invalid, ABCD-26 met) | before 2026-11-10 08:00, after 2026-11-10 20:00; same states | The trend turns down at 2026-11-10 16:00 (before: 2026-11-11 08:00) because the pivots before it moved: high 2026-09-10 20:00 1.353 (before 09-09 08:00 1.35675), low 2026-10-14 16:00 1.31364 (before 10-14 20:00 1.31528, the GBPUSD case of `2026-11-13-ewo-rule-pivot-one-bar-late.md`). From 12:00 to 16:00 the H4 view reports another (buy) pattern, so "before" is 08:00. |
| `formation-trade` FRM-39 C ayağı: Kart 10, alt zaman AB=CD, Bekleme satırı, 4 × Geçmişe ait not (7 tests) | required group 4/4 or 3/4 with the trend row met | same numbers, same texts; the last derived D1 candle closes at 1.3565 (synthetic) | The trend of the D1 candles derived from the H4 bars changed. Old: high 2026-07-20 1.34805 and a change up on 2026-07-31. New: high 2026-07-15 1.35575 and no change. The trend row is the higher trend against the sell AB=CD. Without a change it is not measurable, so the required group fell from 3/4 to 2/4. |

Evidence for the new high: the H4 bars of the fixture have the high 1.35575 on 2026-07-15 20:00, which is higher than 1.34805 of 2026-07-20. The old rule did not draw it and drew the lower later high instead (the EWO color at that candle was not checked). The new rule draws the real extreme. That the trend row falls from 3/4 to 2/4 is a result of the rule, not a defect: the real D1 candles show no close above the real high.

## Measurement (local, not committed)

Fixtures `e2e/fixtures/formation/*.json`, H4 and H1, default trend settings, old code from `e83130ff` against the new code. "Changed" counts points that only one of the two runs has (same candle and side).

| Rule | Points old | Points new | Changed |
|---|---|---|---|
| `welle382` | 755 | 806 | 187 |
| `welle` | 863 | 1051 | 344 |

Of 101 fixtures, 41 (`welle382`) and 22 (`welle`) have no changed point.

GBPCAD D1 (12 reference points): `welle` 10 of 12 before and after (19 → 21 points); `welle382` 10 of 12 before and after (17 → 19 points).

Sample of `2026-11-19-trend-pivot-not-drawn-diagnosis.md`: the journal lists 14 of the 29 cases. The table shows the first point on the C side within -2 to +30 candles of the C candle (`welle382`). The column `groesse` is information, not a decision. The 14 cases do not all have the same pivots before the fixture start, so the live model can differ.

| C candle | Side | Old | New | `groesse` |
|---|---|---|---|---|
| XAUUSD 2025-11-14 12:00 | low | +11 candles | same | same |
| XAUUSD 2025-11-14 16:00 | low | +10 | same | same |
| EURUSD 2025-11-17 20:00 | low | +23 | same | same |
| EURUSD 2025-11-28 08:00 | low | none | none | +1 |
| GBPUSD 2025-11-20 16:00 | high | none | none | none |
| GBPUSD 2025-11-24 20:00 | high | +28 | same | same |
| GBPUSD 2026-01-02 00:00 | high | +14 | same | +4 |
| GBPUSD 2026-11-10 00:00 | high | +2 | same | same |
| GBPUSD 2026-07-21 20:00 | low | +28 | same | same |
| GBPUSD 2026-10-20 20:00 | high | +9 | same | same |
| USDJPY 2025-11-25 20:00 | low | none | none | +22 |
| USDJPY 2025-12-04 16:00 | low | +4 | same | same |
| USDJPY 2025-12-11 12:00 | low | +18 (154.39) | **+1 (154.942)** | +1 (154.942) |
| USDJPY 2025-12-23 04:00 | low | none | none | +1 |

Only 1 of the 14 changes, and it moves to the point that `groesse` draws. The earlier diagnosis said 5 of 20 W2 cases can change; this table covers only 14 of the 29 cases, and the reason for each unchanged case was not checked.

## Verification

- Red first: the new test fails on the old code (both rules, no pivot on the deep wick), and passes with the new code.
- `npx playwright test --project=mocked e2e/mocked/formation-trd-lib.spec.ts e2e/mocked/formation-x-deepest-wick-lib.spec.ts`: all pass.
- Not verified: a live rescan (`pivotNotDrawn` count). It needs the machine lock and the live account; this session did not run it.
- Not verified: the 15 sample cases that the journal does not list.

## Lessons

- A test that pins the output of a rule (here "one point per wave") breaks when the owner changes the rule. Keep tests on the rule text, not on a side effect of it.
