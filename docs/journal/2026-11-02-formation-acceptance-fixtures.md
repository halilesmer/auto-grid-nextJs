---
date: 2026-11-02
author: Claude
type: decision
status: open
pr: []
features: [FRM-02, FRM-03, FRM-05]
areas: [frontend]
---

# Formation detection: missing acceptance fixtures

## Request
Add the acceptance cases of the local test list that had no fixture and no test. Add fixtures and tests only. Do not change check logic.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/formation/frz-resist-h4-01.json` | 114 real H4 candles, 2025-09-08 to 2025-10-02 |
| `frontend_nextjs/e2e/fixtures/formation/frz-support-h4-01.json`, `frz-support-d1-01.json` | 126 H4 and 153 D1 candles, acceptance open |
| `frontend_nextjs/e2e/fixtures/formation/frz-resist-h4-02.json` | 210 H4 candles, acceptance open |
| `frontend_nextjs/e2e/fixtures/formation/abcd-neg-h4-01.json` | 306 H4 candles, acceptance open |
| `frontend_nextjs/e2e/fixtures/formation/abcd-buy-h4-02.json` | 222 H4 candles, acceptance open |
| `frontend_nextjs/e2e/mocked/formation-frz-lib.spec.ts` | Two tests for `frz-resist-h4-01`, tag `@FRM-02` |

## Why
- The broker now gives H4 candles from before 2025-09-23. The earlier entries (`2026-10-27-formation-frz.md`, `-trd.md`, `-abcd.md`) said that these windows were not available. All seven queries returned complete windows. The only gaps are weekends.
- For all six cases, each listed price is within 0.5 × ATR(14) of the matching candle (measured once). The committed test checks this for the three fractal candles of `frz-resist-h4-01`.
- `frz-resist-h4-01`: the three resistance fractals of the list are in valid zones on 2025-10-02 (FRZ-01 to FRZ-04, FRZ-07 and FRZ-11 met, FRZ-06 unmet). `analyzeFrz` selects two resistance zones, not three. FRZ-22 merges list zones 1 and 2 through the fractal of 2025-09-18 12:00: the direct gap between zones 1 and 2 is larger than the smaller zone height, but the fractal between them connects them. Zone 3 stays a separate zone. The check of the fractal of zone 2 therefore uses the merged zone, with the fractal of zone 1 as its outer fractal.
- The second test pins the measured selection. It is not a requirement of the test list. FRZ-22 is an assumption (`FRZ_PARAMS.mergeGap`).
- Five cases do not agree with the test list. The tests for these cases are not in this PR. The project owner decides whether the list or the code is wrong. The fixtures are in this PR, so that the decision does not need a new query.

## Verification
- `scripts/features/run.sh FRM`: 1322 passed, exit 0.
- Mutations: `mergeGap: -1` turns both new tests red. Changing the FRZ-07 condition turns the candidate test red.
- Codex scan: not done. The weekly Codex limit had 3 % left (rule: skip at 5 % or less).
- `npm run lint` and `npx tsc --noEmit`: no output.

## Open points
- [ ] Acceptance open, waits for a decision: `trd-line-h4-01` (same candles as `frz-resist-h4-01`): no line is drawn (TRD-34 unmet), so TRD-36, TRD-40 and TRD-41 are unmeasurable.
- [ ] Acceptance open, waits for a decision: `frz-support-h4-01`: FRZ-21 unmet. The distance to the D1 zone is 508 and 1 × ATR(14) of D1 is 270 (`FRZ_PARAMS.nearAtr`, an assumption).
- [ ] Acceptance open, waits for a decision: `frz-resist-h4-02`: two H4 closes above the zone on 2025-10-06 (12:00 and 16:00), so FRZ-06 is met and the zone is invalid.
- [ ] Acceptance open, waits for a decision: `abcd-neg-h4-01`: ABCD-17 unmet (RSI(7) 70.5 at D) and ABCD-19 met. The verdict (invalid because of ABCD-06) agrees.
- [ ] Acceptance open, waits for a decision: `abcd-buy-h4-02`: correction depth 0.851 with the real B, so ABCD-06 is unmet and the verdict is invalid.
- The fixture-to-source mapping and the measurements stay in the local test list. They are not in the repo.

## Lessons
- Before you write "the broker has no candles" into a plan, query the window again. The history depth of the broker changes.
