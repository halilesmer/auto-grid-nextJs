---
date: 2026-10-09
author: Codex
type: diagnosis
status: open
pr: []
features: [BKT-06, ANA-10]
areas: [frontend, worker, ops]
---

# Live backtest data requests time out

## Request

Record the errors observed during repeated live backtest checks after PR #136.

## Cause

| Observation | Evidence |
|---|---|
| Saved setup settings do not load | After selecting DEMO account A on /backtest, the UI reports a timeout for loading setups. The page uses GET /api/settings/{account_id}. |
| Broker clock does not load | The UI reports a timeout for the broker clock, GET /api/market/{account_id}/clock. It states that relative dates temporarily use UTC. |
| Backtest cannot start | No saved setup is available; a complete live run was not performed. |
| Account list can load | The last retry initially showed no accounts. After a full reload, the existing DEMO accounts appeared; selecting the designated test account still produced both timeouts. |
| Worker responds to a separate health check | The local VPS status route reported v0.7.182, listening and reachable. This does not prove that the affected requests completed. |
| Preset read worked in an earlier check | The new preset library showed an empty list without an API error after deployment. |

The root cause is unknown. The observations do not establish whether the failure is in the browser,
tunnel/network, account-scoped API handling, or MT5 access. No HTTP status or timeout duration was
established for the failing requests. The inspected recent worker console log yielded no matching
settings/clock access records; this is not proof that the requests never reached the worker.

## Solution

| Record | Change |
|---|---|
| This journal entry | Keeps the observed failures and the limits of the diagnosis. |
| docs/features/manual_results.yaml | Records failed live checks for BKT-06 and ANA-10 through the feature runner. |
| docs/features/FEATURES.md | Regenerated from the recorded results; mocked test success does not replace the failed live observation. |

## Verification

| Check | Result |
|---|---|
| Repeated local-browser checks against the deployed worker | Both errors reproduced after selecting DEMO account A, including a full page reload. |
| Live backtest execution | Not verified; setup loading blocked the run. |
| Configuration/trading writes | None. No account, zone, order or bot state was changed during these checks. |
| Automated regression | No deterministic reproduction yet; no xfail added for an unproven code defect. |

## Open points

- [ ] Capture sanitized timing and HTTP outcomes of the settings and clock requests during a failing attempt.
- [ ] Isolate the cause and implement a fix if it is in the application.
- [ ] Repeat the complete live backtest on the designated DEMO account and update both manual results.
