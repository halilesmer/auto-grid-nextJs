---
date: 2026-10-11
author: Codex
type: feature
status: done
pr: []
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
| Live trading | Not verified. The user did not authorize a live DEMO trading test. No worker ran on the Mac. |

## Lessons

- Keep initial learning separate from the lock that blocks entries. A manual startup reference must not stop initial learning.
- Expired learning history must not remove a stored entry lock or prevent a new learning round.
- Test spread changes between broker validation and submission. A check at the start of a loop cannot cover that interval.
