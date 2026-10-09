---
date: 2026-10-09
author: Codex
type: diagnosis
status: open
pr: [137]
features: [BKT-06, ANA-10]
areas: [frontend, worker, ops]
---

# Live backtest requests recover after connection repair

## Request

Record the live request results for the repeated backtest timeout reports after PR #136.

## Cause

The first timeout reports had no captured HTTP status or request duration. They did not prove whether the browser, tunnel, worker, account access, or MT5 caused the failure.

During recovery, ngrok failed while its domain setting was missing and later when an unsupported custom hostname was configured for a Free plan. After the tunnel returned, the worker answered but rejected the saved browser key with HTTP 401. A local request with the Windows user key returned HTTP 200. The frontend connected after the matching key was stored in the browser.

The current settings and clock requests now return HTTP 200 in under 150 ms. The earlier timeout cause remains unproven because no failing request was measured at the time.

## Solution

| Record | Change |
|---|---|
| `docs/features/manual_results.yaml` | Records the completed live checks for BKT-06 and ANA-10 through the feature runner. |
| `docs/features/FEATURES.md` | Regenerated from the manual results. |
| This journal entry | Records the connection diagnosis and current live evidence. |

No application code changed. The current requests are fast, and no application defect was reproduced. A larger timeout would not address the observed connection and key mismatch.

## Verification

| Check | Result |
|---|---|
| `GET /api/settings/{account_id}` | HTTP 200 in 60 ms from the backtest page. |
| `GET /api/market/{account_id}/clock` | HTTP 200 in 148 ms; the page showed Broker UTC+3. |
| ANA-10 date range | “Last year” showed 01.01.25–31.12.25. The custom range 01.09.26–15.09.26 remained after reload. The invalid date 31.02.26 was rejected. |
| BKT-06 live run | A saved setup completed a 30-day backtest and displayed the result. |
| Configuration and trading state | No account, zone, bot, or order state was changed. |

## Open points

- [ ] If a timeout returns, capture its HTTP status and duration with the worker log from the same attempt.

## Lessons

Check the tunnel and key before diagnosing endpoint code. Measure settings and clock requests separately. Do not infer an HTTP result from a timeout message alone.
