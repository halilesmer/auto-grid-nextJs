---
date: 2026-11-01
author: Claude
type: feature
status: open
pr: []
features: [FRM-32, FRM-30]
areas: [frontend, tests]
---

# Alert history in the formation alarm menu

## Request
- The user wants to look back later: which formations the alarm reported, and what the notice said.
- The card closes after 10 s and the alarm keeps no list. The `memory` field only stores what was already reported.
- The user approved the design (history as a second tab in the bell menu) on 2026-11-01.

## Solution
| File | Change |
|---|---|
| `lib/formation/alarmHistory.ts` | New. One entry per hit (time, product, formation, timeframe, side, events, batch). Newest first, at most 100 per account. `withoutHistory` clears one account. `parseHistory` drops invalid entries. |
| `lib/formation/alarmStore.ts` | New optional field `history` (per account). `parse` is now exported as `parseStored`. A stored state without `history` stays readable. |
| `lib/formation/alarmNotify.ts` | `batchOf` names how a pass is shown: `single`, `many` (more than 3) or `since` ("Since last opening"). `announce` uses it. |
| `FormationScanRunner.tsx` | `flushAlarm` writes the entries and the remembered state in one `save`. It runs in the tab with the Web Lock only. |
| `hooks/useFormationAlarm.ts`, `FormationAlarmMenu.tsx` | Tabs "Settings" and "History". Group header for a summary notice, empty state, "Clear history", click opens the formation on `/formasyon`. |
| `i18n/messages/formation.ts`, `hints.ts` | New texts in tr, en and de, with hints. |
| `docs/features/features.yaml` | FRM-32 new. |

## Why
- An entry per hit, even for a summary notice: the summary shows only a count, and the hits are what the user looks for.
- The entry is written when the alarm reports, not when a system notice or a sound happens. Both channels are optional.
- Other tabs do not write. They read the entry through the `storage` event, which already refreshes the cache.
- `history` is separate from `memory`. Clearing the list must not change what is remembered, or the same formation would be reported twice. The test "Verlauf löschen" checks this.
- Rejected: a separate page or a list on the card. The user asked for a small card in the bell menu.

## Open points
- The bell exists on `/formasyon` only (`actions` of the page header). The alarm runs on every page, but the history is visible on that page only. A bell in the global navigation is a separate step.
- [x] Fixed 2026-11-02 (below `lg` the top bar is `z-[70]` while the bell menu is open (`has-[…formation-alarm-panel]`), so the menu lies over the sidebar; a bar that is always `z-[70]` hid the sidebar tabs, test `@FRM-30` "verdeckt die Kopfleiste" checks this; test `@FRM-30` "375 px … über der Favoriten-Seitenleiste" waits for `data-favorites-scan-ms`). Known, not caused by this change: at 375 px the favorites sidebar covers the right 30 px of the bell menu. This also affects the "Settings" tab. A test that measures the menu width must wait until the toolbar is ready (`data-favorites-scan-ms`), because the menu aligns itself to the bell when it opens.
- Known, from the review, not fixed: `save` writes the whole object from the cache of the tab. A tab that was frozen and missed the `storage` event can overwrite a newer `history` or `memory` with the old state on its next change. This was already true for `memory`. A fix (re-read before each write) changes the store for all settings and is a separate step.
- [x] Known, from the review: the size of a group header counts the entries still in the list. After the cap of 100 cuts the end of an old group, the header shows the smaller number. Decided 2026-11-02: keep. The header counts the entries that are visible below it. After the cap, the oldest group shows fewer entries, and the number agrees with the list. Test `@FRM-32` "Nach der Kappung" checks this.
- Real browser test with a real alert: open.

## Verification
- Red first: with the cap removed and the history writer switched off, 4 of the 12 `@FRM-32` tests were red (the cap test and 3 page tests; a fifth red test was the width race described above). Restored, all green.
- `@FRM-32` suite: 12 passed (5 library, 7 page). Lint and `tsc --noEmit`: clean.
