---
date: 2026-10-30
author: Claude
type: feature
status: open
pr: []
features: [FRM-23]
areas: [frontend, tests]
---

# Formation page gets a TradingView-style bar

## Request
- Make the account bar of `/formasyon` look like the TradingView top bar, with the same text sizes.
- Put the TradingView tools into the bar. Put the formation names directly below it.
- Make the text smaller. The approved design uses 12 px.

## Solution
| File | Change |
|---|---|
| `FormationToolbar.tsx` | New 38 px bar and 30 px formation row. |
| `FormationSelectors.tsx` | New flat symbol and account controls. LIVE/DEMO is always visible. |
| `ChartWorkspace.tsx` | With `overlayLayout`, the tools move from the chart bottom into the bar on `lg`. |
| `AccountDropdown.tsx`, `ZoneSelect.tsx` | Shared list rows and options are exported. |
| `page.tsx` | Uses the new bar. Loading state and errors stay below it. |

## Why
The design showed six tools that have no function on this page: chart type, alert, replay, layout name, screenshot and Trade. We did not add them, because a button without a function misleads the user. A Trade button that does nothing is a safety risk in a trading tool.

The design showed the DEMO label in green. The code uses `info`, because the account list already uses this color for DEMO.

Below `lg` the workspace tools stay at the chart bottom, because the bar has no free space there.

## Verification
- New bar test: failed before the change (element not found), passes now.
- Related e2e tests (`FRM-`, `UI-0`, `ANA-`, account): 1224 passed, 1 failed. `tsc` and `eslint`: no errors.
- Failed test: `chart-workspace.spec.ts:445` (alarm, ANA-20). It fails in the same way with the unchanged code on `main` (70.3, expected below 55).
- Desktop dark and 375 px dark: examined in the test screenshots. Manual check against the live worker: not verified.

## Open points
- [ ] Decide which of the six missing tools the page must get.
- [ ] Find the cause of the failing alarm test.

## Lessons
Compare a design with the real functions of the page before approval. A mock-up can show tools that do not exist.
