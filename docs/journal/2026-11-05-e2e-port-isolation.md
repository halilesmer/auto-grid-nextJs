---
date: 2026-11-05
author: Claude
type: fix
status: open
pr: [384]
features: [SYS-10]
areas: [frontend, tests, rules]
---

# e2e port per checkout and one pre-PR check

## Request

Step S1 of plan 1105-A5 (PR 381, formations follow the trend path) took 110 min instead of approx. 30 min. The project owner asked for the root cause and a fix in the system, not only in one session. 3–5 sessions run in parallel, each in its own git worktree.

## Cause

Time of S1, measured from the session transcript (UTC):

| Part | Time |
|---|---|
| Coding | 14 min |
| Re-baseline of fixtures | approx. 58 min |
| Local FRM runs | approx. 13 min |
| CI wait (first run, red) | 16 min |
| Fix of the red CI | 8 min |
| CI wait (second run) | 18 min |
| **Total** | **110 min** |

Four system causes:

| ID | Cause | Evidence |
|---|---|---|
| A | Shared e2e port. `E2E_PORT` defaulted to 3100 in every checkout, and `reuseExistingServer` was `!CI`. A second run reused the server of another worktree (a build of a different branch). When the first run stopped, the second run got `ERR_CONNECTION_REFUSED`. A reuse can also give a false green: the tests run against the code of a different branch. | First `run.sh FRM` of S1 (12:52–13:02): 118 `ERR_CONNECTION_REFUSED` lines. 14:10: 7 false red FRM-43 tests. Both stopped with `E2E_PORT=3187`. 22 journal entries since 2026-10-11 mention `E2E_PORT` as a per-session workaround. |
| B | The local check was not the CI check. CI runs catalog, pytest, lint, tsc and all mocked e2e tests (4 shards). S1 ran only `run.sh FRM`. | CI failed on 3 specs outside FRM (`chart-header`, `chart-layers-menu`, `chart-one-page`; all read the fixture `gar-buy-h4-01`). |
| C | No blast-radius estimate. The plan said that the risk "closes with the test". | Approx. 107 lib tests turned red (62 distinct failures after the first fix, 17 spec files). 24 fixtures needed their own trend setting, 13 expectations were regenerated. |
| D | Ad hoc sweep without a zero-test check. | One run of the first 36-setting sweep had `stats.expected = 0, unexpected = 0`. It was read as "all pass"; the mistake was found 31 min later. |

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/e2e/fixtures/env.ts` | `portForPath()` (FNV-1a hash of the checkout path into 3300–3999), `resolveE2EPort()` (explicit `E2E_PORT` > CI 3100 > derived port), `checkoutRoot()` (`git rev-parse --show-toplevel`, symlinks resolved, cached in `E2E_CHECKOUT_ROOT` for the Playwright workers). |
| `frontend_nextjs/playwright.config.ts` | `reuseExistingServer` only with `E2E_REUSE=1`. Without it, Playwright stops with "http://localhost:<port> is already used". Applies to the live project too; its port stays 3200. |
| `frontend_nextjs/e2e/mocked/e2e-port-lib.spec.ts` | SYS-10 tests without browser (pure TS, like the other `*-lib.spec.ts`). |
| `scripts/features/pw_stats.py` | Reads a Playwright JSON report, prints one line, exit 3 when zero tests ran. |
| `scripts/features/precheck.sh` | The CI steps in CI order: catalog, worker pytest, lint, tsc, all mocked e2e tests on the port of the checkout. One result line. Fails on zero tests. Writes only `.feature-results/precheck-e2e.json`. |
| `scripts/features/run.sh` | An unfiltered e2e run fails on zero tests. |
| `hooks/RULES.md` §4.8–4.11 | Pre-PR check, zero-test rule, blast-radius rule for plan steps, port rule. |
| `CLAUDE.md`, `.claude/skills/feature-test/SKILL.md` | Pointer to `precheck.sh`; the codegen line uses the port of the checkout instead of 3100. |
| `docs/features/features.yaml` | New feature SYS-10 in category SYS ("Verbindung & Infrastruktur"). No category for test infrastructure exists; SYS is the closest infrastructure category. |

## Why

- Port from the path, not a random free port: the port must be the same in the Playwright runner, in its workers and for a person who starts `codegen`. A hash of the checkout path is stable and needs no state file.
- `git rev-parse --show-toplevel` instead of `__dirname`: outside the Playwright loader (for example `node` with type stripping) `__dirname` in `env.ts` is `.`, so the path and the port were wrong. `git` gives the worktree root in a worktree and the main root in the main checkout.
- Range 3300–3999 (700 ports): it does not touch 3000 (dev server), 3100 (CI) or 3200 (live). With 5 checkouts the chance of a collision is approx. 1.4 %. A collision now gives the clear "already used" error, not a silent reuse. Then set `E2E_PORT`.
- No reuse by default: a reused server can be the build of a different branch. A false green is worse than a stop. `E2E_REUSE=1` keeps the fast dev loop for a server that you started yourself.
- `precheck.sh` is not in the pre-push hook. One run takes approx. 15 min on this Mac (measured: 884 s; pytest 141 s, e2e 726 s without shards) and every push (also a small fix push) would wait for it. No cheap subset gives the same result: cause B was a failure outside the changed category. The rule (§4.8) asks for it before the first push of a PR.
- Worker pytest is in `precheck.sh` although the brief named only catalog, lint, tsc and e2e: CI runs it, and the goal is "same as CI".
- `run.sh` with a filter keeps `--pass-with-no-tests`: a feature can legitimately have no test in one tier.

## Verification

| Check | Result |
|---|---|
| Unit test SYS-10 (`e2e-port-lib.spec.ts`) | 6 passed (two worktree paths and the main path give 3 different ports in range; CI gives 3100; explicit `E2E_PORT` wins, also in CI; invalid `E2E_PORT` falls back). |
| Real values on this Mac | This worktree 3634, main checkout 3357, `CI=1` 3100, `E2E_PORT=3187 CI=1` 3187. |
| Port occupied (`python3 -m http.server 3634`), then the SYS-10 spec | `Error: http://localhost:3634 is already used …`, exit 1, no test against the foreign process. |
| Same spec, port free | 6 passed (1.9 min with build). |
| `precheck.sh --grep @DOES-NOT-EXIST` | `ran=0 …`, "KEIN Test ausgeführt", `PRECHECK FEHLER`, exit 1. |
| `precheck.sh` full run on this branch | `PRECHECK OK in 884s · katalog ok (1s) worker ok (141s) lint ok (14s) tsc ok (2s) e2e ok (726s) · e2e ran=2818 passed=2818 failed=0 flaky=0 skipped=0` on port 3634. |
| `run.sh check`, `npm run lint`, `npx tsc --noEmit` | Clean (lint: 2 old warnings in `formation-page-lib.spec.ts`, 0 errors). |

## Open points

- Not verified: one earlier `precheck.sh` run (with `--grep @DOES-NOT-EXIST`) reported `worker FEHLER` after 336 s while another session ran tests on the same Mac. Two later pytest runs passed (1000 passed, 138 s and 141 s). The failing test was not recorded. If it occurs again, keep the pytest output.

## Lessons

- A workaround that appears in more than 2 journal entries is a system defect. Fix it in the setup, not again in the next session.
- A green result without a test count is not evidence. Print the count and fail on zero.
- Before a step that changes shared logic, measure the blast radius. A step with more than approx. 20 red tests is two steps.
