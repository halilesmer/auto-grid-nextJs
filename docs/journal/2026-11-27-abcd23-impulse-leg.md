# ABCD-23: the D leg must be impulsive (1126-A20.2.1.1)

**Date:** 2026-11-27 · **Decision:** Halil, option C ("the leg like an impulse") · **Rule:** ABCD-23 (exclusion, assumption)

## Problem

The old measure counted strong candles (SIG-34) toward D in the D leg and excluded the trade at two or more (`wideBars: 2`).
That count grows with the leg length, not with the leg character.
D legs run from 3 to 365 candles; the share of strong candles has a median of about 0.18.
On long D legs the "at least 2 strong candles" test is true by itself.
The old rule excluded 37 of 45 trades.

## Decision (option C)

ABCD-23 is met when, in the D leg (`c.idx + 1 … d.idx`):

- the number `strong` of SIG-34 strong candles that close toward D is at least `wideBars` (2), AND
- `strong` is greater than the number of SIG-35 narrow candles in the same range (any direction).

Code: `ex = strong >= ABCD_PARAMS.wideBars && strong > nNarrow` in `abcdChecks.ts`.
"Not measurable" is unchanged (all `view.wide` flags are null).
`wideBars: 2` stays as lower bound; no new number.

## Reason

The rule book describes a "volume-backed rise" as the character of the leg.
The comparison is the impulse measure of SIG-37 (`impulseWide > impulseNarrow`, `sigChecks.ts`) applied to the D leg.
SIG-38 is not added to ABCD.

## Measurement

Earlier copy, before PR 695, H1 only, valid trades: XAUUSD 1 → 6, EURUSD 1 → 5.
Earlier copy, before PR 695, H1 + H4 + D1: 1 → 2 and 1 → 3.

Current main (PR 694, PR 695), H1 formations with H4 and D1 built from the same H1 candles, 2025-11-20 to 2026-11-26.
The app opens a trade on each triple with a valid shape, also when the verdict is invalid: XAUUSD 26, EURUSD 23.
Valid at the entry candle: old rule 1 and 0, new rule 2 and 2.
Three more triples on each symbol miss only the ABCD-20 reversal candle.
A walk on the PR head gives the same result as the measurement copy, row by row (0 differences in 6000 and 6326 closes).

## Tests

`@FRM-05` (`formation-abcd-lib.spec.ts`): WIDE2 stays met (2 strong, 0 narrow), WIDE1 stays unmet.
New cases, counted by hand: 2 strong + 2 narrow → unmet; 2 strong + 1 narrow → met; mirror (buy) of the tie case → unmet.
The scan golden (`formation-scan-golden.json`) changed: 77 hashes.
Only ABCD-23 changed (met → unmet in 100 candidates, 53 fixtures).
50 verdicts changed from invalid to forming, because ABCD-23 was their only cause.
Example: `abcd-breakc-h4-01@0.8`.
