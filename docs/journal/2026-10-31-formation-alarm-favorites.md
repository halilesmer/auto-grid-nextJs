---
date: 2026-10-31
author: Claude
type: feature
status: open
pr: []
features: [FRM-30, FRM-27]
areas: [frontend, tests]
---

# Formation alarm for all favorites and alarm products, on every page

## Request
- PR C of three (PR A: FRM-28, PR B: FRM-29). Tell Halil when a formation appears in a favorite or in an alarm product, because that is when to trade.
- Halil decided: the message comes in the browser only, with no worker change. Telegram follows later and is not built here.
- Halil approved the design of the bell menu and the messages on 2026-10-31.

## Solution
| File | Change |
|---|---|
| `lib/formation/alarmStore.ts` | The stored settings and the remembered state moved out of `useFormationAlarm.ts` (own commit, no behaviour change). New field `favoritesEnabled` (accounts whose favorites are reported). A `storage` event drops the cache, so a second tab does not overwrite the first. |
| `lib/formation/alarm.ts` | `AlarmNotice` carries `symbol`. |
| `lib/formation/alarmNotify.ts` | Card in the app, system notification through `registration.showNotification` (`tag` = hit key, `data.url` = address), sound. More than three notices in one pass become one summary notice. |
| `FormationScanRunner.tsx` | Searches `favorites ∪ products with the bell on`. After each product it compares the raw hits with the remembered state and collects the notices. At the end of the pass (also an aborted one) it reports them. |
| `store/useFavoritesScanStore.ts` | New `lastRunAt` for the menu. |
| `hooks/useFormationAlarm.ts`, `FormationAlarmMenu.tsx`, `formasyon/page.tsx` | The hook gives settings and status only. The page no longer passes `scan` and `onShow`. The menu has the status line, "All favorites", "Alarm for <product>", the other alarm products, the incomplete products and the banner. |
| `public/service-worker.js` | `notificationclick` focuses an open window and posts the address to it, or opens a new window. The runner listens and calls `router.push`. |
| `docs/features/features.yaml` | FRM-30 new, FRM-27 changed. |

## Why
- Only the tab with the Web Lock searches and compares. It sends the notices over the `BroadcastChannel`, so every open tab shows the card. Only the Lock tab shows the system notification and plays the sound.
- The remembered state of a pass is saved together with the notices at the end of the pass, not per product. If the tab closes in the middle of a pass, nothing is marked as seen that was never reported.
- Products with the bell on are searched with the favorites, but a product that is not a favorite does not appear in the table or in the counts: the page already filters `results` by the favorites list.
- A product without remembered state (the bell was just turned on) is stored silently. Its state is removed when the product leaves the alarm, so turning it on again is silent again. The runner searches such a product at once and does not wait for the next candle.
- The first complete pass after opening reports everything missed as one notice, "Since you last opened the app: N formations". An aborted pass (account change, new clock) does not count as the first one.
- A product with missing candles or an error is not compared and its remembered state stays. It is listed in the menu as incomplete.
- Changed FRM-27 behaviour: the notice no longer comes from the search of the open page. It comes from the app-wide pass (every M15 candle). The first pass after opening is no longer silent for a product that has a remembered state.
- The system notification uses `registration.showNotification` because `new Notification` does not work on Android.

- Codex scan (read only, one round) found four points, all confirmed and fixed: (1) a tab that takes over the Web Lock in the middle of a pass compares the alarm products once again (`comparedHere`), (2) the `BroadcastChannel` closes only after an aborted pass has sent its notices, (3) the final save and the notices of a pass are limited to the products that are still in the alarm, (4) system notification tags carry the account id.

## Verification
- Red first: `symbol` in the notice was `undefined` before the change (direct call of `evaluateAlarm`). With the comparison switched off in the runner, 4 of the 7 `@FRM-30` tests were red (card not found), the others still green by design (menu, incomplete product, two tabs).
- `scripts/features/run.sh FRM` → 1055 passed. `npm run lint`, `npx tsc --noEmit`, `npm run build` → green. Menu checked at 1280 px light and dark and at 375 px.
- The e2e tests stub `registration.showNotification` and the permission, because the service worker is blocked in the test run. The "Since you last opened" count (5) is the number of formations of the fixture at the time NOW.
- The two-tab tests install the mock worker on the second page too. Without it the second tab never searched.
- The e2e tests do not cover a real system notification, the click on it, a hidden tab or a real account. The real browser checks below cover them.

## Open points
- [x] Real browser, DEMO account, 10 favorites (checked on 2026-10-31 and 2026-11-01, built-in browser plus Chrome). Both days had no new candles. The notices were caused by setting remembered hits in `localStorage` (`grid-robot-formation-alarm`, `memory`) to "not valid yet", not by a new candle. See "Real browser check" below. FRM-30 is signed. A notice from a real new candle is not checked.
- [x] After a reload on `/chart` no account was selected, so the scan rested and the alarm was silent, while the menu said that the alarm runs on every page. Fixed on 2026-11-01, see `2026-11-01-formation-alarm-account.md`.
- [ ] The `Broker UTC-31:30` badge is wrong while the market is closed (the toast says that the broker time is not certain). The offset is divisible by 15 minutes, so the M15 slot does not change.
- [ ] Known and accepted: `save` in `alarmStore.ts` writes the whole cache, so a tab that was frozen for a long time could overwrite newer state and repeat a notice. Every tab prunes the remembered state with its own favorites list. If the favorites route fails for good (old worker), products with the bell on are not searched either. The abort path (`completed=false`), the Lock takeover, the account id in the tags and the click path of the service worker have no test.
- [ ] iPhone: system notifications work only when the app is installed on the home screen.
- [ ] Telegram (later, not built). The search would run on the VPS with the same TypeScript code, because a Python copy of about 9,750 lines would drift from it. This needs Node.js on the VPS, a bundled script from `scan.ts` and `alarm.ts`, a background task in the worker like `run_watchdog`, the alarm list and the remembered state on the worker, and the bot token only in the VPS environment. Vercel is no place for it, because the worker address and key never lie there. There is no pending list in this repository, so this point stays here.
- [ ] The alarm of one browser is independent of the alarm of another device: each open device reports on its own.

## Real browser check
Date 2026-10-31 and 2026-11-01, DEMO account, worker on the VPS. The favorites list had 3 products (ASX200, UK100, XAUUSD). It was set to 10 for the test and set back to these 3 on 2026-11-01.

| Point | Result | Evidence |
| --- | --- | --- |
| 1a. Card on another page than `/formasyon` | Passed | Built-in browser on `/chart`: the card "Butterfly Satış · USDJPY · H4 …" appeared at 23:00:14 UTC. Chrome on `/chart`: the card appeared at 23:15:17 UTC. |
| 1b. System notice | Passed | Chrome, 2026-11-01, 07:45:17 UTC: two single notices (USDJPY, EURUSD). `getNotifications()` held them. Halil saw them at the top right of the screen. The notices at 07:27 and 07:30 UTC were held too, but did not show, see "macOS blocks the visible notice". |
| 1c. Card and sound | Passed | Chrome, 2026-11-01, 07:27 UTC: Halil saw the card "Since you last opened" with 2 formations and heard the sound. |
| 2a. Click with an open window | Passed | Chrome, 2026-11-01: after the 07:45 pass the USDJPY notice was gone from `getNotifications()`, and the open tab showed `/formasyon` with USDJPY, Butterfly, H4 and had focus. Halil did not contradict this. The click itself was not reported separately. |
| 2b. Click with no window | Passed | Chrome, 2026-11-01: the app tab was closed, Halil clicked the EURUSD notice. A new tab opened with `/formasyon`, EURUSD, Crab, D1 (reported by Halil). |
| 3. Hidden tab keeps reporting | Passed, built-in browser only | `document.hidden` was true when the card appeared (23:00:14 UTC). Not tried with a minimized Chrome window. |
| 4. Duration and blocking | Passed | Value: 40 candle requests from 23:00:04 to 23:00:14 UTC, about 10 s (network time, 10 favorites). Observation: a `longtask` observer (50 ms threshold) saw no task during the pass. The pure compute time `data-favorites-scan-ms` was not read on `/chart`. FRM-29 measured about 2 s on 10 favorites. Chrome, 2026-11-01: 37 candle requests from 07:45:11 to 07:45:16 UTC, about 5.2 s, no `longtask` entry. |
| 5. Same hit not reported twice | Passed | Built-in browser: after the 23:00 notice, the pass at 23:15 UTC showed no second card. Chrome, 2026-11-01: the pass at 07:30:06 UTC gave no repeated summary, and each pass reported only the hits set back for the test. |

How the notice was caused: the remembered hit USDJPY BUT H4 sell was set to `{valid:false,target:false}`, then a `storage` event was sent to the tab. The next pass reported it. The pass started at about 23:00:04 UTC, not at 23:00:30, because the check runs every 30 s and the new slot was found earlier. On 2026-11-01 the same step was done for USDJPY BUT H4 sell and EURUSD CRB D1 buy.

## macOS blocks the visible notice
- Symptom: at 07:27 and 07:30 UTC Chrome held the notices and the sound played, but no notice showed on the screen.
- Cause: the macOS notification settings of Google Chrome did not allow it. After Halil changed them (allow notifications, banner style "persistent"), the 07:45 notices showed. The change came after the 07:30 pass, so no test ran between the two states.
- Lesson: `getNotifications()` shows that Chrome holds a notice, not that macOS shows it. `permission === 'granted'` does not show it either. The sound comes from the page, so it plays without the macOS permission.
- macOS lists two "Google Chrome" entries. Only one Chrome app is installed. The bundle contains `Google Chrome Helper (Alerts).app`, so the second entry is probably this helper (not proven). Keep both allowed.

## Defect found: switches wait for the browser prompt
- Symptom: in Chrome, a click on "All favorites" or "System notice" changed nothing, and `localStorage` stayed empty, while `Notification.permission` was `default`.
- Cause: `setFavorites` and `setSystem` in `useFormationAlarm.ts` called `await Notification.requestPermission()` before they saved. While the prompt is open (or Chrome hides it), the switch gives no answer.
- Fix: the switch saves first. The permission prompt follows. If it is granted, `system` is set as before. Test `@FRM-30` "speichern sofort": red before (switch stayed off), green after. `@FRM-30` suite: 9 passed. Lint: clean.
- Test setup note: `e2e` uses port 3100 by default. If another process holds it, set `E2E_PORT`.
