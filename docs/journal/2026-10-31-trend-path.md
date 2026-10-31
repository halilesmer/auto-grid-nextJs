---
date: 2026-10-31
author: Claude
type: decision
status: open
pr: []
features: [FRM-03, ANA-21]
areas: [frontend]
---

# Trend path follows the reference charts, formations can select it

## Request
`buildTrend` must draw the trend path of the teacher. The old path did not do this. The target is at least 80 % of 66 reference points from his charts. A point is a hit on the same candle, or one candle next to it. The project owner selected a pure minimum leg size of 2.5 × ATR(14) as default, and one close for the color change.

## Cause
The old path took each fractal as a candidate. It compared a correction with the smallest correction since the last trend change. This reference disappeared after each change, and the first correction was not checked. A small reference let almost all fractals through. A large reference removed real corrections.

The reference rule of the research reads the full series. That is look-ahead, and formations and backtests must not see the future.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/trd.ts` | `buildTrend` is the new path. Options for rule, size, ATR length, EWO lengths and closes. `changeRef`: reference point of a trend change |
| `frontend_nextjs/src/lib/formation/trdZug.ts` | Rules `groesse` (default), `welle`, `geruest`, `filter`. Each fractal decides at the candle that completes it |
| `frontend_nextjs/src/lib/formation/trdFormation.ts` | `formationTrend`: the path of the formations. `buildFineTrend` is the old path, unchanged |
| `frontend_nextjs/src/lib/formation/context.ts` | Option `zug`. Each view carries it, so all callers use the same path |
| `frontend_nextjs/src/lib/formation/indicators.ts` | `wilderAtr`: Wilder ATR from the first candle, no null values |
| `frontend_nextjs/src/lib/formation/params.ts` | `TRD_PARAMS.trend`, `formationZug`, `fine`; `changeCloses` is 1 |
| `frontend_nextjs/src/lib/formation/reasons.ts`, `cdt.ts`, `enc.ts`, `f2618.ts`, `obo.ts` | Use `formationTrend` and `formationCloses` |
| `frontend_nextjs/e2e/mocked/formation-trd-lib.spec.ts` | 66 reference points, colors, look-ahead, the four rules, the setting |
| `frontend_nextjs/e2e/fixtures/formation/trd-ref-*.json` | Real candles of the reference charts |

## Why
The causal rule is simple. A fractal on the same side replaces the last point if it is farther out. A fractal on the other side adds a point if the leg is at least the minimum size. Only the last point can still move. With this rule the result did not get worse: 58 of 66 points (88 %), against 57 of 66 for the rule that reads the full series.

Three details come from the measurement, not from taste:

- Wilder ATR gives 58 of 66. The existing ATR of the repository (simple mean) gives 55 of 66.
- The color changes at the opposite point where the running impulse started: 42 of 46 colors. The old rule took the last opposite point, which can be the running tip: 30 of 46. The rule book says "where the impulse started".
- An outside candle must try both sides. If the code keeps only the alternating side and the size check rejects it, the new extreme is lost: 52 of 66.

Formations take their points X, A, B, C, D from the path. The new path is coarse, so 96 formation tests went red, and real, checked formations disappeared. These tests cannot be proved one by one against the source, because the source does not say which points a formation may use. Three ways were measured:

| Way | Red formation tests | Valid hits on real series, every 6th candle |
|---|---|---|
| All formations on the new path | 96 | ABCD 24 to 1, BAT 5 to 0, ENC 8 to 0, CDT 40 to 102 |
| Old points, new direction | 37 | T618 75 to 17, 2618 31 to 5, FIB 676 to 546 |
| Formations stay on the old path | 0 | unchanged |

The project owner decided: both paths stay, and a setting selects the path of the formations. Drawing and TRD checks always use the new path. The default `fein` is an assumption of the coordinator session. The old algorithm stays as a separate function, because a flag through `buildTrend` would change the code of both paths in each branch.

The setting travels with the context and the view. A constant would not reach a user setting at run time.

## Button and settings in the chart (ANA-21)
The path is now visible. The `Trend` button in the chart header draws it, and a gear next to it opens the settings. The design was approved before code (artifact, 2026-10-31).

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/trdPath.ts` | `trendSegments`: one segment per leg, the tone is the trend at the leg end. `clipSegments`: cut at the first and last chart candle. `sanitizeTrendSettings`: stored values |
| `frontend_nextjs/src/lib/formation/params.ts` | `HISTORY_DAYS` moved here; `TrendSettings`, `DEFAULT_TREND_SETTINGS`, `TREND_LIMITS` |
| `frontend_nextjs/src/hooks/useTrendPath.ts` | Own candles with fixed history, closed candles only, no request while the button is off or the timeframe is not D1, H4, H1, M15 |
| `frontend_nextjs/src/components/analysis/chart/primitives.ts`, `ChartCore.tsx` | `TrendPathPrimitive`: 2 px line in candle colors, 1 px halo in panel color. Props `trendPath` and `toolbarActions` |
| `frontend_nextjs/src/components/chart-workspace/TrendToggle.tsx`, `TrendSettingsPanel.tsx`, `ChartWorkspace.tsx` | Button, gear and panel in the new header slot |
| `frontend_nextjs/src/store/useAnalysisPrefsStore.ts` | `showTrend` and `trend` (browser storage, not per account) |
| `frontend_nextjs/src/hooks/useFormationScan.ts`, `components/formation/FormationScanRunner.tsx` | Read `trend.formationZug`; the page search runs again when it changes |

Decisions of the project owner (2026-10-31): settings at the gear, not in the existing dialog; the sliders act on the line only; with the trend path the formations use the default values of the path; the change of `formationZug` shows what drops out; browser storage; halo on; line color equals the candle colors.

Details that are not in the plan:
- Every leg has a tone. A first leg has no earlier trend, so the path starts with the direction of the first leg and the plan's "muted before" did not occur.
- A change that comes after the end point of a leg, but before the next point, in the direction of the leg, gives the leg the new color. This is the rule of the design artifact.
- `ewoFast >= ewoSlow` is stored as typed (the user must be able to finish typing) and shows a warning. The calculation then uses 5/35.
- The numbers in the table of the note (24 → 1 for ABCD and so on) are the measurements in this entry. They are text in the panel and do not update by themselves.

## Lessons
- A measurement script and the code can differ. The first TypeScript version gave 52 of 66, under the limit, because of the outside candle. Compare both on the same cases before you trust a number.
- The new path does not always have fewer points than the old one. EURCAD D1 has 7 points on both paths, but not the same points.
- A value from a measurement script can differ at the start of a series. On an outside candle with no point before it, the code starts on the high and the script on the low. Only the first point differs.
- When a change makes almost all tests of a group red, look for the shared cause before you change one expectation.

## Assumptions
- ATR is not in the source material. The minimum leg size is a measured substitute for his eye.
- EWO 5/35 is not proved. It stays the default.
- The default `fein` is an assumption.

## Open points
- The rule `filter` can remove a drawn correction pair when the continuation comes (15 of 890 prefixes). This is not look-ahead, but a drawn point can go away.
- AUDNZD H4 hits 8 of 11 at 2.5 × ATR and 10 of 11 at 1.75 × ATR. The last leg is red, not green.
- GBPCAD D1 has more points than the chart in one reference case. The source suggests "similar wave lengths" as a rule. This is not measured.
- The rule book still describes the old path. The project owner decides the new wording for TRD-07, TRD-08, TRD-09, TRD-15, TRD-16, TRD-17, TRD-45, E-2 and E-3.
- The favorites search and the alarm (`FormationScanRunner`) read `formationZug` at each pass but do not start again when it changes. After a change, the next pass can report hits that differ from the stored state of the alarm.
- Not in this step: support line (Z-TRD-04), channel (Z-TRD-05) and the D1 path in H4 (Z-TRD-06).

## Verification
- `scripts/features/run.sh FRM`: 1091 passed, 0 failed, exit 0.
- `formationTrend` with the default against the code before this change: same points, candidates, direction, changes and counters on 102 fixtures.
- Default setting against the code before this change: each hit of all 16 formations is the same (points, side, verdict) on 97 fixtures and on 13 real series.
- Dead switch (`view.zug` ignored): 4 of 6 new setting tests failed.
- ANA-21: `scripts/features/run.sh ANA-21` → 23 passed; `FRM` → 1091 passed; `UI` → 116 passed; `npx tsc --noEmit` and `npm run lint` → no output.
- Two changes to the code each made a UI test red: button not disabled, request while the button is off.
- Review and the read-only Codex scan found these, all fixed: the classic preset gave both tones one color; arrow keys in the rule select were taken by the dropdown menu; a failed load of the trend candles showed nothing; the closed-candle filter had no test; with an unknown broker clock the filter compared broker time with UTC and could take the running candle; the clip at the chart edge interpolated by seconds, but the chart draws by candle, so a weekend moved the line.
- Visual check on the mocked worker with real fixture candles (EURCAD D1 and the H4 reference series), 1440 and 375 px, light and dark: the line, the button and the panel render. This is mock data. The check against the DEMO worker is still open.
