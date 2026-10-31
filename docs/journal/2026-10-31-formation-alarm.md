---
date: 2026-10-31
author: Claude
type: feature
status: open
pr: [250]
features: [FRM-27]
areas: [frontend, tests]
---

# Formation page gets an alarm

## Request
- Add an alarm to `/formasyon`. It must tell the user when a formation becomes valid or reaches its target point.
- Halil decided: the alarm runs only while the page is open. The worker does not change.

## Solution
| File | Change |
|---|---|
| `lib/formation/alarm.ts` | Pure function. Compares a search run with the stored state and returns the notices. |
| `hooks/useFormationAlarm.ts` | Stores the settings in `localStorage`, runs the comparison after each finished search, shows the notices. |
| `FormationAlarmMenu.tsx` | Bell button with menu after the camera button. |
| `page.tsx` | Connects the button. The bar container goes from `z-30` to `z-50`. |

## Why
The alarm uses the search that already runs in the browser. It needs no worker code, no account data and no order.

An event is a change between two runs, not a state. Two events exist: the verdict becomes `valid`, and the last point (D, or H2 for double top/bottom) appears. If both happen in one run, the user gets one notice.

A formation has a key made from symbol, formation, timeframe, side and the times of its points without the last point. The last point comes later, so it must not change the key. The stored state per key says: was valid, target seen. This state only goes from false to true. A formation that flickers does not notify again.

The first run after you turn the alarm on, open the page or change the symbol only stores the state. A reload therefore does not repeat old notices. Deselected events and formations are stored in the same way, so turning them on later does not report old results.

More than three notices in one run become one summary notice. The state holds at most 200 keys per symbol.

The menu panel was hidden by the conditions card, because the bar container had a lower layer than the card. The container now has `z-50`.

## Verification
- `e2e/mocked/formation-alarm-lib.spec.ts`: red before `alarm.ts` existed (module not found), 8 passed after.
- `e2e/mocked/formation-page.spec.ts -g FRM-27`: 5 passed. The first run of the notice test failed because the page showed a summary notice for five hits. The test now restricts the alarm to one formation for the single notice and has its own test for the summary.
- Not tested: system notification and sound in a real browser, the behaviour of a hidden tab (browsers slow down the 60 s reload of candles there), a real account on the VPS.

## Open points
- [ ] The notice has no "Show" button, because the toast component has no action. The notice names formation, symbol and timeframe.
- [ ] Replay tool: assess after this PR.
