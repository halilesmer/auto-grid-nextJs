---
date: 2026-11-12
author: Claude
type: feature
status: open
pr: []
features: [SYS-15, UI-01]
areas: [frontend, tests]
---

# Menu row that opens the dev panel

## Request
The project owner wants a row in the settings menu (the gear in the header). The row opens the dev panel on `localhost:3030`. The owner approved a mockup of the row first (light theme, dark theme, and the case where the row is hidden).

## Solution
The row "Geliştirme panelini aç" is in the System section of the header menu, below the address (host, port, URL). A click opens `http://localhost:3030` in a new tab and closes the menu.

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/devPanel.ts` | New `DEV_PANEL_URL` and `isLocalHostname()` (`localhost`, `127.0.0.1`, `[::1]`; case and spaces do not matter) |
| `frontend_nextjs/src/components/layout/HeaderMenu.tsx` | New `DevPanelItem`; it returns nothing when the page is not on a local host |
| `frontend_nextjs/src/i18n/messages/dashboard.ts`, `hints.ts` | Label and hint in tr, en, de |
| `frontend_nextjs/e2e/mocked/header-menu.spec.ts` | New test `@UI-01 @SYS-15`: row is visible, order is address, row, update, shutdown; click calls `window.open` with the panel address |
| `frontend_nextjs/e2e/mocked/dev-panel-lib.spec.ts` | New tests `@SYS-15` for `isLocalHostname()` |
| `docs/features/features.yaml` | New feature `SYS-15` |

## Why
- The row shows only on the Mac's own local host. On Vercel the host is public. On a phone in the home network the page comes from the Mac's network name, and `localhost` would be the phone itself. In both cases a link to `localhost:3030` would point to the wrong machine, so the row is not shown.
- The check runs inside the open menu panel. The panel is not rendered on the server, so reading `window.location` is safe (same pattern as the address block).
- `window.open` uses `noopener,noreferrer`. The panel is a separate site and gets no access to the app window.
- The "hidden" case has no browser test. The mocked e2e build always runs on `localhost`. The decision is in `isLocalHostname()`, and unit tests cover it.

## Check before the push
`scripts/features/precheck.sh`: catalog, worker tests, lint and tsc passed. The mocked e2e ran 3447 tests: 3445 passed, 2 failed. Both failures are outside this change.
- `chart-workspace.spec.ts:536` (ANA-20): timeout in the 90 s click limit. Alone it passes (10 of 10).
- `formation-line-menu.spec.ts:261` (FRM-47, Escape focus): alone, 5 of 6 runs passed 20 of 20. In the other run one FRM-47 test failed, a different one each time (`line-menu` not visible, or Tab/Escape focus). The 1-minute load average was 12 to 16 (other sessions).
- Neither spec opens the header menu, and `DevPanelItem` is only mounted inside the open menu panel, so the new code is not on their path.
- Both patterns are known: see `2026-11-10-frm-47-flake-measurement.md` and `2026-11-10-heavy-lock-load-flakes.md`. CI decides.

## Open points
- [ ] The dev panel on port 3030 does not exist yet. Until it runs, the row opens a tab with a connection error. The panel and the Chrome button are a separate plan; the owner has not approved its scope yet.
- [ ] Manual check of `SYS-15`: row on `localhost:3000`, no row on the phone and on Vercel.
