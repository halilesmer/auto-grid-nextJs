---
date: 2026-10-17
author: Claude
type: change
status: done
pr: []
features: [ZON-13, ZON-20, UI-08]
areas: [frontend, tests]
---

# S6: symbol card with two columns and a collapsible header (W8, V1)

Part of [the dashboard UI redesign](2026-10-17-dashboard-ui-redesign.md).

## Decision

The project owner selected draft A from three drafts (A: two columns, B: setup tabs, C: collapsed header rows).
Draft A includes the collapsible header from draft C.

## Change

| Item | Change |
|---|---|
| Two columns (W8) | `ZoneFieldsEditor.tsx`: from `lg`, the left column has entry (basics, grid or fractal, breakout) and the right column has protection and exit (spread guard, exit). Below `lg`, there is one column as before. `/backtest` (`SetupEditor.tsx`) gets the same layout, because the modal is `max-w-4xl`. |
| Grid distance group | Grid distance, preview and loss switch stay in one group in the left column (see [2026-10-11 entry](2026-10-11-grid-distance-loss-layout.md)). |
| Collapsible card (V1) | `SymbolCard.tsx`: a chevron button (`aria-expanded`, `aria-controls`) and a click on empty space in the header open and close the card. The header also shows the engine status (running, paused, stopped) and the P/L of the robot positions on this symbol. |
| Storage | `localStorage` key `grid-robot-symbol-collapsed` holds a list of collapsed symbols. Every access is in try/catch. Without storage, all cards are open. `useSyncExternalStore` gives an open card on the server render, so there is no hydration error. |
| Test | `symbol-cards.spec.ts`: new test for V1. |

## Not done

- Draft A also showed fields as label/value rows. This changes the expected layout of `setup-layout.spec.ts` (switch next to field, label above the field). It needs approval from the project owner first, so it is not in this change.

## Lessons

- In e2e, `page.reload()` loses the account selection of the fixture. Use `dashboard.open(DEMO_ID)` again.
