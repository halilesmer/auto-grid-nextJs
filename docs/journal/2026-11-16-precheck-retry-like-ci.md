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
Measured on the Mac of the project owner, under heavy load (load average 28–69, swap nearly full). Nothing here says "the pre-PR check passed": both full runs of the final code ended red in tests that this branch did not change.

| Check | Result |
|---|---|
| `test-scripts-lib.spec.ts` before the fix (3 new tests, implementation reverted) | 3 failed, 3 passed |
| `test-scripts-lib.spec.ts` after the fix, also with `E2E_PRECHECK=1` in the environment | 20 passed |
| `pw_stats.py` with a hand-made report (2 flaky specs) | `ran=2 passed=1 failed=0 flaky=1 skipped=0`, then 2 `oynak:` lines |
| `tsc --noEmit`, `eslint` (changed files), `update_checklist.py --check` | clean |
| Full `precheck.sh` run 1 (before `main` was merged) | `PRECHECK FEHLER in 1830s (Sperre 345s gewartet) · katalog ok (0s) worker ok (168s) lint ok (18s) tsc ok (3s) e2e FEHLER (1641s) · e2e ran=3806 passed=3804 failed=1 flaky=1 skipped=0`. Failed: FRM-30 "Zwei Tabs lösen nur eine Suche aus" (4 expected, 8 seen, in both attempts). Flaky: ANA-27 `chart-older-heavy.spec.ts:95`. |
| FRM-30 alone, 3 runs, no `E2E_PRECHECK` | 2 passed, 1 failed with 8 |
| FRM-30 alone, 3 runs, `E2E_PRECHECK=1` | 3 passed |
| Full `precheck.sh` run 2 (after `main` was merged) | `PRECHECK FEHLER in 2790s (Sperre 2315s gewartet) · katalog ok (0s) worker ok (193s) lint ok (18s) tsc ok (5s) e2e FEHLER (2574s) · e2e ran=3807 passed=3800 failed=1 flaky=6 skipped=0`. Failed: ANA-19 `chart-workspace.spec.ts:386` (timeout in both attempts). Flaky: BKT-15 `backtest-exact-range.spec.ts:30`, UI-17/UI-08 `chart-dock-s5.spec.ts:175`, FRM-42 `formation-prefs-draft-lib.spec.ts:8` (2 tests), FRM-39 `formation-trade.spec.ts:122` and `:149`. |
| ANA-19 alone, 3 runs, no `E2E_PRECHECK`, load 28–55 | 3 failed (timeouts: "Test timeout of 30000ms", `locator.click`, "element(s) not found") |
| `git diff --stat origin/main...HEAD -- frontend_nextjs/src worker_python` | empty: the branch changes no application code |
| `tests.yml` on `main`, ANA-19 duration in the first attempt (read by the coordinator from the GitHub logs) | 24.2 s (run 43773614864), 27.2 s (43832842813), 23.9 s (43836250040), 28.0 s (43850002630); none flaky; the limit is 30 s |

Measured: the CI times and the 3 failed local runs. Inferred, not measured: ANA-19 fails because the test runs close to its 30 s limit and the Mac was overloaded. "ANA-19 passes on an idle Mac" was not measured. CI of this PR is the proof for the unchanged tests.

## Open points
- [ ] ANA-19 takes 24–28 s in CI against a limit of 30 s (it fails on an overloaded Mac). Not changed here; the coordinator tracks it.
- The open point in `2026-11-16-chart-drawing-tests-scan-race` ("precheck without a retry") is solved by this entry. The coordinator marks it there; this PR does not touch that file.
