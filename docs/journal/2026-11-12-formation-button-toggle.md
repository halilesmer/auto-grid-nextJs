---
date: 2026-11-12
author: Claude
type: decision
status: done
pr: []
features: [UI-30]
areas: [frontend, tests, docs]
---

# Formation buttons on /chart toggle the drawing (1112-A1)

## Request

The owner wanted one click on a formation button to show the drawing and a second click to remove it from the candles. Before, one formation was always selected and a click on the selected button did nothing. The owner approved the design on 2026-11-12 (sub-decisions A1.1 to A1.3 as proposed).

## Decision

- **Selected button, second click:** the drawing and the drawing legend leave the chart. The button stays selected: outline in `primary` and a crossed eye (`EyeOff`) instead of the fill and the open eye. The badge stays. `aria-pressed` is true only while the drawing is shown.
- **A1.1:** the hidden state is in the address as `hide=1` (`chartUrl.ts`, `useChartParams.ts`). A reload and a shared link keep it. A change to another formation, or to a timeframe without formations, removes it.
- **A1.2:** the conditions panel and the candidate list stay as they are. Only `FormationLayer` and the legend go.
- **A1.3:** a timeframe change keeps the hidden state.
- **Favorites bar:** unchanged. `FormationForms` takes the toggle as optional props (`onToggle`, `hidden`, `toggleHint`).

## Tests

`e2e/mocked/chart-formation-toggle.spec.ts` (`@UI-30`): hide, badge stays, reload keeps it, show, other button shows its own drawing.
