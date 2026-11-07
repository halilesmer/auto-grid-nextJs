---
date: 2026-11-07
author: Claude
type: feature
status: done
pr: []
features: [UI-21]
areas: [frontend, tests]
---

# Dialogs keep the page behind them visible

## Request
The project owner wants to see the chart behind the RSI settings dialog. The page behind a dialog must not be blurred. All dialogs must look the same. Plan 1107-A1, design "Modal Arka Planı". The owner selected variant C: no blur and no dark layer.

## Solution
One CSS variable, `--overlay`, now sets the layer behind every dialog. The value is `transparent` in the light theme and in the dark theme.

| File | Change |
|---|---|
| `frontend_nextjs/src/app/globals.css` | New variable `--overlay` in `:root` and `.dark`; Tailwind class `bg-overlay` |
| `frontend_nextjs/src/components/ui/modal.tsx` | Backdrop `bg-black/40 dark:bg-black/70 backdrop-blur-sm` → `bg-overlay`; new `data-testid="modal-backdrop"` |
| `frontend_nextjs/src/components/account/components/AccountFormDialog.tsx` | `::backdrop` of the native `<dialog>` → `backdrop:bg-overlay`, no blur |
| `frontend_nextjs/src/components/formation/FormationAsOf.tsx` | Phone layer of the date panel `bg-black/40` → `bg-overlay` |
| `frontend_nextjs/e2e/mocked/modal-backdrop.spec.ts` | New test `@UI-21` |

`Modal` is the base of 17 dialogs in 14 files and of `ConfirmModal`. Thus the one change in `modal.tsx` covers all of them.

## Why
- A variable in one place lets a later change of the value touch one line only.
- Variant B (no blur, 20 % / 40 % dark layer) was the first proposal. The owner selected C because the chart must stay fully readable.
- A click on the transparent layer still closes the dialog. Thus the layer stays in the DOM.
- The blur on the navigation bar, cards, toasts and the save bar is a glass surface, not a dialog backdrop. This change does not touch it.

## Verification
See the PR: lint, `tsc --noEmit`, `@UI-21` (light and dark theme), `scripts/features/precheck.sh`, and a check in the browser pane.

## Lessons
- The native `<dialog>` draws its own `::backdrop`. The browser default is a light grey layer, so it needs an explicit transparent value.
