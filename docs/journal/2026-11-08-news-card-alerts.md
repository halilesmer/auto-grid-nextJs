---
date: 2026-11-08
author: Claude
type: change
status: open
pr: []
features: [NWS-03, NWS-02]
areas: [frontend, tests]
---

# News card: alerts before the release (plan 1107-A16 S3)

## Request
Step S3 of plan 1107-A16. The row at the bottom of the news card was a placeholder. Decision 1107-A16.9 (project owner, 2026-11-08): a small settings button, the user sets the minutes, at least two alerts, one or both can be on. The design is the Artifact "Haber Uyarı Satırı" (approved 2026-11-08).

## What the change does
- `NewsAlerts` (card footer): a summary ("1 sa · 30 dk önce" or "Kapalı") and a gear. The gear opens a panel with two alerts. Each has a switch and a minutes field (whole number 1 to 1440; an invalid value shows an error and is not saved). Default 60 and 30 minutes, both off.
- Storage as in A16.8: per account on the worker (`PUT /api/ui-prefs/{id}/news_alerts`, no worker change), copy in the browser. `useNewsStore` loads filter and alerts with one `GET /api/ui-prefs/{id}`.
- `NewsAlertRunner` (in `layout.tsx`, runs on every page): loads filter and alerts, reads the coming news (next 24 h and 5 min, independent of the day filter, same impact and currencies as the card) every 60 s, and sets one timer per news item and active alert at the exact time. Only the tab that holds the Web Lock `grid-news-alerts:<account>` notifies.
- Which news: `time_mode` = datetime and not yet released. All-day and untimed news give no alert.
- Late open: when the alert time is past but the news is not, the alert comes once at once ("12 dk sonra"). When more than one alert time of the same news is past, only the smallest minutes value shows; the others count as shown.
- No repeat: key `value_id@time#minutes` in `localStorage` (`grid-robot-news-alerts-shown`), entries older than 1 hour after the news are removed. Two alerts with the same minutes give one notification.
- Path as FRM-30: `animated-toast` card and, with permission, `showSystem` of `alarmNotify.ts` (now exported; tag = key, `data.url` = `/?news=<id>`). A click opens `/?news=<id>`. `NewsAlertRunner` reads the parameter, asks the store to open the card (`focusRequest`) and removes the parameter. The row is marked, also when the day filter hides it (the card adds the news from `alertEvents`).
- Permission: asked when the user first turns an alert on (the switch is saved first, as in FRM-30). The panel tells when it is denied or not supported. The card in the app still comes.
- Fix (item 6 of the brief): `/api/news/events` was asked three times after an account change (first with all currencies, then twice with the symbol currencies). Now: the request waits until the accounts are loaded and one is selected, the effect depends on the filter value (not the object), the store keeps the filter object when the worker value is the same, and a 700 ms wait lets the currencies from the settings arrive first. `loadFilter` moved from `NewsButton` to `NewsAlertRunner`; `useNewsCurrencies` is the shared source.

## Tests
- `e2e/mocked/news-alerts.spec.ts` (`@NWS-03`, 8 tests, fixed clock, `page.clock.runFor`): defaults and worker save, field limits, late open (one alert, no repeat after reload), exact timers (15 and 1 minute), permission denied, permission asked on first switch, "show news" click, one request on page open.
- `@NWS-02`: 12 tests still green.

## Open points
- [ ] Real browser check on the VPS and on the phone: system notification and tap (NWS-03 manual part).
- [ ] The wait of 700 ms is a guess. On a slow link to the worker the settings can arrive later and one more request goes out. A clean fix needs a "settings are loading" flag in the settings store.
- [ ] Background tabs: browsers slow timers of hidden tabs (Chrome: about once a minute after 5 minutes hidden). An alert can come up to a minute late; the minute poll and the late rule keep it from being lost.
- [ ] Not tested: the click on the system notification (service worker is blocked in the e2e run), and two tabs (as FRM-30).
