---
date: 2026-11-06
author: Claude
type: fix
status: open
pr: []
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
| R1-11 | The FRM-42 test measured "a draft does not start a search" only with the network calls of the runner. The page search uses cached data and makes no call, so a change from `trend` to `trendDraft` there passed |

## Solution (PR A)

| File | Change |
|---|---|
| `components/formation/FormationScanRunner.tsx` | `AlarmRun` carries the `trendKey` of the pass. `flushAlarm` returns at once when the stored trend differs from it: no memory, no history, no notice. `symbols` adds bell products only while the alarm is on |
| `hooks/useFormationScan.ts`, `FormationView.tsx` | New `scanRuns` counter (`data-scan-runs` on the page) for tests |
| `e2e/mocked/formation-page.spec.ts` | R1-02 test (FRM-30), R1-06 test (FRM-43), FRM-42 test also checks `data-scan-runs` |

## Why

| Alternative | Reason |
|---|---|
| Delete the alarm memory after the lock is taken, inside the pass | A second place that writes the memory. The guard in `flushAlarm` needs no new order of events |
| Still announce the notices of the stopped pass | They belong to the old path. The user already replaced it. The new pass starts with a silent baseline |

## Verification

- Red before the fix (own build, own `E2E_PORT`): R1-02 test received `["<account>|EURUSD"]` written after the apply click; R1-06 test saw rate calls for the second symbol. FRM-42 stayed green (the product code was correct there).
- R1-11 is a test-strength item. A first mutation (`useFormationScan` reads `trendDraft`) made the test fail, but earlier than the new counter: the draft was deleted by R1-04 (rehydrate on remount). So the counter assertion itself is proved after R1-04 is fixed (PR B).

## Open points

- [x] PR A: R1-02, R1-06, R1-11 (FRM-42/43 part)
- [ ] PR B: R1-03, R1-04, R1-05, R1-10
- [ ] FRM-44 and FRM-46 test gaps of R1-11 are in a separate fix

## Lessons

When a pass can be stopped, every write after its `await` points must check that the pass is still current. A stop signal alone is not enough, because `finally` blocks run later.
