---
date: 2026-11-13
author: Claude
type: decision
status: done
pr: []
features: [UI-25]
areas: [frontend, tests]
---

# Formation row shows near-miss candidates (1113-A4)

## Request
A GBPUSD H4 Cypher matched 5 of 7 required conditions. The system marked it "invalid" and showed it only in the "Other candidates" menu, without a score. Halil asked that candidates close to valid appear in the formation row. The detection rules and thresholds (RSI, Fibonacci) stay the same. Only the display changes.

## Decision (approved 2026-11-13)
| State | Rule | Look |
|---|---|---|
| valid | `verdict === 'valid'` | green text, check icon; selected: green fill |
| forming | `countsAsHit` and not valid | amber text, clock icon; selected: amber fill |
| near | `invalid`, at most `NEAR_MISS_MAX_MISSING` (2) required conditions not met, no exclusion with `state === 'met'` | amber text, dashed amber border, dashed-circle icon, score `met/total`; selected: light amber fill |
| other | all the rest | menu "Other N candidates" |

- A required condition that cannot be measured counts as missing. An `inactive` condition does not count.
- The threshold is in `params.ts`. The classification is the pure function `hitState` in `scan.ts` (`formState` takes the best state of a formation on one timeframe, `reasonOf` gives the menu reason).
- Menu rows show name, `met/total` and the reason: the first triggered exclusion ID, or else the first missing required condition ID.
- The badge (`CountBadge`) counts only valid and forming candidates. Near candidates are not counted and make no alert.
- Selection is the state colour as a fill (before: orange `bg-primary`). The hide/show eye keeps working: a hidden selected button has an outline in the state colour.
- Colour is not the only signal: each state has an icon, and `aria-label` has the state and the score.

## Why not a percentage threshold
75 % excludes the Cypher (5/7 = 71 %), but includes Gartley (6/7) and Bat (7/8). Both have a triggered exclusion. A percentage rule would show them as "near". The count of missing conditions plus the exclusion check does not.

## Verification
`e2e/mocked/formation-hit-state-lib.spec.ts` (`@UI-25`) tests the classification. `chart-formation-more.spec.ts` (`@UI-25`) tests the row and the menu at 1440 px and 375 px.
