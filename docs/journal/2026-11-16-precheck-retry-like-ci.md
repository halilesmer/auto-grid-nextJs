---
date: 2026-11-16
author: Claude
type: decision
status: done
pr: []
features: [SYS-10]
areas: [tests]
---

# precheck.sh retries once, like CI

## Request
`precheck.sh` says it runs "the same as CI", but CI retries a failed Playwright test once (`retries: process.env.CI ? 1 : 0`) and the local check did not. A flaky test passed in CI as "flaky" and turned the whole local check red. The check holds the heavy lock for 15 minutes or more, so a red run for nothing is expensive. The project owner approved the fix on 2026-11-16 (1116-A8.4): same retry as CI, and flaky tests must stay visible.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/playwright.config.ts` | New constant `CI_RETRIES = 1`. `retries` uses it when `CI` or `E2E_PRECHECK=1` is set, else 0. |
| `scripts/features/precheck.sh` | The e2e step runs Playwright with `E2E_PRECHECK=1`. It prints each flaky test under the result line. |
| `scripts/features/pw_stats.py` | After the `ran=… flaky=N …` line it prints one line `oynak: <file>:<line> <title>` for each flaky test. The exit code is unchanged. |
| `e2e/mocked/test-scripts-lib.spec.ts` | Tests for the env variable, a flaky run (exit 0), a failed run (exit 1), zero tests, and the config value. |
| `features.yaml` (SYS-10), `hooks/RULES.md` §4.8, `.claude/rules/tests.md` | Rule text. |

The `PRECHECK OK` line keeps its format, including `flaky=N`. The names are on separate lines below it, so scripts and rules that read the line see no change.

## Why
- One source for the number: `CI_RETRIES` lives only in `playwright.config.ts`. CI uses it through `CI`, the check through `E2E_PRECHECK=1`. A change of the number changes both. Rejected: the CLI flag `--retries=1` in `precheck.sh` (a second copy of the number), and `CI=1` in `precheck.sh` (it also changes workers, reporter and `forbidOnly`, and it turns the heavy lock off).
- Only the check retries. `run.sh` and a manual `npx playwright test` do not, so a flaky test shows at once during development.
- A flaky test keeps the check green, as in CI, but is never hidden: `flaky=N` and the test names are in the output.
- Zero tests stays an error (`hooks/RULES.md` §4.9). Extra Playwright arguments still give `PRECHECK TEILLAUF`.

## Verification
See the PR description for the command results.

## Open points
- The open point in `2026-11-16-chart-drawing-tests-scan-race` ("precheck without a retry") is solved by this entry. The coordinator marks it there; this PR does not touch that file.
