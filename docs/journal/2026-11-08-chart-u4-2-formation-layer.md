---
date: 2026-11-08
author: Claude
type: decision
status: done
pr: []
features: [FRM-20, FRM-26, FRM-38]
areas: [frontend]
---

# Formation layer and actions leave the formation page

## Request
Plan 1107-A21, step U4-2. Move the formation drawing and the card contents out of the formation page. No visible change.

## Solution
| File | Change |
|---|---|
| `components/formation/FormationLayer.tsx` (new) | The drawing and the line menu, moved from `FormationChart.tsx`. Input: the hit, the `bars`, the `points` and the scene of `ChartView.renderOverlay`. |
| `components/formation/FormationActions.tsx` (new) | Past moment and steps, image save, alarm, status chip. Props `enabled` and `disabledHint`. |
| `components/formation/FormationForms.tsx` (new) | The formation buttons. Prop `onlyWithHits` shows only formations with a hit on the selected timeframe; `emptyNote` is the text when there is none. |
| `FormationChart.tsx`, `FormationView.tsx`, `FormationToolbar.tsx` | Use the new parts. `CountBadge`, `segment` and `idle` now live in `FormationForms.tsx`; the toolbar exports them again. |
| `FormationAsOf.tsx`, `FormationShotMenu.tsx` | New optional prop `disabledHint`: the control is off and the hint gives the reason. |

## Why
- Assumption: `enabled` false switches off the past moment and the image. The alarm stays on (plan 1107-A21).
- Assumption: the formation page keeps `onlyWithHits` off, so the page does not change. U4-4a turns it on and supplies the note text (new i18n keys are its work).
- The layer reads a point that is not in the loaded range as "no position". The drawing stays partial and does not fail. U4-4a draws on a series much longer than the hit.
- Proof: the formation specs pass without change. Screenshots at 1440 px and 375 px before and after are equal (temporary Playwright spec against the mocked worker, not committed).
