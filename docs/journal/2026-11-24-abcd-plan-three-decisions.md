---
date: 2026-11-24
author: Claude
type: decision
status: open
pr: []
features: [FRM-05, FRM-07, FRM-39, TRD-06]
areas: [frontend]
---

# Plan 1114-A4: three open decisions (1124-A1, A2, A3)

## Request
Plan 1114-A4 (AB=CD) left three open points: the trend rule `welle` has no minimum leg size, a set of new violation classes, and the end criterion 1122-A40. Halil gave the coordinator the authority to make these decisions during the night: "Sabaha kadar verilmesi gereken kararlar varsa kendin ver ve sabah saat 7'de bana rapor ver. Sonra ben değiştirmek istediklerimi değiştiririm." Each decision below can change after Halil reads the morning report. Each has a visual page with the options (private artifacts of the coordinator session).

## 1124-A3: end criterion of a plan (1122-A40)
- Options: (a) the target classes are zero and each remaining case has a written cause; a new violation class found during the plan goes to the journal as an open finding and becomes a separate plan; a running trade that leaves the screen is always fixed. (b) zero violations; each new class is added to the plan. (c) track only the classes of the first list.
- Decision: (a). Confidence: high.
- Evidence that changes it: a new class that hides a running trade that leaves the screen (then that class is an exception), or Halil wants a class in the current plan.
- Result for 1114-A4: the target classes are zero in the last XAUUSD H1 history scan (`candidateVanished` 0, `entryChanged` 0, `targetNotOnProfitSide` 0; proportion rule PR 653). Plan 1114-A4 is closed.
- Not done: the rule is not written into a rule file. Rule files change only when Halil asks (`hooks/RULES.md` §6). A proposed sentence is in the morning report.

## 1124-A2: new violation classes
Sources: the `Open` sections of the journal entries 2026-11-20 to 2026-11-23 and the diagnosis notes of the plan.

Closed before this decision: target on the loss side (PR 643, 646; last scan 0); 77 lost running harmonic trades (PR 651); harmonic trade shown only after entry (PR 648, Rule B); 3 EURUSD cases (PR 647); BUT/CRB TP2 at the touch wick (PR 638); spec examples (3 per class already); false vanish on a context time frame (re-measure at vanish, 1122-A1.3.2).

Open classes:
| Class | User impact | Decision |
|---|---|---|
| S1: vanish outside the history window | The history scan did not count trades whose first point is before the window. A harmonic window starts at X, so a running trade can leave the screen. | Measure (PR 658). Result: 3 running M15 harmonic trades vanish (XAUUSD, H1 scan). Fix plan started (exception of 1124-A3). |
| S2: end never shown | A trade that ends and vanishes between two scans. On the main time frame the user never sees the end (against 1120-A42.1). | Measure (PR 658). Result: main time frame 0 in the H1 and H4 scans; context time frame 16 and 15 (scan step). Closed for XAUUSD. |
| S3: ended trade vanishes (`finishedVanished` 126) | Allowed by 1120-A42.1. | Stays a counter. S2 separates the real error from it. |
| S4: formation from a small swing | Trend rule `welle` has no minimum leg. | Decision 1124-A1. |
| S5: scan speed (recursive "shown at entry") | In the limits now (H4+H1+M15 worst 9.9 s of 15 s; D1+W1+H4+H1 1.75 s of 3.2 s). | Separate plan, deferred until the time is near a limit. |
| S6: stacked D badges | Each badge at its own D? Visible UI change. | Design first; ask Halil. |

- Options: (a) measure first, then fix only real errors; (b) fix all now; (c) do nothing.
- Decision: (a). Confidence: medium to high.
- Evidence that changes it: S1 or S2 cases on other symbols.

## 1124-A1: trend rule `welle` and the minimum leg
Measurement after PR 653 (local year data XAUUSD, DEMO, read-only; H4 each candle, H1 each 4th, M15 each 16th candle; 110 fixtures):
- The case (XAUUSD M15, 2026-11-19, A 3742.54, B 3725.35, C 3737.71, AB/ATR 2.12): entry 13:45, stop by close 14:30 (CD/AB 1.58, end shown one time). The candle 16:00 goes beyond 1.618 × AB; the candidate is dropped at 16:15. `welle382` never selects this triple.
- Turning points on the same candles, `welle382` / `welle`: M15 675 / 1321, H1 212 / 354, H4 65 / 103. Legs below 2.5 × ATR: `welle382` 8 to 10 %, `welle` 22 to 25 %, `groesse` 4 to 5 %.
- AB=CD formations with AB < 2.5 × ATR: `welle382` M15 6, H1 4, H4 0; `welle` M15 48 (8 running), H1 19 (6), H4 14 (2).
- Entered trades of `welle` (XAUUSD): stopped 23 % with AB < 2.5 × ATR (n = 31), 19 % with AB ≥ 2.5 × ATR (n = 111). Significance not measured.
- Shown AB=CD with CD/AB > 1.618: not entered 0; ended only in the end candle.

- Options: (a) add `minSize` × ATR to `welle` (changes the trend, the zones and all forms; no source in the rule book); (b) AB=CD only: AB ≥ k × ATR (new rule, the rule book gives no minimum AB; k = 1.5 removes 1 XAUUSD formation with `welle382`); (c) keep `welle` without a size.
- Decision: (c). The rule book gives no size for this rule, and the code says so (`ruleHasNoSize`). The complaint (D moved for days) is fixed by PR 653. The standard rule `welle382` has almost no small AB. Confidence: medium.
- Evidence that changes it: Halil uses `welle` as his default and calls small-swing formations noise (then b with k = 1.5); on other symbols, trades with AB < 2.5 × ATR stop clearly more often; the rule book gives a size for `welle` (then a).
- No code change.

## Open
- [ ] Fix S1: running harmonic trade vanishes when X leaves the history window (in work).
- [ ] S2 and S1 on other symbols (only XAUUSD measured).
- [ ] S5 speed plan, S6 badge design (Halil).
- [ ] `scripts/features/run.sh render` fails on main: items of `pruefung` without quotes in FRM-05, FRM-18 and FRM-39 become YAML maps (found in PR 658).
