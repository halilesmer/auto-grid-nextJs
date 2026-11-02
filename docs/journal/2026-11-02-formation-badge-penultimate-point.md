---
date: 2026-11-02
author: Claude
type: decision
status: done
pr: []
features: [FRM-18]
areas: [frontend, tests]
---

# The badge counts "forming" hits from the penultimate point

## Request
- A measurement over 102 fixture series showed that hits "forming" fill the badges on /formasyon almost everywhere. Head-and-shoulders had a counted hit in 74 series (67 of them forming), and in 58 of the 67 forming cases the right shoulder was missing.
- The project owner decided on 2026-11-02: a hit "forming" counts only when the penultimate point of the formation exists. Valid hits count as before. Invalid hits do not count, as before.

## Solution
| File | Change |
|---|---|
| `lib/formation/scan.ts` | New table `PENULTIMATE_POINT` next to `FINAL_POINT`. `countsAsHit` is true for valid hits, and for forming hits that have this point. `hitsCount` (badges) and `timeframeForForm` (jump on click) use it. |
| `e2e/mocked/formation-page-lib.spec.ts`, `formation-page.spec.ts` | New FRM-18 tests. |
| `docs/features/features.yaml` | FRM-18 text and checks. |

| Formation | Penultimate point | Extra condition |
|---|---|---|
| ABCD, Gartley, Bat, Butterfly, Crab, Cypher | C | none |
| Double top | N | none |
| Libra | P3 | The check LIB-04 is not "unmet". The analyzer sets P3 as soon as a shape exists. It is a finished fractal only when LIB-04 is not unmet (`p3Done`). |
| Head-and-shoulders | RS | The check OBO-02 is not "unmeasurable". The analyzer sets RS as soon as a shape exists. OBO-02 is "unmeasurable" while the fractal is not finished (`rsPending`). |

The check files (`*Checks.ts`) are unchanged. The conditions use data that is already in `candidate.checks`.

## Why
- Alternative rejected: "the point exists" for every formation. For Libra and head-and-shoulders it would not change the count, because the analyzer sets the point before it is a finished fractal.
- For ABCD, Gartley, Bat, Butterfly, Crab, Cypher and double top the rule changes nothing on the fixtures. The analyzers set C and N only when they are found. This is intended.
- The candidate list and the empty state show all hits of the chosen formation and time frame, also invalid ones. This did not change. A hit that does not count in the badge can still show in the list when the user chooses that time frame. Alarm and favorites did not change: the alarm ignores invalid hits and acts on valid or reached final point, favorites use only valid hits.

## Verification
Count of series with at least one hit that counts (102 fixture series, check time = end of series, one count per series and formation):

| Formation | Before | After | Dropped |
|---|---|---|---|
| ABCD | 46 | 46 | 0 |
| Gartley | 3 | 3 | 0 |
| Bat | 11 | 11 | 0 |
| Butterfly | 6 | 6 | 0 |
| Crab | 51 | 51 | 0 |
| Cypher | 0 | 0 | 0 |
| Double top | 47 | 47 | 0 |
| Libra | 53 | 44 | 9 |
| Head-and-shoulders | 74 | 16 | 58 |

The new tests were red before the change (5 failed) and green after it.

## Open points
- [x] Do C (ABCD) and N (double top) exist before they are a finished fractal? No. New test `e2e/mocked/formation-penultimate-early.spec.ts` (FRM-18) scans every 4th bar (from bar 20) of the ABCD and double-top fixtures, for hits of any verdict. No hit has C while ABCD-02 is unmet, or N while CDT-03 is unmet (the test fails if it sees no hit with C or N). No change to `scan.ts`. The test was not red, because the answer is no. Other harmonics (Gartley, Bat, Butterfly, Crab, Cypher) are not checked by this test.
