---
date: 2026-11-24
author: Claude
type: fix
status: closed
pr: []
features: [FRM-08, FRM-07, FRM-39]
areas: [frontend, tests]
---

# Harmonic part of the formation search is 4.5 times faster, results unchanged (1124-B1)

## Request
PR 647 and 648 made the page search about 10 times slower (2026-11-23-formation-scan-slowdown). The task: the same results at the level of 2026-11-20. Halil approved the plan on 2026-11-24 ("Ayrı adım, plan onay"): this step covers only the harmonics and the shared code (`xabcd.ts`, `sig.ts`, `trd.ts`, `reasons.ts`). The AB=CD part (`abcdChecks.ts`) is a separate step, because other sessions work in that file. The plan had an optional part E (a light pre-pass in the main search); it is **not** done, see "Open".

## Cause (profile of the page search, USOUSD, Node)
- `endedStore` skipped only bases of earlier closes that were no longer the newest. 21 693 of 23 928 measurements were "current" bases, so ended trades were measured again in each of the 136 searches of earlier closes.
- The main search did not write to the store, and a base without entry was measured again in each search.
- `historicBases` sorted all living pivots at each time step (1.5 million steps in one page search).
- `divergenceOf` and the trend (`buildTrend`, `changeRef`, `noteImpulse`) were calculated again for the same input; 1155 trend builds for 833 different ones.

## Change (behaviour unchanged)
- `xabcd.ts`: the store of ended trades also takes current bases and the main search (a base is stored only if its predecessor and sides equal the ones of the key). New store `notEnteredStore`: a base without entry at a close stays without entry at every earlier close (the entry depends only on the form), with the same shifted C (`noCutMax`, `cut`, `cutMax`).
- `xabcd.ts`: `historicBases` keeps its result per trend model, and the sweep (`historicBasesSweep`) looks only at the bases around pivots that changed since the next newer time. `historicBasesRef` is the old step-by-step loop and stays as the reference for the test.
- `sig.ts`: `divergenceOf` keeps its result per trend model and arguments.
- `trd.ts`: `changeRef` and `noteImpulse` search backwards instead of copying the pivot list.
- `reasons.ts`: the trend is built once per context, time frame and candle count (`trendOf`). A global cache did not work: it mixed fixtures (55 golden hashes differed). The key must include the context.

## Evidence
- Golden record (`formation-scan-golden-lib.spec.ts`): 262 tests in the FRM-08 run passed, file unchanged except the limits. 414 of 414 hashes equal in the Node check.
- New `formation-bases-sweep-lib.spec.ts` (@FRM-08): the sweep equals the reference on all fixtures at three lengths and five window starts.
- Speed guard (work, not time): page runs may do at most 6 000 candidate measurements (`__evaluatedMax`). Old code (01e6f3f4): 23 928, 18 028 and 20 411, so red. New code: 5 420, 4 883 and 4 904, so green. `__keyBuildsMax` is 75 000 now (the sweep counts every key it builds; the old loop would be 2.7 million).
- Browser, UI-17 set-up (1440 px, `fakeNow` 2026-11-12T16:21Z, GAR, one worker), `data-scan-ms`, old and new build in turns, 3 runs each, load average 9.6 to 11.6 (not low):

| Build | scan ms (9 runs) |
|---|---|
| old (main 01e6f3f4) | 1893, 1943, 2022, 2120, 2027, 2127, 2110, 2155, 2013 (median 2027) |
| new | 645, 652, 644, 657, 661, 768, 595, 621, 604 (median 645) |

- Split by analyzer (Node CPU profile, same page search, load below 9): harmonics 1151 ms to 255 ms; AB=CD 409 ms to 213 ms (shared trend and divergence caches help it); the rest about 60 ms. Total 1897 ms to 600 ms. The split is from Node, not from the browser.

## Open
- Total is not at 200 ms: AB=CD still costs about 210 ms (Rule B search, PR 650: 59 ms before). Next step: `abcdChecks.ts` (entry environments and measurements of ended triples), with the AB=CD coordinator.
- The harmonic part is 255 ms in Node, the plan said about 230 ms. Part E (a light pre-pass that only calculates the trade identity) is not done; it needs a split of every harmonic checker and would touch five files.
- Browser total 645 ms under load 10; at low load it will be lower, not measured.

## Rule for the next change
A change in `xabcd.ts`, `shownTrade.ts`, `trd.ts` or `reasons.ts` runs `formation-scan-golden-lib.spec.ts` and `formation-bases-sweep-lib.spec.ts`. Never make the trend cache global: key it by the context.
