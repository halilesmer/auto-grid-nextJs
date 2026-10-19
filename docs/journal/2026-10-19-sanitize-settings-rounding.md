---
date: 2026-10-19
author: Claude
type: fix
status: open
pr: [204]
features: [SET-04]
areas: [worker, tests]
---

# Settings save changed 5-digit forex values

## Request
Fix the rounding in `sanitize_settings`. A setup was saved through the settings API. The stored `take_profit` was 0.001 and not 0.0008.

## Cause
`sanitize_settings` (`worker_python/src/utils/config.py`) ran on every `POST /api/settings/{account_id}`. It rounded each float to 5 digits. Then it snapped the value to 2 or 3 decimals when the difference was below 0.0002.

Each value within 0.0002 of a multiple of 0.001 changed. This is normal for 5-digit forex values.

| Input | Stored before the fix |
|---|---|
| `take_profit` 0.0008 | 0.001 |
| `grid_step` 0.0011 | 0.001 |
| `grid_step` 0.0012 | 0.001 |
| price 1.12299 | 1.123 |

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/config.py` | `sanitize_settings` rounds each float to 7 digits. The snap to 2 or 3 decimals is removed. |
| `worker_python/tests/api/test_settings_state_api.py` | New test `test_speichern_behaelt_fuenfstellige_forex_werte` (SET-04). It was red before the fix. |
| `docs/features/features.yaml` | The SET-04 description names the 7-digit rounding. |

## Why
The function must remove only float noise, for example `0.30000000000000004`. The existing tests need `1.00000001` to become `1.0` and `0.0100000001` to become `0.01`. Therefore 7 digits is the maximum. It keeps prices with up to 7 digits.

Rejected: rounding to 10 digits. The existing SET-04 tests would fail, because they expect noise of 1e-8 and 1e-10 to disappear.

The frontend does not depend on the snap. `sanitizeNumbers` in `frontend_nextjs/src/store/useSettingsStore.ts` rounds to 8 digits. The backtest code in `frontend_nextjs/src/lib/backtest/` has no rounding of settings. Settings files saved before the fix keep their changed values. Check them by hand.

## Verification
- `pytest tests/api/test_settings_state_api.py` before the fix: 1 failed (`(0.001, 0.001, 1.123)` instead of `(0.0008, 0.0011, 1.12299)`), 8 passed.
- `pytest` in `worker_python/` after the fix: 889 passed, including the parity golden tests.
- Not verified: save through the live worker on the VPS. The worker cannot run on the Mac.

## Open points
- [ ] Settings already saved with a snapped value stay wrong. Check `take_profit`, `grid_step` and the prices of the EURCHF setup and enter them again.

## Lessons
A rounding step in a save path must not change the value of the user. Test it with the real precision of the instruments, not only with noise values.
