---
date: 2026-10-17
author: Claude
type: plan
status: open
pr: [189, 190, 191]
features: [UI-01, UI-02, UI-05, UI-08, UI-09, SYS-09, UPD-01, UPD-03, ACC-07, USR-03, MET-01, ZON-13, ZON-20]
areas: [frontend, tests]
---

# Dashboard UI redesign: plan and session list

## Request

| Item | Requirement |
|---|---|
| Goal | Shorter texts, one header row, a fixed control bar, a compact metrics row and a new symbol card. |
| Scope | 8 wishes (W1–W8) and 4 proposals (V1–V4). |
| Delivery | 6 sessions. Each session has its own worktree and its own PR. |
| Merge | The project owner approves each merge. |

This entry is the task list. Each session updates its row in "Status" and the open points.

## Cause

| Finding | Cause |
|---|---|
| The control bar does not stay fixed | `page.tsx` has `lg:sticky lg:top-16` (64 px). |
| | The navigation has two rows and is about 113 px high (`AppNav.tsx`, z-50). |
| | The navigation covers the bar. |

A one-row navigation (W4) fixes the offset. W3 comes after W4 for this reason.

## Solution

**Wishes**

| # | Wish | Plan | Main files | Tests and catalog |
|---|---|---|---|---|
| W1 | "TEST" becomes "DEMO" | Rename key `dashboard.env.test` to `dashboard.env.demo`. Value `DEMO` in tr, en, de. | `i18n/messages/dashboard.ts`, `app/page.tsx` | `accounts.spec.ts`, `readonly.spec.ts`; ACC-07, UI-09 text |
| W2 | "Administrator" becomes "Admin" | `auth.role.admin` is `Admin` in en and de. tr stays "Yönetici". S1 also changed `users.owner.none` and its hint. Other "Administrator" texts (page title, connection placeholder, hints) stay. They name the key or the page, not the role label. | `i18n/messages/users.ts` | `users.spec.ts` follows through `msg()` |
| W3 | The bar from "DEMO" stays at the top while the user scrolls, at every width | Fixed navigation height (for example `h-14`). Bar `sticky top-14` without the `lg:` limit. Each dropdown opens as an overlay above the bar and the content. The bar never moves. Panels are `absolute`. Stack: navigation z-50, bar z-20, panel z-30. At 375 px the bar has one compact row: DEMO, account, status and start. Interval and "add symbol" move into the ⋯ menu. | `app/page.tsx`, `layout/AppNav.tsx`, `BotControls.tsx`, `SettingsForm.tsx` | `control-bar.spec.ts` (UI-09): scroll at 1440 and 375 px, the bar sits below the navigation. Open each dropdown, the bar position stays and the panel covers it. |
| W4 | The menu moves into the logo row. The bar stays fixed. | One row: logo, links, menu on the right. Below `lg` the width is not enough. Choose the mobile variant in the session with a draft. | `layout/AppNav.tsx` | `navigation-layout.spec.ts`, `mobile-layout.spec.ts` (UI-01, UI-08). The text "own row" changes. |
| W5 | Connection, language and night mode in one dropdown | New header menu on `ui/dropdown-menu.tsx`. The trigger always shows the connection dot. On a fault it also shows text. The panel has: connection (host, status, "change connection" calls `useConnectionDialogStore.show()`), language, theme. | new `layout/HeaderMenu.tsx`; `connection/ConnectionChip.tsx`, `layout/LanguageSwitcher.tsx`, `layout/ThemeToggle.tsx` | `connection.spec.ts`, `language.spec.ts`, UI-02, UI-05, UI-07 (`tooltips.spec.ts`) |
| W6 | Lower metrics row, texts side by side | One row per tile: icon, label with (i), value on the right. Static footer texts move into the hint. The engine status stays visible. | `dashboard/MetricsStrip.tsx` | `bot-metrics.spec.ts` (MET-01). The `metric-*` test IDs and `data-value` stay. |
| W7 | "Add symbol" moves into the account row | Button in the control bar, next to the ⋯ account menu. Lift `addSymbolOpen` to `page.tsx` and pass it as a prop to `ZoneSettingsPanel`. No new store. Keep the lock `isRunning && !mt5_connected` and the hints `zone.panel.add(.off).hint`. | `app/page.tsx`, `ZoneSettingsPanel.tsx` | `symbol-cards.spec.ts`, `zones.spec.ts`, `control-bar.spec.ts` (ZON-20, UI-09) |
| W8 | New symbol card, optional in two parts, fields below each other | The session starts with 2–3 drafts as images. A: two columns from `lg`, entry on the left, protection and exit on the right, fields as label and value rows. B: header strip and setup tabs. The project owner chooses. Then build. | `zone/SymbolCard.tsx`, `ZoneCard.tsx`, `ZoneHeader.tsx`, `ZoneFieldsEditor.tsx`, `Zone*Fields.tsx` | `setup-layout.spec.ts`, `fractal-distance-layout.spec.ts`, `symbol-cards.spec.ts` (ZON-13, ZON-20, UI-08) |

Notes for W8:

- `ZoneFieldsEditor` is also used on `/backtest` (`backtest/SetupEditor.tsx`). The new layout applies there too.
- The decision in `2026-10-11-grid-distance-loss-layout.md` stays. Grid distance, preview and loss switch form one group.
- Agree each layout test with a changed expectation with the project owner before the change.

**Proposals**

| # | Proposal | Plan | Session |
|---|---|---|---|
| V1 | Collapsible symbol cards | The header row summarizes the card: symbol, setups, price, market, status, profit and loss. A click opens the card. The state per symbol is in `localStorage`. Wrap each access in try/catch. Without storage all cards are open. | S6 (W8) |
| V2 | Compact metrics fixed too | The metrics row sits directly below the control bar in the fixed area. A pin button (with `hint`, i18n) switches the fixing on and off. The choice is in `localStorage`. The default is pinned. | S3 (W3 + W6) |
| V3 | "Save all" in the fixed bar | The hint "n unsaved · Save" shows only when `isDirty`. It uses `handleSaveAll` and `isDirty` from `useDashboard`. `SaveSettingsBar` in the zone header stays or goes. Decide in S3. | S3 (W3) |
| V4 | System menu in the header menu | A "System" part in the header menu: system info, check for updates (admin only), shut down. `UpdateModal`, the shutdown `ConfirmModal` and the handlers from `useDashboard` move with it. They then work on every page. The ⚙ in the control bar goes. | S2 (W5) |

**S2 result (W4, W5, V4)**

| Item | Result |
|---|---|
| Mobile variant | B. Below `lg` the header shows the logo, the header menu and a ☰ button. ☰ opens the page links as an overlay panel. The project owner chose B from three drafts (A: icons only, C: links in a second row). |
| Navigation height | 56 px at every width. The CSS variable `--nav-height: 3.5rem` is in `globals.css` (`:root`). `AppNav` uses `h-(--nav-height)`. The control bar uses `lg:top-(--nav-height)`. S3 uses the same variable for `top-…` at every width. |
| Header menu | New `layout/HeaderMenu.tsx`. The trigger keeps the test ID `connection-chip` and `data-status`. It always shows the connection dot. On a fault it also shows the status as text. When connected, it shows the host from `xl`. The panel has four parts: connection, language, theme, system. |
| System part (V4) | System info, "check for updates" (admin only, as before) and shut down. The update and shutdown state and handlers moved from `useDashboard` to the new hook `hooks/useSystemActions.ts`. `UpdateModal` and the shutdown `ConfirmModal` are in `HeaderMenu`, so they work on every page. Shut down stops the bot of the selected account (`POST /stop`) and calls `window.close()`. Every role can do this, as before. The worker checks the account access. Because the menu is now on every page, the review found two gaps: the texts said "all bots", and on a page without a selected account the action only closed the window. Now the texts name the selected account, the confirmation shows the account name and LIVE or DEMO (ui-design §6), and without a selected account the item is disabled with the reason in its hint. The automatic update check on the dashboard (`setUpdateInfo`) stays in `useDashboard`. |
| Trigger width | Between `lg` and `xl` the trigger is at most 9rem wide, and a long fault text is cut. On the CI runner (Linux fonts) the Turkish text "API anahtarı geçersiz" overlapped the last link by 6 px at 1024 px. On the Mac the test passed. |
| Removed | `connection/ConnectionChip.tsx`, the mobile status row, the language and theme cycle buttons, the ⚙ menu in the control bar. Unused i18n keys were removed. |

**S2: test expectations that changed because of the new layout**

| Test | Before | Now |
|---|---|---|
| `navigation-layout.spec.ts` (UI-08) | All link labels visible in the header at 375–1440 px | Below 1024 px the labels are visible in the ☰ panel |
| `logs-ui.spec.ts` "Header scrollt nicht horizontal" (UI-01) | VPS link visible in the header at 375 px | VPS link visible in the ☰ panel |
| `logs-ui.spec.ts` theme tests (UI-02) | Radio group in the header; at 375 px one cycle button | Radio group in the header menu at every width |
| `language.spec.ts` (UI-05) | Switcher in the header; at 375 px one cycle button | Radio group in the header menu at every width |
| `connection.spec.ts` (SYS-07, SYS-09) | A click on the chip opens the dialog; at 375 px a status row below the header | The trigger opens the menu, "change connection" opens the dialog; at 375 px the status is in the trigger, the host is in the menu |
| `control-bar.spec.ts` (UI-09) | ⚙ system menu in the bar | No ⚙ in the bar; the header menu trigger is in the viewport at 375 px |
| `system.spec.ts`, `users.spec.ts`, `tooltips.spec.ts`, `mobile-layout.spec.ts`, `csv-import.spec.ts` | Open the ⚙ menu, the chip or the header links | Open the header menu or the ☰ panel first (`e2e/fixtures/header.ts`) |

New: `header-menu.spec.ts` (UI-01): one row of 56 px, ☰ below `lg`, menu content, the menu stays open after a choice, Escape, the panel covers the bar and does not move it, the panel fits at 375 px, update check and shut down on `/chart`, shut down disabled without an account, the longest fault text at 1024 px does not overlap the links. `tooltips.spec.ts` (UI-07) also checks the ☰ panel and the header menu at 375 px. `control-bar.spec.ts` (UI-09) now checks that the bar starts at the lower edge of the navigation (before: a range of 56–80 px).

**S3 result (W3, V2, V3)**

| Item | Result |
|---|---|
| Fixed area | New `div` `sticky-area` in `page.tsx`: `sticky top-(--nav-height) z-20` at every width. It holds the control bar and, when pinned, `MetricsStrip`. The bar `Card` has `z-10` inside it, so dropdown panels (absolute, z-50 in the combobox, z-30 in `DropdownMenu`) stay above the metrics. The bar starts at the lower edge of the navigation. |
| Pin button (V2) | Button with `data-testid="metrics-pin"` and `aria-pressed` at the right end of the bar. It has `hint` and i18n (`metrics.pin`, `metrics.unpin` and both `.hint` keys, tr, en, de). Hook `hooks/usePinnedMetrics.ts` stores the choice in `localStorage` (`grid-robot-metrics-pinned`) with `useSyncExternalStore`. Each access is in try/catch. Default: pinned. Unpinned: `MetricsStrip` scrolls with the page, the bar stays fixed. |
| Save hint (V3) | `bar-unsaved` in the bar shows "Unsaved" and a Save button only when `isDirty` and settings exist. It calls `handleSaveAll` and shows the loading state with `saveAllLoading`. The text has no count `n`: `isDirty` is a boolean, and a count of changed zones would need a new diff. |
| `SaveSettingsBar` stays | The zone header button, the floating `unsaved-bar` (with Discard) and the Cmd/Ctrl+Enter shortcut are unchanged. Reason: 9 tests use `unsaved-bar` and `unsaved-discard` (`settings`, `tooltips`, `symbol-cards`). The floating bar is the only place for "Discard". The new hint in the fixed bar is a shortcut for the same `handleSaveAll`. It adds no second key listener. |
| 375 px | One row of at most 64 px: DEMO, account list, ⋯, status dot, start or stop. Below `sm` the status text and the button text are `sr-only` (the accessible name stays). The project owner agreed to move the interval into the ⋯ menu. Below `sm` the bar hides `SettingsForm` (`bar` variant). The ⋯ menu shows it again (`menu` variant, `general-settings-menu`) with the pin item (`metrics-pin-menu`). `AccountSelector` passes both as `menuExtra`. The account list has `min-w-60` below `sm` (new prop `popupClassName` on `Combobox`), because the trigger is only about 110 px wide. |
| Test change | The 375 px test "Leiste bricht um" no longer expects the interval save button in the bar. It expects it in the ⋯ menu, inside the viewport. The project owner agreed to this change. |
| Review fixes | Hint texts of the pin keys describe the action of the label. `usePinnedMetrics` keeps the choice in memory when `localStorage` is blocked. `aria-pressed` was replaced by `data-pinned`, because the label already changes with the state. Below 32 rem of height the fixed area is `static` (landscape phones). Tests check the lower edge of each panel and the width of the account list. |
| Not done | `scroll-padding-top` for keyboard focus below the fixed area (WCAG 2.4.11). The area has no fixed height, so a safe value needs a measured height. The unsaved hint adds a row below `sm` and moves the page by one row while it shows. Both are follow-ups. |

## Why

| Decision | Reason |
|---|---|
| Build V1–V4 in, with no display switches | The project owner chose all four on 2026-10-17. Fewer switches mean fewer states to test. |
| Only V2 gets a pin button | The fixed metrics row takes screen height. The user must be able to turn it off. |
| The bar from "DEMO" is fixed at every width | The bar holds the account, the status and the bot controls. The user needs them at each scroll position. |
| Dropdowns are overlays and never move the bar | A moving bar shifts the page under the pointer and breaks the fixing. |
| W1 + W2 in one session, W4 + W5 in one session | W1 and W2 are one line each. W4 and W5 change the same file `AppNav.tsx` and the same tests. |
| Session order S1, S2, S5, S3, S4, S6 | S3 needs the navigation height from S2 and the compact metrics from S5. S4 changes `page.tsx` after S3. |

**Sessions**

| Session | Content | Depends on | In parallel |
|---|---|---|---|
| S1 | W1 + W2 texts, this entry | none | yes |
| S2 | W4 + W5 header (+ V4) | none | yes |
| S3 | W3 fixed bar (+ V2, V3) | S2 (navigation height), S5 (compact metrics for V2) | no |
| S4 | W7 symbol button | S3 (same file `page.tsx`) | no |
| S5 | W6 metrics row | none | yes |
| S6 | W8 symbol card (+ V1) | none | yes |

Run the sessions in this order: S1, S2, S5, S3, S4, S6. The column "In parallel" shows what is possible. The agreed order is one after the other. Merge each PR first.

**Steps of each session**

1. Open an own worktree. Run `npm ci` there. Link the `.venv`. Search the journal for the feature IDs.
2. S2 and S6: show a draft first. The project owner chooses. Then build.
3. Write the test first and see it fail. Then build. Update `features.yaml`.
4. Follow the `ui-design` rules: tokens instead of colors, i18n tr, en, de, a `hint` on each control, no overflow at 375 px, light and dark.
5. Run `npm run lint`, `npx tsc --noEmit` and `scripts/features/run.sh e2e <IDs>`. Take screenshots at 1440 and 375 px, light and dark.
6. Update this entry. Run the `reviewer` agent with the diff. Open the PR.

## Verification

| Check | Result |
|---|---|
| S1: `npm run lint`, `npx tsc --noEmit` | green |
| S1: `scripts/features/run.sh e2e` for `ACC`, `USR`, `UI-09` | 11, 10 and 6 tests passed |
| S1: screenshot in German | bar shows "DEMO", account list shows "Admin" |
| S2: `header-menu.spec.ts` before the change | 7 failed (no header menu, no ☰) |
| S2: new review test "shut down disabled without an account" before the fix | 1 failed |
| S2: `npm run lint`, `npx tsc --noEmit` | green |
| S2: `scripts/features/run.sh e2e` (all mocked tests) | 564 passed, 0 failed |
| S2: screenshots in German, 1440 and 375 px, light and dark, menu open and closed, `/`, `/vps`, `/chart` | one header row, the panel covers the content, no overflow |

| S3: `control-bar.spec.ts` new tests before the change | 7 failed (no pin, no hint, bar not fixed at 375 px) |
| S3: `npm run lint`, `npx tsc --noEmit` | green |
| S3: `scripts/features/run.sh e2e` (all mocked tests) | 573 passed, 0 failed |
| S3: screenshots in Turkish, 1440 and 375 px, light and dark, list open, unsaved hint visible | bar below the navigation, list covers the bar and the metrics, no overflow |

Note: the test `tooltips.spec.ts` "Der Hinweis folgt der gewählten Sprache" (UI-07) failed in two full runs and on the unchanged base. It passed in other runs. It is not caused by S3.

After S4, run `scripts/features/run.sh e2e 'UI|ZON|MET|ACC'` once in full. Then look at `localhost:3000` against the live worker (read only): scroll, the bar stays visible, the header menu shows the connection status.

## Status

| Session | Status | PR |
|---|---|---|
| S1 | done | #189 |
| S2 | in PR | #190 |
| S5 | in PR | see PR |
| S3 | in PR | see PR |
| S4 | open | |
| S6 | open | |

## Open points

- [x] S2: W4 + W5 + V4 (in PR #190)
- [x] S5: W6 (in PR). Tiles are one row. The engine status stays next to the label of the P/L tile. The static footers moved into the hints.
- [x] S3: W3 + V2 + V3 (in PR). Follow-ups: `scroll-padding-top` for focus, row jump of the unsaved hint at 375 px.
- [ ] S4: W7
- [ ] S6: W8 + V1
