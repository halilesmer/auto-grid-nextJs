---
date: 2026-10-17
author: Claude
type: plan
status: open
pr: []
features: [UI-01, UI-08, UI-09, ACC-07, USR-03, MET-01, ZON-13, ZON-20]
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

After S4, run `scripts/features/run.sh e2e 'UI|ZON|MET|ACC'` once in full. Then look at `localhost:3000` against the live worker (read only): scroll, the bar stays visible, the header menu shows the connection status.

## Status

| Session | Status | PR |
|---|---|---|
| S1 | in PR | this PR |
| S2 | open | |
| S5 | open | |
| S3 | open | |
| S4 | open | |
| S6 | open | |

## Open points

- [ ] S2: W4 + W5 + V4
- [ ] S5: W6
- [ ] S3: W3 + V2 + V3
- [ ] S4: W7
- [ ] S6: W8 + V1
