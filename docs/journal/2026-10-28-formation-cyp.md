---
date: 2026-10-28
author: Claude
type: decision
status: open
pr: []
features: [FRM-12, FRM-09]
areas: [frontend]
---

# Formation detection: Cypher (step E12)

## Request
Add the harmonic pattern Cypher (CYP) to the formation library: one check per rule ID in both directions, the points X, A, B, C and D from candles, and the drawings Z-CYP-01 to Z-CYP-06. Also connect the Libra check LIB-09 (the Libra entry and the Cypher entry are the same place), which stayed "not measurable" until this step.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/cyp.ts` | Measures only the Cypher needs: extension of C beyond A, retrace on the fib X to C, level prices, entry price, projection of B to C, close of C beyond 1.414 |
| `frontend_nextjs/src/lib/formation/cypChecks.ts` | `analyzeCyp`, `checkCypCandidate`, checks per ID, verdict, drawings; uses the shared XABCD core (`xabcd.ts`) |
| `frontend_nextjs/src/lib/formation/params.ts` | `CYP_PARAMS`; every number refers to FIB, ABCD or the harmonic parameters |
| `frontend_nextjs/src/lib/formation/libChecks.ts` | LIB-09 measures the distance of the entries; the Libra candidate gets a new point `E` (the chosen entry); `analyzeLib(ctx, t, { withCypher })` and `checkLibCandidate(..., cyphers)` |
| `frontend_nextjs/e2e/mocked/formation-cyp-lib.spec.ts` | Hand-calculated cases, coverage test, mirror case, delimitation from Gartley, Bat and ABCD, no look into the future, CYP-10 and LIB-09, real candles, tag `@FRM-12` |
| `frontend_nextjs/e2e/mocked/formation-lib-lib.spec.ts` | One assertion changed (see "Open points") |
| `frontend_nextjs/e2e/fixtures/formation/cyp-*.json` | 7 files of real H4 candles |
| `docs/features/features.yaml` | New feature FRM-12; FRM-09 text for LIB-09 |

Gartley, Bat, ABCD and the other patterns keep their behaviour. Libra changes only in LIB-09 and the extra point `E`.

## Why
- The Cypher has the same point order as Gartley and Bat (X, A, B, C, D), so it uses the shared XABCD core. The difference is the shape: C goes beyond A, D is at 0.786 of the fib X to C.
- LIB-09 needs the Cypher entry, and CYP-10 needs the Libra entry. To avoid a call loop, the Cypher asks for the Libra with `withCypher: false` (no LIB-09 inside). The import cycle between `libChecks` and `cypChecks` is safe because both modules use the other one only inside functions.
- Mirror cases run through the same code; the tests compare the states of a series and its mirror.

## Choices without a rule source
- The wave divergence (CYP-05) and the RSI on C (CYP-06) are required, as the rule book decided. The divergence must be strict (SIG-13).
- CYP-02 compares with the next higher loaded time frame; without one it is not measurable.
- CYP-07 has no upper limit. A D far beyond 0.786 (even beyond X) stays met, because the rule book has no rule for it.
- CYP-09 uses the zone helper of GAR and BAT: fractal zones of every loaded time frame, engulfing zones of the pattern time frame.
- LIB-09 is "not measurable" if no valid or forming Cypher of the same direction exists on the time frame (there is nothing to compare). CYP-10 without a Libra is "unmet".
- "Near" for CYP-10 and LIB-09 is 0.5 × ATR(14), the number of ABCD-11. The Libra entry is the entry that `chooseEntry` picks; the Cypher entry is the 0.786 level of the fib X to C.
- CYP-12 uses the projection C + 1.272 × (B − C).
- `Z-CYP-06` (arrows of the three-step chain) is a marker with the anchors C, D and the entry level; it has no rule ID.

## Open points
- The real candles are scan results from the broker (13 symbols, H4, 2025-10-03 to 2026-03-31). In that period one Cypher is valid; the rest fail on the divergence, the RSI on C or the close beyond 1.414. The examples in the rule book have no usable date. There is no real case of a valid Cypher with a Libra entry at D, so LIB-09 "met" and "unmet" are covered by hand-made series with injected Cypher results.
- The check CYP-11 (close of C beyond 1.414) is an assumption of the project owner and removes many small structures.
- A D that runs far beyond 0.786 or beyond X keeps CYP-07 met and the verdict valid. A rule for this needs a decision by the project owner.
- `formation-lib-lib.spec.ts` had an assertion that LIB-09 is always "not measurable". It described the state before FRM-12 and is now "never met in those cases". No other FRM-09 test changed.
- No UI. `E` is a new point on the Libra candidate that the UI does not use yet.

## Verification
- See the pull request for the command output.
