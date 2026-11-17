---
date: 2026-11-17
author: Claude
type: fix
status: open
pr: []
features: [FRM-42, SYS-11, BKT-05]
areas: [tests]
---

# Three flaky test groups: causes in the tests

## Request
Step 4, part C of the test infrastructure plan (coordinator "K- Test altyapısı"). Three test groups were flaky: BKT-05 `csv-import.spec.ts:175` and `:210` (CI), FRM-42 `formation-prefs-draft-lib.spec.ts:8` (many local pre-PR checks), SYS-11 `heavy-lock-lib.spec.ts:349` (one local pre-PR check). Find the cause by measurement. Do not make a test weaker (no longer timeout, no `force: true`, no retry).

## Cause

All local measurements: Mac, under the heavy lock (SYS-11), mocked e2e. The `-lib` specs need no app: they ran with `E2E_REUSE=1` against a placeholder server on the port. The BKT-05 runs used an own production build in `.next-e2e` and an own `next start`.

### FRM-42 `formation-prefs-draft-lib.spec.ts:8`

Symptom: in 3 kept pre-PR reports (`.feature-results/precheck-e2e.json` of 3 worktrees, 2026-11-16 and 2026-11-17) the first test failed with `TypeError: Cannot read properties of undefined (reading 'setItem')` in `freshStore` (line 30, `setState`), and passed on the retry. Line 8 is the helper `frm`, so all three tests of the file show as `:8`.

| Measurement | Result |
|---|---|
| The file alone, 1 worker | 3 of 3 passed |
| After `chart-rsi-review-lib.spec.ts` (sets its own `localStorage`), 1 worker | 11 of 11 passed |
| The 20 `-lib` specs of the failed worker of one report, in the same order, 1 worker | 1 failed (the same `TypeError`), 937 passed |
| Each of these specs in front of the file, 1 worker | `formation-alarm-history-lib.spec.ts` in front: the same failure. The 7 specs before it in the list: no failure. (The later rows of this loop are not valid: the file changed during the loop.) |
| Temporary static import of the store at the top of the file (the store loads before a storage exists), code before the fix, `--repeat-each=3` | 9 of 9 failed with the same `TypeError` |

Root cause (measured): `useAnalysisPrefsStore` takes its storage once, when the module loads (`createJSONStorage(() => localStorage)`). Node has no `localStorage`: Node 26 on the Mac gives `undefined` without `--localstorage-file`, Node 22 in CI throws a `ReferenceError`. When an earlier spec in the same Playwright worker loads the module first (`formation-alarm-history-lib` → `alarmStore` → `useUserPrefsStore` → `useAnalysisPrefsStore`), the store has no storage. On Node 26 its writes go to an `undefined` storage (`TypeError … 'setItem'`). On Node 22 `createJSONStorage` gives `undefined`, and zustand `persist` returns without `api.persist`, so `store.persist` is `undefined` (code of zustand 5.0.15, `middleware.js`; not seen in CI, where the group did not fail in 40 runs). The test file installs its storage later and gets the cached module. The retry runs in a new worker and passes. The test also used `localStorage ??=`, so it kept the storage of `chart-rsi-review-lib` when that spec ran first.

### SYS-11 `heavy-lock-lib.spec.ts:349`

Symptom: one kept pre-PR report: `expect(r.status).toBe(75)`, received 0 (the wrapper took the lock).

| Measurement | Result |
|---|---|
| The test selection by hand (first root process without children, pid > 1), 15 times in 2 s steps | always pid 360 (`logd`, running 6 days), alive after 2 s |
| `:349` `--repeat-each=40`, 3 workers, load average 7.9 (after 3529 s wait for the lock) | 40 of 40 passed |
| `:349` `--repeat-each=200`, 4 workers, in parallel with a BKT-05 run (6 workers), load average 32 → 41; stderr added to the failure message | 1 of 200 failed: `pid 124, stderr: [heavy-lock] veraltete Sperre gelöscht (pid 124 lebt nicht mehr …)` |

Root cause (measured): the test took the root process with the smallest pid. After 6 days the pids wrap around, and short-lived root processes get small pids. One of them ended between the selection and the check of the script. The script then correctly removed a stale lock. The check `kill -0 … status not 0` did not see this: a dead process also gives a status other than 0 (ESRCH). The script is correct; the test was wrong.

### BKT-05 `csv-import.spec.ts:175` and `:210`

Symptom: in the last 40 `tests.yml` runs (all branches, to 2026-11-17 03:42 UTC) the group failed on the first try 3 times, always in "Frontend e2e (2/4)": `:175` in runs 43969018431 and 43872855335 (`csv-series` count 0 after the first import, 7 s), `:210` in run 43855095207 (timeout, `csv-series-toggle` not found). FRM-42 and SYS-11 did not fail in these 40 runs.

| Measurement | Result |
|---|---|
| `csv-import.spec.ts` `--repeat-each=20`, 6 workers, load average 7 → 41 | 16 failed, 284 passed. Not valid: all 16 failures are `ENOENT` of trace files. A second Playwright run in the same checkout (the SYS-11 run above) started at the same minute and deleted `test-results/`. Error to avoid: give each parallel run its own `--output`. |
| Same, `--repeat-each=30`, 6 workers, own `--output`, load average 15 → 65 | 1 failed, 449 passed: `:81` (same flow), the dialog stayed open. The DOM snapshot shows the alert "Dosyada 1 hata var" (the commit answered 422) for a valid file |
| New test `mock-worker-lib.spec.ts`: a chunk request (PUT) waits for its headers while a GET request runs through the mock, code before the fix, `--repeat-each=3` | 3 of 3 failed: `received_bytes` 0, expected 71 |

Root cause (measured): `MockWorker.handle()` (`e2e/fixtures/mock-worker.ts`) wrote the raw body of each request into the object fields `rawBuffer` and `rawBody`, and then waited for `request.allHeaders()`. In that time another request of the same page could run through `handle()` and write its own body (a GET request has an empty body). Not measured: which request of the app came in between in the failed runs (the CI runs keep no trace). The chunk request then stored an empty chunk, the commit found no row and answered 422. The app showed the line error and kept the dialog open, so no series came. The same applies to the media upload (`rawBuffer`). The application is not changed: the defect is only in the mock.

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/formation-prefs-draft-lib.spec.ts` | A static import of the store at the top of the file (the store now always loads before the storage, as in the failed workers). Each test installs its own empty `localStorage` (`Object.defineProperty`, not `??=`), deletes the store module from the `require` cache and loads it again, so the store takes the storage of the test. |
| `frontend_nextjs/e2e/mocked/heavy-lock-lib.spec.ts` | `:349` takes the root process without children that runs longest (`ps -o etime`), not the one with the smallest pid. It requires `not permitted` in the stderr of `kill -0` (EPERM, not ESRCH). The status assertion shows pid and stderr of the script. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | `handle()` keeps the raw body in a local value and writes it into `rawBuffer`/`rawBody` directly before the synchronous calls `mediaRoute()` and `dispatch()`. |
| `frontend_nextjs/e2e/mocked/mock-worker-lib.spec.ts` | New test (`@BKT-05`): a chunk keeps its body when a GET request runs while the chunk waits for its headers; the commit then gives 200 and 2 bars. |
| `docs/features/features.yaml` | BKT-05 lists the new spec file. |

## Why
- FRM-42: the static import makes the order of the failed workers the normal case of the file, so the test is red without the fix on each run, not only in some workers. The new load of the module gives the store the storage of the test on Node 22 and on Node 26. Rejected: `persist.setOptions` (the first version of this fix): on Node 22 the store loaded without storage has no `persist` (reviewer finding, measured below). Rejected: set `localStorage` in a global setup (it changes all `-lib` specs).
- SYS-11: the test must name a process that lives during the test. The longest-running root process (on the Mac `logd` or a similar daemon) does not end in seconds. The EPERM check makes a wrong choice visible as a failed check before the script runs, not as a wrong result of the script. Rejected: a skip when the process ended (it hides the test).
- BKT-05: the defect was in the mock, so the fix is in the mock. The tests of `csv-import.spec.ts` are unchanged. Rejected: a retry of the commit in the test, or a longer timeout (both hide the cause).

## Verification

| Check | Result |
|---|---|
| First fix (`setOptions`), `--repeat-each=3`, 1 worker, Node 26 | 9 of 9 passed |
| First fix: the 20 specs of the failed worker plus `chart-rsi-review-lib`, 1 worker, load average 229 → 240 | 946 passed |
| First fix with `NODE_OPTIONS=--no-experimental-webstorage` (no `localStorage`, as Node 22) | 3 of 3 failed: `Cannot read properties of undefined (reading 'setOptions')` |
| Final fix (new load of the module), `--repeat-each=3`, 1 worker, Node 26 and with `--no-experimental-webstorage` | 9 of 9 passed in each mode |
| Final fix: the 20 specs of the failed worker plus `chart-rsi-review-lib`, 1 worker, Node 26 and with `--no-experimental-webstorage`, load average 23 → 54 | 946 passed in each mode |
| SYS-11 `:349` after the fix, `--repeat-each=200`, 4 workers, in parallel with the BKT-05 run, load average 26 → 65 | 200 of 200 passed |
| `mock-worker-lib.spec.ts` after the fix, `--repeat-each=3` | 3 of 3 passed |
| `npx eslint` (changed files), `npx tsc --noEmit`, `update_checklist.py --check` | clean; `features.yaml ok (284 Features)` |
| BKT-05 after the fix: `csv-import.spec.ts` `--repeat-each=30`, 6 workers, own `--output`, load average 17 → 29 (after 2791 s wait for the lock) | 450 passed |
| `scripts/features/precheck.sh` on the final commit, load average 29 → 15 | `PRECHECK OK in 1466s` · e2e ran=3907 passed=3906 failed=0 flaky=1; flaky: `chart-workspace.spec.ts:526` (ANA-20, known flaky, `2026-11-16-flaky-tests-ana27-ui26-ana20-frm30-usr17.md`; this branch does not change it) |

## Open points
- [ ] CI of this PR and the `main` run after the merge.
- The open point "BKT-05 `csv-import.spec.ts` … Cause not known" in `2026-11-16-flaky-tests-ana27-ui26-ana20-frm30-usr17.md` is solved by this entry.

## Lessons
A module that reads a browser global when it loads keeps the value of the first test file that loaded it in the Playwright worker. A `-lib` test of such a module must load the module again after it installs its own fake (delete it from the `require` cache), and not depend on the order of the files. `persist.setOptions` is not sufficient: a zustand store that loaded without storage has no `persist`.

A mock that handles requests with `await` must not keep request data in object fields across the `await`. Two requests of one page can overlap.

Two Playwright runs in the same checkout share `test-results/`. Give each parallel run its own `--output`, or the second run deletes the traces of the first.
