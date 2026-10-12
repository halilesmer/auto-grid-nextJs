---
date: 2026-10-11
author: Codex
type: feature
status: open
pr: [152, 158]
features: [ENG-31]
areas: [worker, frontend, tests, docs]
---

# Selectable spread protection per setup

## Request

- Add optional protection against high spreads for each setup.
- Cancel the setup's pending bot orders and block all new entries during protection.
- Keep position management, manual orders, other setups and manual pause states independent.
- Use the same decisions in the worker and browser backtest.

## Solution

| File | Change |
|---|---|
| `worker_python/src/core/spread_guard.py` | Three thresholds, tick validation, shared learning, persistent locks, cancellation and recovery. |
| `worker_python/src/core/grid_orchestrator.py` | Check protection before the remote pause return. |
| `worker_python/src/core/loop.py` | Check protection during market closure. |
| `worker_python/src/core/grid_orders.py` | Gate pending entries, including partial fill completion. Retry failed cancellation on the next turn. |
| `worker_python/src/core/grid_execution/instant_entry.py` | Gate market entries and clear their cooldown after a blocked send. |
| `worker_python/src/utils/trade_utils.py` | Recheck spread immediately before broker submission through a callback. |
| `worker_python/src/api/settings.py` | Reject incomplete enabled settings with 422 before writing. Keep the existing save endpoint. |
| `worker_python/src/utils/config.py` | Preserve small spread differences without the older numeric rounding. |
| `frontend_nextjs/src/components/zone/ZoneSpreadFields.tsx` | Method fields, learning startup, live status, hints and responsive layout. |
| `frontend_nextjs/src/lib/backtest/engine/spreadGuard.ts` | Apply the worker rules to observed simulation ticks. |
| `worker_python/tests/parity/runner.py` | Accept an optional spread for each scenario tick. |
| `docs/features/features.yaml` | Register ENG-31 with unit, API and browser tests. |

## Why

The guard uses persistent magic identifiers. Setup reordering cannot move its protection to another setup.
The guard does not write PAUSE states. Recovery cannot restart a manually paused setup.
Fixed thresholds use price differences because point and pip units differ between symbols and brokers.
Grid thresholds reuse the engine's distance conversion, including its effective lot rules.
Relative learning shares a median per account and symbol. It uses at most one valid sample per minute.
Both startup methods collect the first 60 samples, even when a manual reference blocks entries.
After learning, protection freezes the reference and entry threshold until recovery.
Expired history can start another learning round. The active entry threshold remains locked during this round.
A restart restores the lock but resets its recovery timer. Persisted elapsed time cannot shorten recovery.
The broker can execute an order before cancellation arrives. A final quote check cannot remove this race.
Learning only during wide spreads can establish a wide normal reference. A fixed threshold or manual bootstrap controls startup.

## Verification

| Command or check | Result |
|---|---|
| `scripts/features/run.sh unit` | 493 passed. Includes learning, thresholds, recovery, restart, order scope and golden scenarios. |
| `scripts/features/run.sh api` | 263 passed. Includes spread validation, exact save/read and rejected-write preservation. |
| `scripts/features/run.sh e2e 'ENG-31\|@BKT-02\|@UI-07\|@ZON-20'` | 90 passed. Existing backtest, hints and setup layout remain valid. |
| `scripts/features/run.sh e2e ENG-31` | 13 passed after the final learning correction. Five worker/browser golden scenarios match. |
| `npm run lint` | Passed. |
| `npx tsc --noEmit` | Passed. |
| `npx next build --webpack` | Passed with the mocked worker environment. The sandbox prevented the normal Turbopack build. |
| `pyright --outputjson` | 31 existing errors. The isolated starting revision had 33 errors. No new diagnostics. |
| `scripts/features/run.sh check` | 158 catalog entries valid. |
| `git diff --check` | Passed. |
| Visual checks | Light and dark screenshots checked at 375 px and desktop width. No horizontal overflow. |
| `hooks/RULES.md` §9 | Reviewed entry routes, API ownership, status consumers, atomic persistence and simulated time. |
| Live trading | Not verified. The user authorized the controlled DEMO test on 2026-10-12. The VPS received the feature later; the broker-time check still blocks the trading validation. No worker ran on the Mac. |

## Open points

- [ ] Run the live DEMO validation when the market is open. The owner requested this follow-up on 2026-10-11.
- Use the separately authorized DEMO account after the VPS receives the change and the worker restarts.
- Verify pending order cancellation, blocked entries, unaffected position management and recovery after 30 seconds below 80% of the limit.
- Record the result here. No live trading test has run yet.

## Lessons

- Keep initial learning separate from the lock that blocks entries. A manual startup reference must not stop initial learning.
- Expired learning history must not remove a stored entry lock or prevent a new learning round.
- Test spread changes between broker validation and submission. A check at the start of a loop cannot cover that interval.


## Conflict resolution (2026-10-12)

- Merge the current `origin/main` into PR #152 without changing the shared checkout.
- Preserve exact spread prices and version-1 pip/tick counts in `sanitize_settings`.
- Keep both sets of parity scenarios and both ENG-30 and ENG-31 catalog entries.
- Regenerate the feature results and checklist through the feature runner.
- The combined API regression failed against the previous PR code: `3.3333333333333335` became `3.33333`.
- The merged implementation preserves both values in the same setup.

| Command or check | Result |
|---|---|
| `scripts/features/run.sh unit` | 549 passed. |
| `scripts/features/run.sh api` | 266 passed, including the combined precision regression. |
| `E2E_PORT=3312 scripts/features/run.sh e2e 'ENG-31\|@ENG-30\|@ZON-21\|@ZON-20\|@BKT-02'` | 99 passed against the isolated mocked frontend. |
| `E2E_PORT=3312 scripts/features/run.sh e2e BKT-03` | 30 passed; all existing and new fractal parity cases. |
| `npm run lint`, `npx tsc --noEmit` | Exit 0. |
| `npx next build --webpack` | Mocked production build passed. |
| `pyright --outputjson` | 31 existing diagnostics; none in the conflict-resolution files. |
| `scripts/features/run.sh check` | 158 catalog entries valid. |
| Scenario generator comparison | All five spread and both new pip/tick scenarios match their saved fixtures. |
| `hooks/RULES.md` §9 | Reviewed the merged precision rules, scenario definitions and shared engine changes. |
| Live trading | Not run. The VPS installation remains a prerequisite. |


## Broker-time correction (2026-10-12)

### Cause

- The paused GBPCHF setup reported `invalid_tick` despite changing quotes in the terminal.
- The analysis page reported a broker clock three hours ahead of UTC.
- `tick_spread` compared the broker timestamp directly with UTC and rejected the quote as future data.
- A local reproduction accepted the UTC quote and rejected the same quote with the broker offset.

### Solution

| File | Change |
|---|---|
| `worker_python/src/core/spread_guard.py` | Compare quote ages on the broker time basis after the bot confirms an offset. |
| `worker_python/tests/unit/test_eng_spread_guard.py` | Add broker offsets, age boundaries, account changes, restart, clock changes and order recovery tests. |
| `docs/features/features.yaml` | Add the broker-time checks to ENG-31. |

- Keep UTC-native quotes and browser parity inputs on their existing time basis.
- Confirm a nonzero offset with two advancing timestamps from the same symbol, at least one second apart.
- Require the timestamp progression to match elapsed UTC within two seconds.
- Require calibration quotes within two seconds of the candidate broker clock.
- Keep the confirmed offset for that account and broker during the bot session.
- Do not derive another offset from an old, missing or future quote after confirmation.
- Do not persist clock evidence in the spread learning file.
- Clear clock evidence after an account change or bot restart.
- Preserve the inclusive 60-second quote age limit and the 30-second recovery rule.

### Limits

- Clock calibration assumes the terminal supplies current, advancing quotes rather than a delayed historical stream.
- A single stationary quote cannot confirm a nonzero offset, including a quote exactly one hour old.
- A broker clock change during a bot session blocks entries until a bot restart confirms the new clock.
- Initial clock confirmation can activate the existing invalid-tick lock. Recovery still requires 30 seconds below the threshold.
- The browser backtest already supplies normalized simulation time. Its spread decisions require no clock calibration.
- The real DEMO trading run remains unverified. No orders, bot state or worker settings changed during this correction.

### Verification

- Before the correction: `scripts/features/run.sh unit ENG-31` reported 10 failed and 27 passed.
- After the correction: `scripts/features/run.sh unit` reported 565 passed.
- `scripts/features/run.sh unit ENG-31` reported 42 passed after the tests used the public refresh adapter.
- `scripts/features/run.sh api ENG-31` reported 16 passed.
- `scripts/features/run.sh api` reported 267 passed.
- `E2E_PORT=3328 scripts/features/run.sh e2e ENG-31` reported 13 passed, including all five parity scenarios.
- `scripts/features/run.sh check` accepted all 158 features.
- `pyright --outputjson` reported 31 errors both before and after the correction. The changed Python files have no diagnostics.
- `git diff --check` passed.
- The review followed `hooks/RULES.md` §9: clock domains, account scope, final entry checks, recovery and unchanged API consumers.
- The first mocked browser run failed before test execution because Turbopack rejected an external dependency symlink.
- Copying the installed dependencies into the isolated worktree removed that build obstacle.

### Required live follow-up

- Review and merge this correction through its PR.
- Pull the merged version on the VPS and restart the worker and the relevant bot safely.
- Confirm changing GBPCHF quotes and a valid spread status before the isolated DEMO trading test.
- Preserve the user's GBPCHF configuration and all existing positions, orders and other setups.
- Keep the recurring market-opening automation paused. The market is already open.
