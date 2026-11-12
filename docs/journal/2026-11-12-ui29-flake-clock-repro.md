---
date: 2026-11-12
author: Claude
type: diagnosis
status: done
pr: []
features: [UI-29]
areas: [tests]
---

# UI-29 flake: reproduced with a fixed clock, already fixed by PR 510

## Request
UI-29 (`e2e/mocked/chart-floating-bar-templates.spec.ts`) failed four times in CI on PR 512, and also locally on the base `942b1d2`. It passed on main. The owner asked for the root cause (code 1112-A1.4).

## Cause
The base `942b1d2` does not have the magnet fix of PR 510 (`0ccaa590`). With the magnet on, the line end points snap to candle values. The mock makes the candle prices from the candle time (`mid(t)`), so the snap distance depends on the clock. The middle of the line then does not stay at the click point. The select click misses the line and `drawing-floating-toolbar` does not appear in 7 s. This is why the test looked time-dependent. See also `2026-11-12-card-title-symbol-and-ui29-magnet.md`.

## Reproduction (Mac, `E2E_FAKE_NOW` sets mock and browser clock)
| Spec version | Clock | Result |
|---|---|---|
| `942b1d2` (magnet on) | 2026-11-12T01:30Z | pass |
| `942b1d2` (magnet on) | 2026-11-12T06:55Z | fail, `select` step |
| `942b1d2` (magnet on) | no fixed clock (06:5x UTC) | fail, `select` step |
| main (magnet off) | 01:30Z, 06:55Z, 13:10Z | pass (2 of 2 tests) |

## Solution
No code change. PR 510 already fixes it. PR 512 failed because its CI ran on a base without PR 510. This entry records the repro condition.

## Why
A test that clicks a drawing at calculated pixels must not depend on the candle values. Magnet off removes that dependency. We did not add retries or longer timeouts.
