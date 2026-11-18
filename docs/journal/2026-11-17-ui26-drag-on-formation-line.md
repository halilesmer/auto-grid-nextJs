---
date: 2026-11-17
author: Claude
type: fix
status: done
pr: [604]
features: [UI-26]
areas: [tests, chart]
---

# UI-26 red from 21:00 UTC: drag started on a formation line

## Request
`main` was red after the merge of PR 602 (`tests.yml` run 44175274756, commit `3810e39f`, 21:00–21:20 UTC). Both tests in `frontend_nextjs/e2e/mocked/chart-latest-bar.spec.ts` (`@UI-26`) failed on both tries at line 28: after the drag, `aria-hidden` of `chart-latest-bar` stayed `"true"`. The application code was the same as in the last green `main` run (44113570819, commit `e209e752`, 15:22 UTC).

## Cause
The test dragged the chart from a fixed point: 30 % of the chart width and 30 % of the chart height. The mock candles (`MockWorker.rates`, sine curve of the time) follow the clock, and the formation lines that the scan draws on them follow the candles. From approx. 21:00 UTC on 2026-11-17, a formation line sat on the start point of the drag. Its hit area (`line-hit`) took the press, so the chart did not scroll and the button did not show. This is the same mechanism as UI-30 (journal `2026-11-15-e2e-ui26-ui30-flake-diagnosis`). A press on a formation line is expected behavior, so the test was wrong, not the application.

Reproduction (Mac, production build, mocked worker, `E2E_FAKE_NOW`, both tests, `--retries=0`):

| Clock (UTC) | Result |
|---|---|
| 2026-11-17 15:20 | 2 passed |
| 2026-11-17 20:30 | 2 passed |
| 2026-11-17 21:00, 21:10, 21:20, 22:00 | 2 failed each |
| Real clock (approx. 21:30 on 2026-11-17) | 2 failed |
| 2026-11-16 21:00 | 2 passed |

Top element at x = 30 % of the chart width (probe, `document.elementFromPoint`):

| Height | 15:20 UTC | 21:00 UTC |
|---|---|---|
| 30 % (drag start) | canvas | `line#line-hit` |
| 40 % | `line#line-hit` | `line#line-hit` |
| 20 %, 50 %, 60 %, 70 % | canvas | canvas |

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/chart-latest-bar.spec.ts` | `test.use({ fakeNow: '2026-11-17T15:20:00Z' })`. New `freeY`: the drag starts at the first `y` between 20 % and 60 % of the chart height where the top element at three `x` values is a canvas; the test fails with a message when there is no such `y`. The `expect` calls are the same. |

## Why
The fixed clock gives the same chart on every run. `freeY` also keeps the press off overlays if the mock data changes later. The test is not weaker: it checks the same button states after the same drag and click. A change of the application (a press on a formation line that scrolls the chart) was rejected: the line must keep the press for selection.

## Verification
- Final file, real clock 21:33 UTC on 2026-11-17 (inside the red window), `--repeat-each=5`: 10 passed.
- `freeY` only (temporary copy without `fakeNow`), `E2E_FAKE_NOW` at 2026-11-17 21:00, 21:20, 22:00; 2026-11-18 03:00, 09:00; 2026-11-19 13:00; 2026-11-20 18:00; 2026-11-21 12:00 (Saturday); 2026-11-23 00:30; 2026-11-24 21:00: 2 passed at each clock (20 of 20).

## Lessons
- A mocked e2e test that presses on the chart must not use a fixed point and the real clock together. Use `fakeNow`, and find a free point with `freeY`.
- `chart-workspace.spec.ts` also drags at fixed points on mock candles. Not checked in this change.
