---
date: 2026-11-10
author: Claude
type: feature
status: done
pr: []
features: [UI-25]
areas: [frontend]
---

# Formation row: matches visible, candidates in menu

## Request
The project owner (plan 1110-A1): the formation row on /chart takes too much space. Only the formations found on the selected timeframe stay visible. The other formations go into a menu behind an arrow button.

## Solution
The row showed every formation with a candidate on the timeframe. A candidate can be invalid or early (no badge), so on H1 the row had up to 11 buttons.

| File | Change |
|---|---|
| `frontend_nextjs/src/components/formation/FormationForms.tsx` | With `onlyWithHits`: the row shows the formations with a counted match (`hitsCount > 0`, badge) and the selected formation. The other candidates are in a `DropdownMenu` (`formation-forms-more`, items `formation-more-<CODE>`) with their state (invalid / forming). Without a counted match the trigger reads "Candidates n". |
| `frontend_nextjs/src/components/ui/dropdown-menu.tsx` | New prop `floating`: the panel opens in the top layer (popover, fixed position under the trigger). |
| `frontend_nextjs/src/i18n/messages/formation.ts`, `hints.ts` | Keys `formation.forms.*` (tr/en/de). |
| `frontend_nextjs/e2e/mocked/chart-formation-more.spec.ts` | Test @UI-25 at 1440 px and 375 px. |

## Why
- The selected formation stays in the row, also without a badge, so the user always sees what the chart shows.
- Formations without a candidate on the timeframe are not in the menu: they have nothing to show.
- `floating`: on narrow screens the row is a horizontal scroll container (`overflow-x: auto`). It cut off an absolute panel. The first test run found this (`elementFromPoint` at the item centre did not hit the item).

## Verification
- `scripts/features/run.sh e2e UI-25`: 2 passed (1440 px, 375 px).
- Screenshot at 375 px after the open animation: panel opacity 1, solid background, all 8 candidates readable.
- `precheck.sh` before the push (result in the PR).

## Lessons
- A dropdown inside a scroll container needs `floating`, or the panel is clipped. Test it with `elementFromPoint`, because `toBeVisible` does not detect clipping.
- A screenshot taken directly after a click can catch the fade-in animation; wait for it before you judge the opacity.
