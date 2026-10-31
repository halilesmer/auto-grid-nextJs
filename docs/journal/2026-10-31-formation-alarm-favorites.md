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
- Not tested: a real system notification and the click on it, the behaviour of a hidden tab, a real account with about 10 favorites. See the open points.

## Open points
- [ ] In the real browser with the DEMO account and about 10 favorites: the system notification appears, a click on it opens the product and the formation, a hidden tab keeps reporting, and how long one pass takes and whether it blocks the page. A web worker only if this measurement needs one.
- [ ] Known and accepted: `save` in `alarmStore.ts` writes the whole cache, so a tab that was frozen for a long time could overwrite newer state and repeat a notice. Every tab prunes the remembered state with its own favorites list. If the favorites route fails for good (old worker), products with the bell on are not searched either. The abort path (`completed=false`), the Lock takeover, the account id in the tags and the click path of the service worker have no test.
- [ ] iPhone: system notifications work only when the app is installed on the home screen.
- [ ] Telegram (later, not built). The search would run on the VPS with the same TypeScript code, because a Python copy of about 9,750 lines would drift from it. This needs Node.js on the VPS, a bundled script from `scan.ts` and `alarm.ts`, a background task in the worker like `run_watchdog`, the alarm list and the remembered state on the worker, and the bot token only in the VPS environment. Vercel is no place for it, because the worker address and key never lie there. There is no pending list in this repository, so this point stays here.
- [ ] The alarm of one browser is independent of the alarm of another device: each open device reports on its own.
