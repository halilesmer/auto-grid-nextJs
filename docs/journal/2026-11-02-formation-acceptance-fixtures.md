---
date: 2026-11-02
author: Claude
type: decision
status: open
pr: [303]
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
- [x] Done 2026-11-04 (package E). Cause found in `trd.ts`: `trendLines` took anchors only from `originPos`, so the high before the start of the trend (the top the trend leaves from) was missing and no released line existed. Fix: `lineAnchorPositions` starts at `originPos - 1`. Now TRD-34, TRD-35, TRD-40, TRD-41 are met (release at 2025-09-25 12:00; third touch 2025-10-01 08:00). Open difference: the list reads the anchor at the wick before the spike (TRD-36 ☑). Our spike candle has wick / body 1.62, FRZ-16 (assumption, ratio 2) does not see a spike, so the anchor stays at the spike wick (TRD-36 ☐, line violated, TRD-42 ☐). The test pins this. With the replaced anchor the line is the teacher's line. Measurement over 108 fixtures: 53 get an earlier line; only TRD-34 to TRD-43 states change, no verdict, no existing expectation.
- [ ] Open follow-up of `trd-line-h4-01`: TRD-36 ☑ of the list needs a spike candle; decide if FRZ-16 ratio 2 changes (affects zones everywhere). Original text:
- [ ] Acceptance open `trd-line-h4-01` (same candles as `frz-resist-h4-01`): no line is drawn (TRD-34 unmet), so TRD-36, TRD-40 and TRD-41 are unmeasurable.
  - Decision 2026-11-04 (Varsayım): the test list is right, the code is examined. Source: the case is the teacher's own drawing in the rule book (TRD-35, TRD-36: the line starts at the wick before the spike and runs through the two later highs; TRD-41: third touch). TRD-34 needs two moves in trend direction and the release by a close beyond the extreme; the teacher draws the line here, so the release must exist in his chart. Code change that follows: diagnose why `trd.ts` finds no valid line on `trd-line-h4-01` (release, spike anchor or pivot choice), fix the cause with a failing test first, then add the acceptance test. If the broker candles truly have no release, report it and keep the case open.
- [x] Done 2026-11-04 (package E): `FRZ_PARAMS.nearAtr` 1 → 2; FRZ-21 now met, the H4 support zone drops out. Measured over 109 fixtures and the H4/D1 pair: no other FRZ-21 state changes. Only the H4/D1 pair has a higher timeframe, so only it can change; the other fixtures have one timeframe. `nearAtr` also drives FRZ-28 (the D1 zone also shows in H1 when near), so that drawing list widens; no test pins the near case. Test added. Original text:
- [ ] Acceptance open `frz-support-h4-01`: FRZ-21 unmet. The distance to the D1 zone is 508 and 1 × ATR(14) of D1 is 270 (`FRZ_PARAMS.nearAtr`, an assumption).
  - Decision 2026-11-04 (Varsayım): the test list is right, the number is too small. Source: rule book FRZ-21 ("near" has no number) and its chart example, the same DAX H4 window: the teacher does not draw the H4 highs because the D1 zone is there. In our candles that zone is 508 points away, which is 1.9 × ATR(14) of D1. So 1 × ATR contradicts the teacher's own example. Code change that follows: `params.ts`, `FRZ_PARAMS.nearAtr` from 1 to 2 (the smallest whole number that covers the example), then measure all fixtures for changed FRZ-21 states before the merge, and add the acceptance test. The project owner can object to the number 2.
- [x] Done 2026-11-04 (package E): test added with the measured states (FRZ-06 met, FRZ-07 and FRZ-08 unmet, zone invalid) and the data-source note. Original text:
- [ ] Acceptance open `frz-resist-h4-02`: two H4 closes above the zone on 2025-10-06 (12:00 and 16:00), so FRZ-06 is met and the zone is invalid.
  - Decision 2026-11-04 (Varsayım): the code is right on our candles. Source: rule book FRZ-06 (a close beyond the wick end by "even one pip" violates the zone) and FRZ-08 (only a wick does not). The list prices are read from the teacher's chart of another data source ("ca."); our broker candles close above the zone twice. The rule wins over a price read from a picture. Code change that follows: tests only. Add the acceptance test with the measured states (FRZ-06 met, zone invalid) and write the data-source difference in the test note.
- [x] Done 2026-11-04 (package E): test pins verdict invalid, ABCD-06 unmet, ABCD-17 unmet (RSI 70.5), ABCD-19 met, with a note. Original text:
- [ ] Acceptance open `abcd-neg-h4-01`: ABCD-17 unmet (RSI(7) 70.5 at D) and ABCD-19 met. The verdict (invalid because of ABCD-06) agrees.
  - Decision 2026-11-04 (Varsayım): accept the case with the measured states. Source: the acceptance item of the list is the verdict "no trade, invalid because of ABCD-06" (rule book ABCD-06, C too deep), and it agrees. "RSI overbought, no divergence" is spoken only; the teacher's chart shows no RSI or Wave panel, so the values cannot be checked. ABCD-17 uses the teacher's own line 80 (SIG-01), and 70.5 is below it. Code change that follows: tests only. Pin the verdict and ABCD-06; pin ABCD-17 unmet and ABCD-19 met as measured, with a note that they differ from the spoken words.
- [x] Done 2026-11-04 (package E): the B candle is not a spike (lower wick 0.00043, body 0.00322, FRZ-16 false), so the point choice is correct; test pins verdict invalid and the data-source difference. Original text:
- [ ] Acceptance open `abcd-buy-h4-02`: correction depth 0.851 with the real B, so ABCD-06 is unmet and the verdict is invalid.
  - Decision 2026-11-04 (Varsayım): the rule wins, with one check first. Source: rule book ABCD-06 (D must reach −0.272 of the fib A → B; with an AB=CD D this needs a correction of at most 0.728). With the B read from the teacher's chart (about 0.8156) the depth is about 0.81 and D reaches −0.272; with our broker's B the depth is 0.851 and D does not reach it. The difference is the B wick, not the rule. Code change that follows: first check whether our B wick is a spike (FRZ-16, TRD-36: the teacher does not use a spike as a point). If it is a spike, the point choice is a defect: fix it with a failing test. If it is not, pin the verdict "invalid" and write the data-source difference in the test note.
- The fixture-to-source mapping and the measurements stay in the local test list. They are not in the repo.

## Lessons
- Before you write "the broker has no candles" into a plan, query the window again. The history depth of the broker changes.
