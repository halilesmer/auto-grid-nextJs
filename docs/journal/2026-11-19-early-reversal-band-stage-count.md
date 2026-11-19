---
date: 2026-11-19
author: Claude
type: diagnosis
status: done
pr: []
features: [FRM-39]
areas: [frontend, tests]
---

# Early reversal: why candidates fail the band stage

## Request
Plan 1114-A4. The live history scan of 2026-11-17 showed that the early reversal never formed in one year. At the third stage, 23 valid EURUSD candidates became 2 ("D in the band −0.272 … Level 1"). Split the elimination at that stage into reasons, on six products. The scan only reads. It changes no library result and no UI.

## Method
- Hook: `diag.ts` has a new event `earlyBand`. `earlyReversalOf` emits it when D exists, Level 1 is not reached and the call stops before stage 3. The event carries the reason, the correction depth (B → C as a part of AB) and the progress. The library result does not change.
- Spec: `e2e/live/formation-history.spec.ts` (tag FRM-39, project `live-demo`, `E2E_LIVE=1`). New switch `FORMATION_HISTORY_EARLY=1` (implies AB=CD only). The summary has a new block `earlyBand` per product.
- Window: H4, 1560 bars, step 1. One run per product under the heavy lock, one after the other. Output in the summary JSON files (not committed).
- Population: a call or candidate counts when it reached stage 2 (D exists, Level 1 not reached, candidate not invalid) and did not reach stage 3.

The live scans ran on the code before PR 628 (the Engulf search in a lower time frame did not exist yet). Stage 3 comes before that search, so the stage 3 counts do not depend on it. The hook sits in `earlyReversalOf` and the branch was rebased on the code with PR 628.

## Definitions
- **noBand (a, strict):** the band is empty (`−0.272` is not before Level 1).
- **notYet (b):** the band exists and D did not reach −0.272.
- **passed (c):** the band exists and D is beyond it, but the call stops. This cannot occur at stage 3 by construction: a D beyond −0.272 passes stage 3 and stops later. The count is zero by definition and is not measured.
- **other (d):** all other cases, for example AB length zero.
- **a, effective:** candidates with correction depth 0.678 or more. The band is not empty for them, but it lies inside the tolerance of 0.05 before Level 1. A D that reaches −0.272 there counts as "reached". So no D can pass stage 3 for them.
- **Per call:** each scan state counts. The last call of a state wins. **Per candidate:** the candidate counts once, with its last reason. A candidate counts only when it never reached stage 3.
- **Progress:** the part of the way from C to −0.272 that the D covered. The table shows the largest value of a candidate.
- The depth of a candidate does not change. The split by reason and effective (a) exist per candidate. They do not exist per call.

## Results (H4, one year)

| Product | s2 candidates | Stage 3 failed | a strict | a effective (depth ≥ 0.678) | b notYet (depth < 0.678) | c | d |
|---|---|---|---|---|---|---|---|
| XAUUSD | 47 | 45 | 0 | 12 | 33 | 0 | 0 |
| EURUSD | 23 | 22 | 0 | 0 | 22 | 0 | 0 |
| GBPUSD | 33 | 32 | 0 | 7 | 25 | 0 | 0 |
| USDJPY | 44 | 43 | 0 | 6 | 37 | 0 | 0 |
| AUDUSD | 19 | 18 | 0 | 1 | 17 | 0 | 0 |
| NZDCAD | 43 | 43 | 0 | 1 | 42 | 0 | 0 |
| **Total** | 209 | 203 | 0 | 27 | 176 | 0 | 0 |

Scan states that failed stage 3, all `notYet`: XAUUSD 341, EURUSD 187, GBPUSD 200, USDJPY 295, AUDUSD 140, NZDCAD 361 (total 1524). `noBand` and `other` are zero in all products. No candidate had both reasons in different states.

The gap between "s2 candidates" and "Stage 3 failed" (6 in total) is the candidates that also reached stage 3. Three more candidates reached stage 3 only in a state that stage 2 did not count (the candidate was invalid then).

Correction depth of the 203 failed candidates (all products):

| 0.382–0.5 | 0.5–0.618 | 0.618–0.678 | 0.678 or more |
|---|---|---|---|
| 64 | 71 | 41 | 27 |

All 203 failed candidates are `notYet` by the strict definition. Their largest progress to −0.272: below 0.5: 172; 0.5–0.8: 20; 0.8–0.95: 10; 0.95 or more: 1.

Per product depth and progress classes are in the summary JSON files (`earlyBand.candidateDepth`, `earlyBand.notYetMaxProgress`).

## No change of library results
EURUSD ran twice on the same year: with the hook, and with the hook, the spec switch and the counters removed (`git checkout` of the three files). Candidates 62 and 62, entered 8 and 8, early reversal 0 and 0, big target 1 and 1, last status and ever status equal, the funnel, the C leg block and the violations equal. `violations` is empty for all six products.

## Does the geometry explain the number?
The count agrees with the explanation. Correction depth is limited to 0.728 by the library, so the band is never empty (strict a = 0). The width of the part where a D can pass stage 3 is 0.678 minus the depth. It is zero for the 27 candidates with depth 0.678 or more. For the other 176, the band exists. D simply did not reach −0.272. For 172 of the 203 candidates, D covered less than half of the way from C. Stage 3 is the narrow part of the funnel because D must first move far from C. The geometry alone explains 27 of 203 failures (13 %). The rest is about price movement.
The measurement does not say whether the rule is too narrow or the application is. The judgment is the coordinator's.

## Weak points
- Five products ended at the bar of 2026-11-19 08:00. NZDCAD ended at 04:00 (it is from the first pass). The reference run for EURUSD ended at 12:00, one H4 bar later, so its window moved by one bar. All counters compared were equal.
- A first full pass of the six runs lost its output when Playwright cleaned `test-results`. Five products ran again with the output outside the project. NZDCAD is the output of the first pass. The code did not change between the passes.
- The depth class and the effective (a) split exist per candidate only.
- One year, six products, one scan rule. The numbers do not say anything about other windows.

## Open points
- [ ] The coordinator decides whether the rule or the application changes.
