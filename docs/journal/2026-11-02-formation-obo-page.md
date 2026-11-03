---
date: 2026-11-02
author: Claude
type: feature
status: open
pr: []
features: [FRM-10, FRM-18, FRM-19]
areas: [frontend, tests]
---

# Head and shoulders on the formation page

## Request
- Second step of variant B of finding 38 (decision of 2026-11-02): put the four formations that the page does not scan on the page one at a time. Head and shoulders (OBO, TOBO for the buy side) follows the Libra.
- The checker `analyzeObo` existed but the page did not scan it. It also lacked `settle` and `invalidBy`, and its rules had no short texts.

## Solution
| File | Change |
|---|---|
| `lib/formation/scan.ts` | `OBO` in `SCAN_FORMATIONS` and `ANALYZERS`, final point `B` (the neckline break). |
| `lib/formation/oboChecks.ts` | Verdict with `invalidBy` (exclusions, form rules `OBO-01` to `OBO-05`, and `OBO-12` when the break candle is small) and `settle`. Point `B` is set only when the verdict is not `forming`. `Z-OBO-05` has the label `target`, `Z-OBO-06` has the label `stop`. |
| `lib/formation/ruleTexts.ts`, `i18n/messages/formation.ts` | Short texts for the 14 OBO rules and the name (tr, en, de). |
| `e2e/mocked/formation-obo-lib.spec.ts`, `formation-page-lib.spec.ts`, `formation-page.spec.ts` | Tests for `settle`, `invalidBy`, point `B`, labels, scan equals `analyzeObo`, texts and the page. |
| `docs/features/features.yaml` | FRM-10 and FRM-18 name the formation. |

## Why
- **Final point `B`:** the verdict is `forming` until the right shoulder is a finished fractal and the neckline is broken by a body close (`OBO-11`). `B` is the break candle. The alarm fires on the final point, so `B` must not exist while the verdict is `forming`. Before the change, `B` was set as soon as a break existed, also with an unmeasurable required rule.
- **`settle`:** `OBO-12` (strong break candle) needs 20 candles before the break. With a break earlier than that, the rule is unmeasurable. The verdict was `valid` and is now `forming`. No exception is needed for OBO: `OBO-06` and `OBO-07` are bonus rules.
- **Labels:** `Z-OBO-05` is the target and `Z-OBO-06` is the stop level (a close beyond the right shoulder makes the formation invalid, `OBO-13`). The existing label kinds `target` and `stop` fit. No new kind.
- **No design draft:** the formation uses the existing toolbar button, checklist and drawings.
- Real series did not change their expectation. All real-series cases of `formation-obo-lib.spec.ts` stay green.
- Scan time (median of 15 runs, `obo-sell-h4-01`, 251 H4 candles): 23.2 ms for the full scan, of which `analyzeObo` is 1.6 ms. The full scan without OBO is therefore about 21.6 ms.
- Saved alarm settings keep their list of formations. The OBO alarm is on for new settings and off for old ones until the user switches it on.

## Verification
- Red before the change: the `settle` test, the point `B` test, the `invalidBy` test, the label test, the scan test and the text test.
- `E2E_PORT=3117 scripts/features/run.sh FRM`: 17 worker tests and 1287 e2e tests passed, 0 failed. Formation lib tests with a local config: 1187 passed.
- `npx tsc --noEmit` and `npm run lint`: no output.
- Review by the `reviewer` agent: no critical finding. Fixed: legend order of the zigzag points (now sorted by time), `HIGH_TF` reused, text details, catalog texts. Codex scan: not run, the weekly quota had 3 % left (rule: skip at 5 % or less).
- Screenshots with the real fixture `obo-sell-h4-01` against the mock worker, 1440 px and 375 px, light and dark: no horizontal overflow, badge 1, required 7/7, labels "Target" and "Stop".

## Open points
- [x] Because `B` is missing while the verdict is `forming`, the checklist note says "B not yet reached" also when the break exists and only `settle` holds the verdict back. The "not measurable" note is then not shown for OBO. Done 2026-11-03 (PR 323): the checker sets `pointHeld` when `settle` turns `valid` into `forming`. The note then says "B is reached. The confirmation is still pending." (`formation.note.held`) and the "not measurable" note follows (FRM-19 and FRM-10 tests, red before the change).
- The drawing layout names only points that are anchors of a zigzag. N1, N2 and `B` get no circle and no name.
- `basesOf` always gives a candidate for the latest head without a right shoulder. It has the verdict `forming` and counts as a hit in the badges.
