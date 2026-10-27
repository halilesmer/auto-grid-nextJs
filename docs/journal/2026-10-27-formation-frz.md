---
date: 2026-10-27
author: Claude
type: decision
status: done
pr: []
features: [FRM-02]
areas: [frontend]
---

# Formation detection: fractal zone (step E2)

## Request
Add the fractal zone (FRZ) to the formation library: one check per measurable rule ID and the drawings Z-FRZ-01 to Z-FRZ-06.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/frz.ts` | Building blocks: fractal probe, zone width, violation scan, tests, search path, merge, strength |
| `frontend_nextjs/src/lib/formation/frzChecks.ts` | `analyzeFrz` (zones of all loaded timeframes), `checkFrzCandidate` (one candle), checks per ID, drawings |
| `frontend_nextjs/src/lib/formation/params.ts` | `FRZ_PARAMS`: all FRZ numbers in one place |
| `frontend_nextjs/src/lib/formation/types.ts` | `Drawing.timeframes` for the visibility drawing (FRZ-28) |
| `frontend_nextjs/scripts/formation-fixture.mjs` | Fix: `NEXT_PUBLIC_API_URL` already ends in `/api` |
| `frontend_nextjs/e2e/mocked/formation-frz-lib.spec.ts` | Hand-calculated cases, tag `@FRM-02` |
| `frontend_nextjs/e2e/fixtures/formation/frz-zone-h4-01.json` | 66 real H4 candles |

## Why
- A state means "the condition holds" for event rules (violation, wick without close, role change, tests). The verdict comes from FRZ-02, FRZ-03, FRZ-04, FRZ-07 and FRZ-10 only.
- FRZ-12 and FRZ-28 are display rules and have no check. FRZ-18 needs an economic calendar and is always `unmeasurable`.
- Zone choice follows the search path. A start line sits at the wick end of the last closed candle. Each next zone must lie further out. Overlapping zones, or zones with a gap not larger than the smaller height, become one zone drawn from the outer fractal.
- A test is a candle that comes within one zone height of the zone. A next test needs a counter fractal in between. The candles of the fractal itself are not tests.
- Mirror symmetry is tested: a resistance and its mirror image give the same states.

## Choices without a rule source
- FRZ-21 "near the price": distance from the last close to the zone edge not more than 1 × ATR(14) of the higher timeframe (`nearAtr`).
- FRZ-20 for M15: one zone per side, as for H1.
- FRZ-24 exception: Fibonacci targets come in through the option `fibTargets` (empty until the FIB step).
- FRZ-10 "close back": a close beyond the far edge of the zone, not only the wick end.
- FRZ-25 "current wave": the newest fractal of the side without a violation.
- FRZ-16 zone: from the body edge of the fractal candle to the outermost body edge of its two direct neighbours.
- Reversed zones (FRZ-35): the newest breaks per side, as many as the zone count of the timeframe.

## Open points
- The broker gives no H4 candles before 2025-09-23. The three H4 test cases of the plan (a EURUSD resistance, a DAX support, an AUDCAD resistance) cannot be built from broker data. A 66-candle series of the later window is used as an invariant check, not as a reference case.
- The FRZ-24 clause "already tested" has no test of its own: with it removed, all tests stay green. Reason: a nested, untested far zone needs a long hand-built series.
- Merged zones count all members as nest size for strength. A test that touches only a later member is not distinguished.

## Verification
- `npx playwright test` (FRZ file, no build): 96 passed.
- Mutations: nine changes to numbers and comparisons each turned at least one test red, except the FRZ-24 clause above.
- `npm run lint` and `npx tsc --noEmit`: no output.
