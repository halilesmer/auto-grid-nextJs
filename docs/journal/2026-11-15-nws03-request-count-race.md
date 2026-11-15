---
date: 2026-11-15
author: Claude
type: fix
status: open
pr: []
features: [NWS-03]
areas: [news, e2e]
---

# NWS-03 "one news request" test: wall-clock race (main red since 2026-11-15)

## Request
`news-alerts.spec.ts` "Haber kartı isteği: hesap açılışında /news/events bir kez istenir" failed on `main` (commit `2349a1f3`, PR 557) and on later PR branches: 1 request expected, 2 or 3 received, also on retry.

## Root cause
The test, not the product code. `NewsButton` sends the first request `SETTLE_MS = 700` ms after the accounts are loaded. While no account is selected, this request asks for all currencies. That is the intended behavior (the alert runner and the test "Hesap seçili değil" depend on it). The test selects the account by a click (`dashboard.open`). Under load the click came 1.8–3.5 s after the page start, so the first request (all currencies) went out before it, and the USD request followed after the settings loaded.

Time trace (6 parallel workers, ms after page start; kept with the session notes): `/accounts` 690–1090, `/news/events` (all currencies) 1450–2020, `POST import-account` + `GET /settings` 1820–3530, second `/news/events` (USD) 3430–5280.

## PR 557 share: none
Same load on the same machine (12 repeats, 6 workers, `--retries=0`):

| Code | Test red |
|---|---|
| `main` `698e3e82` as it is | 12 of 12 |
| same, `DockProvider.tsx` reset to `ec6ecbc8` | 11 of 12 |

PR 557 only changed `DockProvider.tsx` (and two dock tests). The failure does not depend on it. The test sits on a timing edge; a slower runner or a different test split makes it visible.

## Solution
Product code unchanged. A product fix was tried (wait until the settings of the selected account have loaded) and had no effect, because the account is not selected yet when the first request goes out; it was discarded.
Test (change approved by Halil, 2026-11-15): the page clock is paused before the page opens (`page.clock.pauseAt`), the account is selected, then `page.clock.runFor(1500)` lets the 700 ms wait run. The assertion is the same: exactly one request, with `currencies=USD`. No longer wait, no retry, no weaker assertion.

## Verification
Same load (12 repeats, 6 workers): before 12 of 12 red, after 12 of 12 green. Whole `news*` specs and `precheck.sh`: see the pull request.

## Open points
`NewsAlertRunner.tsx` has the same `SETTLE_MS = 700` pattern. No test counts its requests by wall-clock; nothing changed there.
