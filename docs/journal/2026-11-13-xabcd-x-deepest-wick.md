---
date: 2026-11-13
author: Claude
type: decision
status: done
pr: []
features: [FRM-12, FRM-03]
areas: [frontend]
---

# XABCD measures X at the deepest wick of the swing

## Request

A GBPUSD H4 Cypher did not show in the scan. See `2026-11-13-ewo-rule-pivot-one-bar-late.md` (branch `claude/pivot-shift-h4-d8d471`): the EWO trend rule puts the low pivot one candle late, 16.4 pips too high. That shifts the Fibonacci levels of the harmonic formation.

## Decision

Source: project owner, 2026-11-13.

- The trend rule (`waveRule` in `trdZug.ts`, EWO sign) does not change.
- Only the harmonic measurement changes. In `analyzeXabcd` (`xabcd.ts`, used by Gartley, Bat, Butterfly, Crab and Cypher) each base moves X to the most extreme wick in this range: after the trend pivot before X (or from the first loaded candle if none) up to, not including, candle A.
- X is a low: lowest low. X is a high: highest high. A candle that is only equal keeps the pivot. If no candle is more extreme, nothing changes.
- All other checks (`fractalDone`, `oneMove`, ...) run on the moved X without relaxation.
- `checkXabcd` (points given by the user) does not move X.
- A, B and C do not move. ABCD, Libra and the other formations do not use this core and are out of scope.

## Verification

- Test `e2e/mocked/formation-x-deepest-wick-lib.spec.ts` (FRM-12): the four GBPUSD candles give X = 1.31364 (candle 16:00). A built series with rule `welle` (green EWO at the deep wick, red at the pivot) gave a red test before the change (X on the pivot candle) and is green after it.
- All `formation-*-lib` specs (1811 tests) pass without a change of an expectation.
- Measurement over the 108 candle fixtures in `e2e/fixtures/formation/` (648 bases, each fixture with its own trend setting, scan at the end of the series). Same range rule applied to each point:

| Point | Bases with a more extreme wick | Share |
|---|---|---|
| X | 55 | 8.5 % |
| A | 61 | 9.4 % |
| B | 67 | 10.3 % |
| C | 84 | 13.0 % |

The range for C runs to the end of the series (no pivot after C), so the C number is an upper bound. 43 of the 108 fixtures have at least one base with a moved X; the specs that use them do not change.

## Open points

- [x] A and B: decided the same day, see `2026-11-13-xabcd-a-b-deepest-wick.md`.
- [ ] C shows the same effect (13.0 %, upper bound). The project owner has not decided on it.
