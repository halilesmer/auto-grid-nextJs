---
date: 2026-10-29
author: Codex
type: feature
status: done
pr: []
features: [FRM-18, FRM-19, FRM-20, FRM-22, FRM-23]
areas: [frontend, tests]
---

# Formation chart fills the page

## Request
- Implement the approved image proposal for a permanent full-page chart.
- Place the existing selectors, filters and conditions inside the chart area.
- Do not add a minimize function.

## Solution
| File | Change |
|---|---|
| `formasyon/page.tsx` | Fixed viewport workspace, floating selectors, scrollable conditions panel and collapse control. |
| `FormationChart.tsx` | Fill the workspace, reserve space for controls, reframe at the layout breakpoint and use a smaller RSI pane. |
| `FormationToolbar.tsx` | Compact filters; formation buttons scroll horizontally on narrow screens. |
| `AppNav.tsx` | Floating navigation on this route; page links remain accessible through the menu. |
| `formation-page.spec.ts` | Test viewport bounds, panel scrolling, collapse, themes, chart zoom and navigation. |

## Why
The previous chart had a fixed height of 460 pixels. A separate column held the conditions.
The approved layout gives the chart the full viewport. Existing detection rules and data requests stay unchanged.
Below 900 pixels, the panel moves to the bottom. Its content scrolls without moving the page.
The mobile panel ends above the RSI pane and the attribution.

## Verification
| Check | Result |
|---|---|
| Initial `npm run lint` and `npx tsc --noEmit` | Passed. |
| Default test build | Could not download fonts inside the restricted environment. |
| Default test port | Another local service returned 404. The service was not changed. |
| Turbopack on a separate test port | Could not bind an internal process port. |
| `next build --webpack` | Passed, including TypeScript and static page generation. |
| Broad browser run | 80 passed; three unrelated mobile tests reached their time limit with four workers. |
| Serial checks for those three tests | Passed without changing their assertions or time limits. |
| Point-label regression | Failed on the first build: point A overlapped the filters. The final layout reserves more space. |
| Final browser checks | 28 passed with one worker; covers FRM-18 through FRM-23, navigation, tooltips and the three timeout cases. |

## Review
- Reviewed the changed components, their callers, existing state flow and tests against `hooks/RULES.md` section 9.
- Detection rules, worker calls and shared stores are unchanged. One chart shows one selected account and setup.
- Checked screenshots at 1440 × 900 and 375 × 812, in light and dark themes.
- The zoom test uses free chart space. Interactive SVG drawing strokes can capture mouse events.
- The production deployment is not part of this local verification.
