---
date: 2026-11-08
author: Claude
type: fix
status: done
pr: []
features: [SYS-13, SYS-12]
areas: [frontend]
---

# crypto.randomUUID crashes pages over LAN http

## Request
A phone opened the dev server over plain http in the local network. After the user selected an account, the page crashed with `crypto.randomUUID is not a function`.

## Cause
`crypto.randomUUID` exists only in secure contexts (https, localhost). Over http on a LAN address it is undefined. `crypto.getRandomValues` works in every context. The crash path: select account, `indicatorStorage` normalizes stored indicators, `newIndicator` calls `crypto.randomUUID`. Vercel (https) and localhost were not affected, so the defect appeared only in phone tests (SYS-12).

## Solution
| File | Change |
|---|---|
| `src/lib/randomId.ts` | New `randomId()`. It uses `crypto.randomUUID` when it exists. Otherwise it builds an RFC 4122 v4 UUID from `crypto.getRandomValues`. |
| 11 files in `src/` | All 16 calls of `crypto.randomUUID()` now call `randomId()`. The ID format did not change. |
| `eslint.config.mjs` | `no-restricted-properties` forbids `crypto.randomUUID` in `src/`. `randomId.ts` has the only exception, with a reason. |
| `e2e/mocked/insecure-context.spec.ts` | Tests with `crypto.randomUUID` removed: dashboard, "Setup Ekle" and `/chart` show no page error. A unit test checks the UUID v4 format. |

## Why
`Math.random` was rejected: stored IDs (localStorage, zone `id`, backtest `requestId`) must stay unpredictable and keep the same format. A lint rule keeps the defect from coming back.

## Verification
The page tests failed before the change and pass after it. A short lint probe with `crypto.randomUUID()` in `src/` gave an error; the probe was removed.

## Lessons
Test browser APIs without secure-context support in the LAN setup. Use `randomId()` for new IDs.
