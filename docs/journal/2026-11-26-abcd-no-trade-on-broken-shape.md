---
date: 2026-11-26
author: Claude
type: fix
status: closed
features: [FRM-05, FRM-08]
areas: [frontend]
---

# AB=CD: a triple with a broken shape carries no trade

## Request
Decision 1126-A20.2 (assumption, taken from the rulebook acceptance case `abcd-neg-h4-01`: "no trade, invalid by ABCD-06"). If ABCD-01, -02, -04, -05 or -06 is unmet, the triple has no trade. Harmonic patterns got the same rule in 1125-A1 (PR 691); AB=CD was not changed that day.

## Cause
`tradeOnlyOf` (choice and priority queue, 1122-A1.3) and `evaluateFull` (shown candidate) built entry, stop, targets and status from the D wick alone. The shape checks only set the verdict `invalid`. So an invalid triple (for example C beyond A, depth > 1) still opened a trade at level 1, and as a running trade it took the priority over a valid or forming AB=CD.

Coordinator measurement (app scan, every H1 close, 2025-11-20 to 2026-11-26, default trend setting): XAUUSD 8 of 34 shown trades, EURUSD 4 of 25, all with depth > 1; with priority they hid a valid or forming AB=CD at 16 closes (XAUUSD) and 3 closes (EURUSD).

## Change (`abcdChecks.ts`)
- `formHolds(bars, s)`: the same measurement as ABCD-01, -02, -04, -05, -06. `tradeOnlyOf` returns the bare candidate (no trade) when it fails, so the triple cannot win the choice by its trade and cannot enter the priority queue.
- `evaluateFull`: when one of the five checks is unmet, the candidate keeps its points, checklist, verdict, `invalidBy` and the D arrow, but has no `trade` (no entry, stop, targets, status, re-entry, C-leg) and the trade drawings (`rules === TRADE_RULES`: Z-ABCD-05, -07 to -12) are removed. The C-leg (`cLeg`) is part of the trade block, so it goes too.
- Not changed: trend rules, `selectOrder`/`selectPoints`, D rules (ABCD-10, -20, -23, -26; question 1126-A20.2.1), harmonics, UI, i18n.

## Tests (`formation-abcd-broken-shape-lib.spec.ts`, @FRM-05, real H1 candles)
1. XAUUSD 2025-12-23 18:00, A 4374.58, B 4309.38, C 4497.66: invalid by ABCD-05, no trade (before: entry 4432.46, `open`).
2. EURUSD 2026-07-14 16:00, A 1.13839, B 1.14454, C 1.13769: no trade (before: sell 1.14384).
3. XAUUSD 2026-10-06 18:00: the shown candidate is the forming triple A 4226.26, B 4103.82, C 4179.63 (before: the invalid triple with a trade took the priority).
4. Positive control: XAUUSD 2026-10-08 07:00, depth 0.658, sell entry 4061.99 stays, status `tp1`.
Tests 1 and 3 were red before the change (test 1: `trade` was defined; test 3: shown A was 4147.32), green after.

## Why `proportionLost` (1123-A) had to change
`precheck.sh` failed `formation-abcd-overshoot-lib.spec.ts` ("without entry, D never lies beyond maxCdAb × AB"): `abcd-buy-h4-02.json 208`, expected <= 1.618, received 2.5527.
- Cause: `proportionLost` drops a candidate only if it has an ended trade (`trade.status.endIdx`). A broken triple used to carry an ended (stopped) trade, so it fell out when D ran on. Without a trade it was shown for ever as `invalid`. That is a regression against `main`.
- Change (`proportionLost`): a candidate without any trade gets the same limit at once. A triple with a valid shape and no entry has D at level 1 at most (CD ≤ AB), so the rule never fires there; a trade-less candidate with CD > 1.618 × AB exists only when the shape is broken. Behaviour of `main` is kept.
- Effect on the golden scans (417 stored results, with and without this change): 32 results differ. In 31 hits a broken AB=CD (one of ABCD-01/-02/-04/-05/-06 unmet) is no longer shown; in 4 hits the next candidate in the order moves up. No hit with a valid shape dropped; no other form changed.
- Tests (`formation-abcd-broken-shape-lib.spec.ts`): `abcd-buy-h4-02` bar 208 has CD ≤ 1.618 × AB (red without the change, received 2.5528); `gar-buy-h4-01` (valid shape, no entry, A 1.17279, B 1.15764, C 1.16472) stays shown as `forming`. The existing overshoot test (110 fixtures, every 8th bar) stays as it was.

## Changed fixtures of existing tests
These tests used a trade on a triple whose shape is broken. They now use a triple with a valid shape.
- `formation-vanish-remeasure-lib.spec.ts`, "ended between two scans": old M15 sell, A 4125.01, B 4146.68, C 4097.05, depth 2.29 (ABCD-05/-06 unmet). New: XAUUSD H1 from `long-leg-xauusd-h1.json`, A 5238.65, B 5125.82, C 5191.72, depth 0.58; seen with TP1 at 2026-03-13 04:00, at 19:00 the rest ended at the entry (candle 17:00).
- `formation-trade.spec.ts`, TP1 and TP2 taken (two tests): old `abcd-buy-h4-02` at 2025-06-12, depth 1.53. New: same file at 1751256000 (2025-06-30 04:00), sell, A 0.82427, B 0.82836, C 0.82652, depth 0.45, entry 0.83061, stop 0.83303188. The actual result of the highlighted box is +1.14 R by hand (risk 0.00242188; TP1 filled 0.82870106 = 0.788 R, TP2 filled 0.82700894 = 1.487 R; half each).
- `formation-trade.spec.ts`, "only TP1 taken, price back in the zone": old `abcd-breakc-h4-01` at 1783699200, depth 0.97 (ABCD-06 unmet). New: `abcd-neg-h4-01` at 1751428800, A 145.946, B 143.747, C 144.941, depth 0.54, status `tp1` with the warning.
- `formation-trade.spec.ts`, "missing values" and "ABCD in the making" (two tests): old `gar-buy-h4-01` at 1761192000, where the page showed a triple invalid by ABCD-05/-06 (no trade block). New: same file at 1761580800 (A 1.17279, B 1.15764, C 1.16472, depth 0.47, `forming`, entry empty).

## Golden comparison
Before and after with `GOLDEN_FULL_DIR`: 111 of 417 stored scan results changed (page runs and walks included). Every changed hit is AB=CD; no other form changed. Classes:
- 100 hits: same triple, trade removed (checks of the form unmet; 94 differ only in `trade` and trade drawings, 6 also in the nested `displaced` candidate).
- 18 hits: a broken triple with a trade is no longer chosen; 55 broken triples appear without trade and 10 further AB=CD hits appear (the choice that the trade pushed away returns).
- 6 hits: the `displaced` field of an AB=CD hit changed (the displaced candidate lost its trade or the field appeared).
- 1 hit (`sig-nosignal-h4-01@0.8`): an AB=CD sell with a trade, invalid by ABCD-26 (a D rule, not a shape rule), is replaced by the valid buy triple A/B/C 1763006400/1763064000/1763092800. Its own shape checks hold. It is a ripple of the shown-trade memory (1122-A1.4), not a rule change; reported to the coordinator.
Hashes were updated after this comparison (`GOLDEN_UPDATE=1`, limits `__keyBuildsMax`, `__evaluatedMax` kept).
