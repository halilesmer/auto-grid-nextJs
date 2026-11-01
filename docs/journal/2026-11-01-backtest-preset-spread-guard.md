---
date: 2026-11-01
author: Claude
type: fix
status: done
pr: []
features: [BKT-11, BKT-12, BKT-15, ENG-31]
areas: [frontend, worker]
---

# Backtest preset keeps spread guard, accepts times

## Request
Fix findings B1 and B5 of the Codex audit of the page `/backtest` (checked at commit `82f753e`; reports are in `docs/codex/`, which git ignores).

## Cause
**B1 (critical).** `presetZone()` copies only the keys of `defaultZone()`, and `spread_guard` is not one of them. The worker whitelist in `backtest_presets.py` did not know the field either. A preset or a zone transfer dropped the guard. A run with the guard gave 0 trades and equity 1000. After `presetZone()` the same setup gave 2 trades and equity 1016.

**B5 (medium).** `CustomRange.valid_days` demanded exactly `{from, to}`. The frontend also sends `fromTime` and `toTime` (BKT-15), so the worker rejected the preset. The mock worker used `parsePresetData()` and not the rules of the real API, so no test saw it.

## Solution
| File | Change |
|---|---|
| `worker_python/src/api/backtest_presets.py` | `spread_guard` is a valid zone field. Unknown sub-keys are rejected. `validate_spread_guard` checks the values. `fromTime` and `toTime` are optional and must be `HH:MM:SS` |
| `src/lib/backtest/presets.ts` | `presetZone()` keeps and checks `spread_guard` (`spreadGuardError`). An old preset without the field stays valid |
| `src/lib/backtest/transferZone.ts`, `hooks/useZoneTransfer.ts` | A transfer without a guard in the setup keeps the guard of the target zone. A new zone stays without guard |
| `e2e/fixtures/mock-worker.ts` | The mock rejects unknown zone fields and unknown range keys, like the worker |

`defaultZone()` is not changed: a new zone must not get a guard object. `spread_guard` was the only field of `ZoneSettings` that the whitelist missed.

## Why
A guard that is silently dropped gives a result that is too good, and the user cannot see why. Invalid values are rejected, not dropped, so the preset cannot differ from the setup.

## Verification
- Worker tests `test_backtest_presets_api.py` were red (3 failed), then green (26 passed after the review fixes).
- Lib tests `backtest-preset-guard-lib.spec.ts` were red (3 failed), then green.

## Lessons
A mock must check the rules of the real API, not derive them from the frontend code. The reviewer also found three limits: a guard from the target zone can clash with a fractal entry (now dropped), huge numbers in guard fields (now rejected, no 500), and `\d` in the worker time pattern matches non-ASCII digits (now `[0-9]`). The field lists of the mock and the worker are still two copies.

## Open points
- [ ] Packages 2 to 4 of the audit (calculation core, notes, chart, docs) are separate PRs.
