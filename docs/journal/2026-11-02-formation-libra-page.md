---
date: 2026-11-02
author: Claude
type: feature
status: open
pr: []
features: [FRM-09, FRM-18, FRM-19]
areas: [frontend, tests]
---

# Libra on the formation page

## Request
- The review of the open findings of the full formation check proposed four formations that the page does not scan. The user decided on 2026-11-02 (variant B of finding 38): put them on the page one at a time, each with its open findings. The Libra (LIB) is the first one.
- Fix finding 24 in the same change: `LIB-12` measured the touch of the first reached edge, but the entry can use the other edge.

## Cause
- **Finding 24:** `shapeOfLib` measures the touch at `first`, the edge that price reaches first from P3. `chooseEntry` (rule E-2 a) takes `first` only when the reward-to-risk ratio to TP1 is at least 1 there, else the other edge. When the entry moved to level 0.786, a touch of the zone edge alone made `LIB-12` met and the Libra valid, while the entry price was not reached.
- **Gaps found on the way:** LIB did not use `settle` (an unmeasurable required rule must keep `valid` at `forming`) and did not write `invalidBy` (the checklist names only these rules for an invalid hit). Both came for the other checkers in PR 288 and PR 289, when LIB was not on the page.

## Solution
| File | Change |
|---|---|
| `lib/formation/libChecks.ts` | `evaluate` computes target and entry first. When the entry is not `first`, it measures the touch again at the entry price. K, E, `LIB-14`, `LIB-15`, the ATR window of `LIB-08` and the arrow `Z-LIB-06` use this touch. Verdict with `invalidBy` and `settle`. New options `harmonics` and `cyphers` take results that are already computed. |
| `lib/formation/lib.ts` | `measureTouch` takes any edge (name `edge`); comments say which edge `libChecks` uses. |
| `lib/formation/scan.ts` | `LIB` in `SCAN_FORMATIONS`, final point `K`. Each formation is computed at most once per scan, on first use; the Libra takes the results of Gartley, Bat and Cypher from the same scan. |
| `lib/formation/types.ts`, `drawingLayout.ts` | New optional field `Drawing.label` (`stop` or `target`) for a label with one anchor. Without it, such a label still says "Level 1". The Libra labels Z-LIB-04 (target) and Z-LIB-05 (P2, stop) said "Level 1" on the page before. |
| `lib/formation/ruleTexts.ts`, `i18n/messages/formation.ts` | Short texts for the 15 LIB rules and the name "Libra" (tr, en, de). |
| `e2e/mocked/formation-lib-lib.spec.ts`, `formation-page-lib.spec.ts`, `formation-page.spec.ts` | Tests for the entry edge, the scan, `settle`, `invalidBy`, the texts and the page. |
| `docs/features/features.yaml` | FRM-09, FRM-18 and the alarm entry name the Libra. |

## Why
- The touch follows the entry and not the first edge. The rule book says: when the ratio at the zone is too low, place the order at 0.786. Before that level is touched, there is no entry, so the Libra is still forming.
- The scan gives the results of the other formations to the Libra and does not compute them again. Measured with page-sized random candles (D1 400, H4 720, H1 960, M15 960): the full scan took 1.05 s with LIB and 0.67 s after the change. The scan computes each formation on first use, so the order in `SCAN_FORMATIONS` does not matter.
- When no edge reaches a ratio of 1, `chooseEntry` returns the far edge for display ("no trade"). The touch then follows the far edge too, so K, E and `LIB-12` stay on one price. The rule book says "no trade" for this case; the checklist shows it in `LIB-11`.
- Three real series changed their expectation (owner decision, 2026-11-02). In all three, the ratio at the zone edge was below 1 (0.42, 0.75, 0.25), so the entry is level 0.786 (ratio 2.36, 2.99, 3.04). Price touched the zone edge but not 0.786 at the check time:
  - `lib-sell-h4-01`: `valid` → `forming`, `LIB-12` unmet. In later candles, price reaches 0.786 and then closes above P2 (stop).
  - `lib-buy-h4-01` (t=1761048000): `valid` → `forming`, `LIB-12` unmet. Price never reaches 0.786; the target is reached without an entry.
  - `lib-docht-h4-01`: stays `invalid` by `LIB-02`; `LIB-12` met → unmet. Two candidates now have the same number of failed form rules, so the more recent P1 wins. The test checks P2, P3 and the verdict, which do not change.
- No design draft: the Libra uses the existing toolbar button, checklist and drawings of the other formations. The screenshots below show it.
- Saved alarm settings keep their list of formations. The Libra alarm is on for new settings and off for old ones until the user switches it on.

## Verification
- Red before the fix: the entry-edge test (`LIB-12` was met, expected unmet), the `settle` test (`valid`, expected `forming`), the `invalidBy` test (undefined), the label test (`formation.draw.levelOne`, expected `formation.draw.target`).
- Review by the `reviewer` agent: no critical finding. Fixed: label texts, the order dependency in the scan, the alarm test helper with a fixed list of seven formations. The other points are under "Open points".
- Codex scan: not run. The weekly Codex quota had 3 % left (rule: skip at 5 % or less). The scan test and the text test were red with LIB removed from `SCAN_FORMATIONS` and one text removed.
- `E2E_PORT=3117 scripts/features/run.sh FRM`: 17 worker tests and 1280 e2e tests passed, 0 failed. Formation lib tests with a local config: 1181 passed, 0 failed.
- `npx tsc --noEmit` and `npm run lint`: exit 0. `update_checklist.py --check`: ok.
- Screenshots with the real fixture `lib-gone-h4-01` against the mock worker, light and dark, 1440 px and 375 px: Libra button with badge 1, checklist "required 5/5", labels "Target" and "Stop", no horizontal overflow. Dark mode comes from the app theme store (`grid-robot-theme`), not from `prefers-color-scheme`.

## Open points
- [ ] The legend on the page says "Zigzag P1–P2–C–P3–K–E" for the Libra, but the Libra draws no zigzag (the rule book does not label its points). The legend text is the same for all formations.
- [ ] The marker Z-LIB-07 has its anchor at the candle that reaches the target, but `drawingLayout.ts` draws every marker at the final point (K). The page shows the box at the touch.
- [ ] K is set when the touch comes before P3 is a finished fractal (touch within 2 candles after P3). Then the checklist shows no "forming" note and the alarm event "target" can come before P3 is finished.
- [ ] `cypChecks.ts` calls `analyzeLib` without results of Gartley and Bat (CYP-10); there the Libra still computes them itself.
- [ ] No test proves that the scan gives the Gartley/Bat and Cypher results to `LIB-10` and `LIB-09`: no real series has a measurable `LIB-09` or a met `LIB-10` (checked over all H4 fixtures).
- [ ] OBO, TDF and 2618 follow one at a time.

## Lessons
- A rule that measures an event must measure it at the price that the trade uses. A second edge with its own choice needs its own touch.
- A checker that is not on the page misses changes to the common verdict rules (`settle`, `invalidBy`). Check these when a checker goes on the page.
