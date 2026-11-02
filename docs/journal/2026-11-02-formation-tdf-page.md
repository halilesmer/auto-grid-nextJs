---
date: 2026-11-02
author: Claude
type: feature
status: open
pr: []
features: [FRM-11, FRM-18, FRM-19]
areas: [frontend, tests]
---

# Trend continuation on the formation page

## Request
- Third step of variant B of finding 38 (decision of 2026-11-02): put the four formations that the page does not scan on the page one at a time. Trend continuation (TDF) follows the Libra and head and shoulders.
- `analyzeTdf` existed but the page did not scan it. It also lacked `settle` and `invalidBy`, its rules had no short texts, and two rules (`TDF-19`, `TDF-26`) were always unmeasurable (findings 26 and 5).

## Solution
| File | Change |
|---|---|
| `lib/formation/scan.ts` | `TDF` in `SCAN_FORMATIONS` and `ANALYZERS`, final point `B`. `PENULTIMATE_POINT` now holds a list `points` per formation, and a hit counts when one of them exists. TDF: `C2` (flag), `H2` (triangle), `LOW` (bowl), `FLOOR` (box). |
| `lib/formation/tdfChecks.ts` | Verdict with `invalidBy` and `settle`. Rules of another sub-form are `inactive`. `TDF-19` and `TDF-26` are measured. Point `B` is set only when the verdict is not `forming`. `Z-TDF-09` has the label `target`. |
| `lib/formation/ruleTexts.ts`, `i18n/messages/formation.ts` | Short texts for the 28 TDF rules and the name (tr, en, de). |
| `e2e/mocked/formation-tdf-lib.spec.ts`, `formation-tdf-scan-lib.spec.ts`, `formation-page-lib.spec.ts`, `formation-page.spec.ts` | Tests for `TDF-19`, `TDF-26`, inactive rows, `settle`, `invalidBy`, the label, scan equals `analyzeTdf`, the badge per sub-form, the texts and the page. |
| `docs/features/features.yaml` | FRM-11 and FRM-18 name the changes. |

## Why
- **Penultimate point per sub-form:** the shared count keeps no sub-form branch. The list holds one point name per sub-form. A candidate carries only the points of its own sub-form, so one match is enough. All four points come from finished fractals (`peaksOf`, `innerExtreme`). A candidate without a finished fractal has no such point, so no `unfinished` rule is needed. The optional points `L2` and `HANDLE` do not count.
- **Inactive rows:** a rule of another sub-form was "not measurable" with the kind `required`. With `settle` it would block every candidate. The field `inactive` already exists, and `exemptFor` already lets such rows pass. The checklist does not count them (required 6/6 on the real triangle) and shows the mark "not valid". So the user sees the sub-form from the checklist; no new element was needed.
- **`TDF-19`:** "buy only after a close above the top edge of the zone of H1". For the triangle this is the same measurement as `TDF-04` (edge of the pause = top edge of the zone). `TDF-19` takes the state of `TDF-04`.
- **`TDF-26` (assumption):** "no entry inside the box" is a rule for the entry, not a property of the candles. The entry point `B` lies outside the box by definition. After the close outside the box the rule is "not present" (☐), before it is "not measurable". It is an exclusion, so `settle` does not wait for it. It can never be "present".
- **`Z-TDF-03`, `Z-TDF-07`, `Z-TDF-10`:** `rules: []` is correct. The rule book names no condition for them, only the trade (target, extension, height).
- **Point `B`:** same reason as for OBO. The alarm fires on the final point, so `B` must not exist while the verdict is `forming`.

## Measurement
- Badge hits over the 102 fixtures (one timeframe each, time = end of the series). Before, without TDF: CRB 51, CDT 47, ABCD 46, LIB 44, OBO 16, BAT 11, BUT 6, GAR 3. After: the same numbers, and TDF 21 (14 valid, 7 forming with the penultimate point).
- Scan time over the same 102 series: full scan 1352 ms before; 1832 ms and 1893 ms after (two runs). `analyzeTdf` alone: 507 to 531 ms, so TDF adds about 35 to 40 %. The limit in the brief was 30 %; reported before building, accepted.
- Absolute time per scan on the page size (four timeframes with 280 D1, 520 H4, 680 H1 and 700 M15 candles; three price series, re-timed; median of 11 runs): full scan 303 to 341 ms; `analyzeTdf` alone 69 to 75 ms, so the scan without TDF takes about 234 to 267 ms. The increase is below 200 ms per run (limit of the coordinator), so no optimisation.
- Real series (`tdf-*.json`) did not change: all nine cases of `formation-tdf-lib.spec.ts` stay green with the same points and verdicts.

## Verification
- Red before the change: `TDF-19`, `TDF-26`, the inactive test, the `settle` test (red again when the `settle` line is removed), the `invalidBy` test, the label test, the scan test and the text test.
- `E2E_PORT=3117 scripts/features/run.sh FRM`: 1306 passed, 0 failed. `npx tsc --noEmit` and `npm run lint`: no output.
- Screenshots with the real fixture `tdf-tri-h4-01` against the mock worker, 1440 px and 375 px, light and dark: no horizontal overflow, badge 1, required 6/6, zigzag `S-H1-L1-H2-L2-B`.
- Codex scan: not run, the weekly quota had 3 % left (rule: skip at 5 % or less).

## Open points
- **Noise:** 14 of the 102 unrelated fixtures show a valid TDF, mostly a bowl. The bowl has few rules (a turn between 0.236 and 0.382, quiet candles, a close above the zone), so it matches many charts. The rules are unchanged by this step.
- **Best candidate per timeframe:** the page shows one TDF candidate per timeframe, the one with the fewest violated rules. On `tdf-tri-h4-01` the check at the end of the series prefers a bowl; at the time of the page test it is the triangle.
- The checklist note says "B not yet reached" also when the break exists and only `settle` holds the verdict back (same as OBO).
