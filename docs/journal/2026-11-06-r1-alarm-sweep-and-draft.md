---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: [403]
features: [FRM-30, FRM-42, FRM-43]
areas: [frontend]
---

# R1 audit: alarm sweep and trend draft fixes

## Request
The Opus audit R1 of the formation chart (2026-11-05 merges) found defects in the alarm sweep and in the trend draft. The owner approved the fixes in advance. This entry covers R1-02, R1-06, R1-11 (PR A) and R1-03, R1-04, R1-05, R1-10 (PR B).

## Cause

| Finding | Cause |
|---|---|
| R1-02 | A sweep pass is stopped by `abort`, but its `finally` block still runs `flushAlarm` some time later. The new pass has already deleted the stored alarm memory. `flushAlarm` then wrote the memory of the old trend path back. The new pass compared against it and treated changed hits as new |
| R1-06 | `symbols` was favorites plus bell products, without a look at the main switch. With the switch off, a bell product that is no favorite was still loaded every 15 minutes |
| R1-04 | `useAnalysisPrefsStore.merge` set `trendDraft = trend` on every `rehydrate`. A rehydrate runs when another tab writes the key, and when a Free or Formation view mounts. An unconfirmed draft and its strip vanished without a user action |
| R1-05 | The same `merge` made a new `trend` object with the same values. The page search depends on that object and ran again with the same key |
| R1-03 | In Setup and Free the panel showed and changed the draft. The first slider move there ran `applyTrend` and applied all unconfirmed fields from Formation. Setup has no strip, so the user could not see or undo them |
| R1-10 | `ZoneChartPanel` (Setup) drew `trendDraft`; `FreeChartPanel` drew `trend`. The same setting gave two different lines |
| R1-11 | The FRM-42 test measured "a draft does not start a search" only with the network calls of the runner. The page search uses cached data and makes no call, so a change from `trend` to `trendDraft` there passed |

## Solution (PR A)

| File | Change |
|---|---|
| `components/formation/FormationScanRunner.tsx` | `AlarmRun` carries the `trendKey` of the pass. `flushAlarm` returns at once when the stored trend differs from it: no memory, no history, no notice. `symbols` adds bell products only while the alarm is on |
| `hooks/useFormationScan.ts`, `FormationView.tsx` | New `scanRuns` counter (`data-scan-runs` on the page) for tests |
| `e2e/mocked/formation-page.spec.ts` | R1-02 test (FRM-30), R1-06 test (FRM-43), FRM-42 test also checks `data-scan-runs` |

## Solution (PR B)

| File | Change |
|---|---|
| `store/useAnalysisPrefsStore.ts` | `merge` keeps a dirty draft and keeps the `trend` object when all fields are equal (`sameSettings`). New action `setAppliedTrend(patch)`: changes the applied setting at once. A dirty draft keeps its own changes and takes the same fields, so applying a field never reverts a pending one |
| `hooks/useTrendConfirm.ts` | One rule for "does the user confirm here": only in mode Formation |
| `chart-workspace/TrendSettingsPanel.tsx`, `TrendToggle.tsx` | Outside Formation the panel shows and changes the applied setting. The pending dot shows only in Formation |
| `chart/ZoneChartPanel.tsx` | Setup draws the applied `trend`, like Free. Only the Formation chart draws the draft |
| `e2e/mocked/formation-prefs-draft-lib.spec.ts`, `formation-page.spec.ts` | Store tests (R1-04, R1-05) and two page tests (R1-03, R1-10) |

## Why

| Alternative | Reason |
|---|---|
| Delete the alarm memory after the lock is taken, inside the pass | A second place that writes the memory. The guard in `flushAlarm` needs no new order of events |
| Still announce the notices of the stopped pass | They belong to the old path. The user already replaced it. The new pass starts with a silent baseline |
| R1-03: drop the draft when the user leaves Formation | The user loses a pending change without a word. This is the same defect as R1-04 |
| R1-03: show the strip in every mode | Setup and Free start no search. A strip there would add a step with no effect |
| R1-03: apply the slider move on top of the draft | The unconfirmed fields of Formation would apply silently. This is the defect |

## Verification

- Red before the fix (own build, own `E2E_PORT`): R1-02 test received `["<account>|EURUSD"]` written after the apply click; R1-06 test saw rate calls for the second symbol. FRM-42 stayed green (the product code was correct there).
- R1-11 is a test-strength item. A mutation (`useFormationScan` reads `trendDraft`) made the FRM-42 test fail, but at an earlier step than the new counter: the strip disappeared (before R1-04: the draft was deleted by a rehydrate; after R1-04: the page search restarts and closes the panel). The counter step itself (unchanged after a draft, higher after apply) passes with the correct code, but no mutation reached it.
- PR B red first: the store test failed for R1-04 (draft 2.5 after rehydrate instead of 3) and R1-05 (new object with the same values). R1-03 and R1-10 showed only after R1-04 was fixed, because before it the rehydrate removed the draft first: the Setup panel showed the draft value 3.5 instead of the applied 0.75, and the Setup chart drew 6 segments instead of 60.
- A dev server (`next dev`) is useful for fast test loops, but only with the default `.next` folder: another folder name is not git-ignored and Tailwind then scans its output and breaks the CSS.

## Open points

- [x] PR A: R1-02, R1-06, R1-11 (FRM-42/43 part)
- [x] PR B: R1-03, R1-04, R1-05, R1-10
- [ ] FRM-44 and FRM-46 test gaps of R1-11 are in a separate fix

## Lessons

When a pass can be stopped, every write after its `await` points must check that the pass is still current. A stop signal alone is not enough, because `finally` blocks run later.
