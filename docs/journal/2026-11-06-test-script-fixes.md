---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [SYS-10]
areas: [tests, tooling]
---

# Test scripts: five audit findings fixed

## Request
The Opus audit (R3) of the test scripts found five low-severity defects. The project owner approved the fixes before the work started. The lock fixes (R3-03, R3-04, R3-10) are in `2026-11-06-heavy-lock-race-fixes.md`.

## Cause
| ID | Symptom | Cause |
|---|---|---|
| R3-06 | An orphan test server is never stopped, `precheck.sh` stays red ("gehört zu einem laufenden Playwright-Lauf") | `e2e_server.sh` searched the word `playwright` in the whole command of each ancestor. A checkout path such as `worktrees/playwright-port-fix/...` is in that command. |
| R3-07 | `precheck.sh --grep @X` writes "PRECHECK OK" | The result line did not look at the extra arguments. |
| R3-08 | A filtered `run.sh` run passes with zero tests, and can read an old report | The zero-test check was only for the unfiltered run, and the old JSON stayed. |
| R3-09 | `E2E_PORT=99999` is accepted, `E2E_PORT=abc` falls back to the path port without a message | `resolveE2EPort` checked only "integer > 0". |
| R3-11 | The cleanup is skipped without a message ("Port ?") | If Node could not read `env.ts`, `e2e_port` gave an empty port (stderr was hidden), and `e2e_server_cleanup` returned 0 for an empty port. |

All five were reproduced with the old scripts before the fix.

## Solution
| File | Change |
|---|---|
| `scripts/features/e2e_server.sh` | Ancestor test matches `playwright test`, `playwright/cli` or `playwright/test/cli`, not the path. `e2e_port` shows stderr and prints the port with `process.stdout.write` (with `FORCE_COLOR`, `node -p` adds colour codes to the number). An empty port is an error for `start` (not for `exit`, not with `E2E_REUSE=1`). |
| `scripts/features/precheck.sh` | With extra arguments the last line starts with `PRECHECK TEILLAUF` and says "kein vollständiger Check". |
| `scripts/features/run.sh` | `rm -f` of the old report before each Playwright run. A missing report is an error. With a filter, a tier with zero tests is allowed (ENG-05 has no e2e test), but zero tests in all tiers is an error. |
| `frontend_nextjs/e2e/fixtures/env.ts` | A set `E2E_PORT` that is not a whole number from 1 to 65535 throws an error. An empty `E2E_PORT` still means "not set". |
| `frontend_nextjs/e2e/mocked/test-scripts-lib.spec.ts` | 12 new tests. They run the real scripts against a copy with a fake `npx`: no build, no server, no browser, no lock. |
| `frontend_nextjs/e2e/mocked/e2e-port-lib.spec.ts` | The test "an invalid `E2E_PORT` falls back" now expects an error (R3-09). This is the requested change of behaviour, not a loosened test. |
| `frontend_nextjs/e2e/mocked/heavy-lock-lib.spec.ts` | Test "SIGTERM gibt die Sperre frei" (from PR 389) waits until the wrapper has started its command (`waitForCommand`). `owner` is written before the command: under load, `pkill -P` found no child, and bash held the TERM signal until `sleep 30` ended (precheck: 30 s timeout). The assertions are the same. |
| `docs/features/features.yaml`, `hooks/RULES.md` §4.8, §4.9, §4.11 | New rules. |

## Why
- A filter with zero tests in one tier only is not an error: a feature can have unit tests and no e2e test. The error is "zero in all tiers".
- Two collisions between ports (10 worktrees: approx. 6.8 %) still give a loud error from Playwright. The design is not changed.

## Verification
- Old scripts with the new tests: 9 red (R3-06, R3-09 ×2, R3-11 ×2, R3-07 ×2, R3-08 ×2). 3 control tests green.
- New scripts: `test-scripts-lib.spec.ts` 12 of 12 and `e2e-port-lib.spec.ts` green.
- Not verified: Linux CI (`lsof`, `ps` command format) before the PR checks run.

## Lessons
- A test that signals the child of a process must wait until that child exists.
- Do not search for a word in the full command of a process when the command contains paths of the checkout.
- A test that simulates an orphan process must really be orphaned: when the test runner is its ancestor, the code sees the runner.
- A shell function that reads a value from `node -p` must not trust the output format: colour settings change it.
