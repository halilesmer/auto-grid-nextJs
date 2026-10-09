---
date: 2026-10-08
author: Codex
type: feature
status: done
pr: [136]
features: [BKT-11, BKT-12]
areas: [worker, frontend, docs]
---

# Save presets and transfer zone drafts

## Request

Continue with B8 after B7. Preserve the user's instruction not to add or run tests.
The transfer must remain an unsaved dashboard change; new zones must be inactive.

## Solution

| File | Change |
|---|---|
| `worker_python/src/api/backtest_presets.py` | Authenticated owner-scoped CRUD, validated configuration payload, 100-preset cap, UUID creation idempotency. |
| `worker_python/src/api/__init__.py` | Registers the preset router. |
| `worker_python/src/utils/market_db.py` | Migration 3 adds backtest_presets and the owner index. |
| `frontend_nextjs/src/lib/backtest/presets.ts` | Sanitizes zone fields and parses versioned presets; creates fresh local setup IDs. |
| `frontend_nextjs/src/lib/backtest/runSettings.ts` | Shared non-React run settings schema and defaults. |
| `frontend_nextjs/src/services/backtestPresetApi.ts` | Uses axiosInstance for scoped preset requests with timeouts. |
| `frontend_nextjs/src/components/backtest/PresetPanel.tsx` | Save, load, rename, confirm deletion, and start transfer; retains request ID after a failed create. |
| `frontend_nextjs/src/components/backtest/TransferDialog.tsx` | Reads target settings and symbol details, selects replacement/new zone, and shows normalized lots. |
| `frontend_nextjs/src/store/useZoneTransferStore.ts` | One-shot sessionStorage handoff, no credentials or results. |
| `frontend_nextjs/src/hooks/useZoneTransfer.ts` | Validates session, waits for the saved baseline, applies a draft once. |
| `frontend_nextjs/src/app/page.tsx` | Shows the unsaved transfer notice, including the running-bot warning. |
| `frontend_nextjs/src/hooks/useZoneDirtyTracking.ts` | Captures an empty saved zone list before applying the first transferred zone. |
| `frontend_nextjs/src/components/backtest/BacktestView.tsx`, `SetupCards.tsx` | Preset/transfer entry points; avoids source URL account selection undoing a transfer. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | Mirrors preset endpoints for the existing mock environment. No tests added or executed. |
| `frontend_nextjs/src/i18n/messages/backtest.ts`, `hints.ts` | Turkish, English, and German text and hints. |

## Why

Presets belong to the authenticated user rather than an account. The server derives owner from the principal;
even administrators cannot list or modify another user's presets. Foreign IDs return 404. SQL uses bound parameters.
Synchronous endpoints let FastAPI run SQLite work in its thread pool. Creation checks the cap and inserts in the
same write transaction. Retrying the same UUID and content returns the original preset; changed content returns 409.

Payload version 1 stores parameters, costs/model, timeframe, range, and app version. The zone whitelist removes
id, magic, is_active and obsolete fractal sub-setup/sid fields. CSV import IDs and run results are omitted.
A loaded preset becomes a fresh local setup; it does not write account settings.

Transfer previews use read-only requests to an accessible target account. The session handoff is bound to user
and worker address and expires after five minutes. Invalid storage is ignored; expired or mismatched handoffs
are discarded. Target settings are loaded afresh even for the current account before the saved baseline is captured.
Only then is the pending transfer consumed and applied. An empty saved zone list must also count as a baseline,
otherwise adding its first transferred zone could incorrectly look saved.

Replacement retains id, magic and is_active, including an undefined activation value. A new zone gets a fresh ID
and is inactive. Lots follow target symbol limits; the preview displays normalization. The dashboard also checks
that a replacement still exists and still has the same symbol. No transfer calls a settings save endpoint.

The source URL must not reselect the old account while navigation to the dashboard is in progress. A pending
transfer prevents that effect. Consuming the transfer before changing zones prevents duplicate application.

The B7 equity colours now use theme tokens, resolved to actual CSS values before passing them to lightweight-charts.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` in frontend_nextjs | Passed, exit 0. |
| `npm run lint` in frontend_nextjs | Passed, exit 0. |
| Pyright on the three changed worker files | Passed, 0 errors and 0 warnings. |
| Python AST parsing of the three changed worker files | Passed. No worker process started. |
| `git diff --check` | Passed. |
| Manual review against hooks/RULES.md §9 | Owner enforcement, parameterized SQL, idempotency, stale-response guards, session boundaries, and no automatic settings writes inspected. |
| Tests | Not added or run at the user's request. The mock fixture was extended only. |
| Browser, layout, real database migration and live worker | Not verified at runtime. No VPS access or deployment. |

The new preset endpoints require the updated worker and migration; this change does not deploy them.

## Follow-up authorization (2026-10-09)

The user requested tests, merge, and deployment. This supersedes the earlier no-tests instruction.
Verification and CI fixes are recorded in `2026-10-09-backtest-b7-b8-verification.md`.
