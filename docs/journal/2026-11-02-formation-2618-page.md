---
date: 2026-11-02
author: Claude
type: feature
status: open
pr: []
features: [FRM-08, FRM-18, FRM-19]
areas: [frontend, tests]
---

# 2618 on the formation page

## Request
- Fourth and last step of variant B of finding 38 (decision of 2026-11-02): the page now scans 2618, after Libra, head and shoulders and trend continuation.
- `analyze2618` existed but the page did not scan it. It also lacked `settle` and `invalidBy`, and its rules had no short texts (2618 part of finding 39).
- Finding 32: `2618-04`, `2618-07`, `2618-09` and `2618-10` had the status `assumption`, but the rule book marks all four as confirmed.

## Solution
| File | Change |
|---|---|
| `lib/formation/scan.ts` | `2618` in `SCAN_FORMATIONS` and `ANALYZERS`. Final point `K` (touch of 0.618 = entry). Penultimate point `I` with the `unfinished` rule `2618-03` ☐. |
| `lib/formation/f2618Checks.ts` | Verdict with `invalidBy` and `settle`. Status `confirmed` for `2618-04`, `-07`, `-09`, `-10`. |
| `lib/formation/ruleTexts.ts`, `i18n/messages/formation.ts` | Short texts for the 10 rules and the name (tr, en, de). |
| `e2e/mocked/formation-2618-scan-lib.spec.ts`, `formation-page-lib.spec.ts`, `formation-page.spec.ts` | Tests for the scan equals `analyze2618`, the badge, the status, `settle`, `invalidBy`, the texts and the page. |
| `docs/features/features.yaml` | FRM-08 and FRM-18 name the changes. |

## Why
- **Penultimate point `I` with `unfinished`:** `impulseEnds` also returns the latest extreme when its fractal is not finished yet. Then `2618-03` is ☐. This is the same case as `LIB-04` and `OBO-02`, so the badge counts a forming 2618 only when `I` exists and `2618-03` is not ☐. The real series `f2618-open-h4-01` shows both states: at 1760544000 `I` is open (no count), at 1760558400 the formation is valid (count 1).
- **Final point `K`:** `evaluate` sets `K` only with the touch of 0.618, and the rule book uses the touch as the entry. A valid 2618 always has `K`.
- **`invalidBy`:** the same rules as the old verdict: `2618-01` ☐ (no double top), `2618-06` ☐ at the touch (trend against the trade), and the exclusions `2618-09` and `2618-10` when present. The verdicts did not change.
- **`settle`:** `2618-01` is "not measurable" when a double-top rule cannot be measured (for example a short history). Before, the verdict was then "valid"; now it is "forming". `2618-06` is the second required rule that can be "not measurable". No exception in `exemptFor`.
- **Drawings:** `Z-2618-03b` (target 2) and `Z-2618-05` (scenario arrow) keep `rules: []`. The rule book names no condition for them, only the trade. `Z-2618-04` has two anchors and so already shows the labels "stop" and "target"; no 2618 drawing showed "Level 1".
- **Status and the old choices V-2 to V-5:** the status `confirmed` says that the rule book confirms the rule. The choices V-2 to V-5 in `2026-10-27-formation-2618.md` say how the library measures the rule. They stay valid and are not changed. The status is only shown in the checklist and does not change a verdict.
- **Alarm:** a new user gets the alarm for all eleven formations. A user with stored alarm settings keeps the stored list, so 2618 is off until the user selects it. This is the same as for TDF.
- **Double top computed twice:** yes. `analyze2618` calls `evaluateCdt` for every base pair, and `analyzeCdt` does the same for its own best pair. The scan cannot reuse the CDT result, because `analyzeCdt` keeps only one candidate per timeframe. The cost is small (see below), so no change.

## Measurement
- Badge hits over the 102 fixtures (one timeframe each, time = end of the series). Before (2618 computed alone with the planned rule): `f2618-*` (6 series) 1 hit (forming), other series (96) 9 hits (5 valid, 4 forming). After, through the page scan: the same numbers. The other ten formations did not change on any series.
- Scan time on the page size (four timeframes with 280 D1, 520 H4, 680 H1 and 700 M15 candles; three price series, tiled and re-timed; median of 11 runs): full scan 604 to 720 ms, `analyze2618` alone 61 to 82 ms, `analyzeCdt` alone 42 to 52 ms. The increase is below the limit of 200 ms per run.
- Real series (`f2618-*.json`, `cdt-*.json`): all cases stay green with the same points and verdicts.

## Verification
- Red before the change: the scan test (6 series), the point test, the badge tests (synthetic and real), the status test, the `settle` test and the `invalidBy` test (12 tests).
- Counter-check after the change: without the `settle` line and without `invalidBy`, the `settle` test and both `invalidBy` tests (real series and hand-made series in `formation-2618-lib.spec.ts`) are red.
- A hand-made series can have more than one trigger. `SHALLOW` also has `2618-06` (the trend does not turn after the shallow correction), and `ONE_CLOSE` also has `2618-10` (the fast return candle is wide). The test checks that the intended rule is in `invalidBy`.
- See the PR for the test runs, lint, tsc and screenshots.
- Codex scan: not run, the weekly quota had 3 % left (rule: skip at 5 % or less).

## Open points
- **Noise:** 9 of the 96 unrelated fixtures show a 2618 hit (5 valid). The rules are unchanged by this step.
- At the end of a real `f2618-*` series the pattern is mostly over (5 of 6 invalid); the page tests use the time of the pattern.
