---
date: 2026-11-08
author: Claude
type: change
status: open
pr: []
features: [NWS-02]
areas: [frontend, worker, tests]
---

# News card: button and card in the header (plan 1107-A16 S2)

## Request
Step S2 of plan 1107-A16: the user interface of the news card. The worker part (S1, NWS-01) is in `main`. The design is the approved Artifact, version 9.

## What the change does
- `NewsButton` sits in `AppNav`, before the header menu. It is hidden on `/vps` and `/users`.
- The card is a popover with three filters (impact, day, currency) and a list. `useNewsStore` is the single source. It polls `GET /api/news/events` every 60 seconds.
- The row shows local time, currency, impact bars, an arrow, the time left, the title and `ACT / CONS / PREV`.
- The arrow before the release comes from `forecast_direction` (faded). After the release it comes from `impact_type` (full colour). The tooltip gives the figures and, for known sectors, a "usually" comment.
- Test: `worker_python/tests/api/test_ui_prefs_api.py` (round trip, ownership, key and size limits) and `e2e/mocked/news-card.spec.ts` (`@NWS-02`), with a fixed clock and events relative to it (`e2e/fixtures/news.ts`).

## Decisions
- **Filter storage is the worker, the browser is the backup** (decision 1107-A16.8). The first version of this step kept the filter only in `localStorage`, because `ui_state.py` accepts only numeric keys with a text state (zone states). The project owner then decided: the filter lives on the worker, per account, so it moves from the Mac to the phone. The new route module `ui_prefs.py` stores one JSON object per key: `GET /api/ui-prefs/{account_id}` and `PUT /api/ui-prefs/{account_id}/{key}`, file `data/ui_prefs_<account_id>.json`. Both routes use `account_access`. The key must match `^[a-z0-9_-]{1,40}$`. The value must be an object of at most 8 KB without `NaN`. A file holds at most 20 keys and 64 KB. A lock and a temporary file with `os.replace` keep two keys from overwriting each other. The store shows the browser copy first, then the worker value. A late answer does not replace a newer choice. The write follows 400 ms after the last change. The "saved" badge shows after the worker accepts the value. If the worker fails, or no account is selected, the badge reads "only in this browser".
- **Default currencies** come from the symbols of the zones of the selected account (`currenciesFromSymbols`: `XAUUSD` gives `USD`, `EURJPY` gives `EUR` and `JPY`). The list is `USD EUR GBP JPY AUD NZD CAD CHF CNY`. Without zones, all currencies are used. `NewsButton` loads the settings of the account itself (`useAccountSettings`, `ifMissing`), because the button also shows on pages that do not load them.
- **Arrow direction is the "good for the economy" direction.** The worker already turns the forecast direction for inverse indicators (unemployment). The arrow and the sector comment therefore need no list of inverse indicators in the frontend.
- **Titles are not translated** (decision 1107-A16.7). The page language is sent as `lang`.
- **Time modes:** `date` shows "all day". `tentative` and `notime` show "time not set".
- **Unclear parts of the design:** the week is Monday to Sunday of the current local week. The value is formatted with at most three decimals, then the multiplier letter (`K M B T`), then `%` for the unit `percent`. The label of the consensus column is `CONS` (English), `Bekl.` (Turkish), `PROG.` (German).

## Open points
- [x] Decision: store the filter in the worker. Done with `ui_prefs.py` (decision 1107-A16.8).
- [ ] S3: the notification (30 minutes, path of FRM-30). The row in the card is passive.
- [ ] Visual check in the browser after the merge (project owner). The real `unit`, `multiplier` and `sector` values from the VPS are not yet seen in the card; the code expects `percent`, `thousands..trillions` and the MT5 sector names in lower case.
- [ ] Not done (review, low risk): the request body is read in full before the size check. Other routes have the same limit. A body limit for all routes would be a separate change.
