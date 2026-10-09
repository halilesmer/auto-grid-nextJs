---
date: 2026-10-09
author: Codex
type: fix
status: done
pr: [138]
features: [UI-08]
areas: [frontend, tests]
---

# Navigation wraps without overlapping controls

## Request
- Restyle the main menu for responsive screens.

## Cause
| Symptom | Cause |
|---|---|
| Menu links overlap connection controls. | A fixed-height row contains the brand, all links and controls. Links show full labels from 640 px. |

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/layout/AppNav.tsx` | Separate header controls and navigation. Wrap links, keep labels visible and add keyboard focus rings. |
| `frontend_nextjs/e2e/mocked/navigation-layout.spec.ts` | Check visible labels, viewport bounds and control intersections in three languages at five widths. |
| `docs/features/features.yaml` | Extend UI-08 with navigation requirements. |

## Verification
| Check | Result |
|---|---|
| `bash scripts/features/run.sh e2e UI-08` | 23 passed. Generated results and checklist updated. |
| `npx playwright test navigation-layout --project=mocked --workers=1` | 3 passed after screenshot checks were added. |
| `npx next build --webpack` with mocked connection values | Passed. |
| `npm run lint` and `npx tsc --noEmit` | Passed. |
| Navigation screenshots | Checked at 375 and 1440 px in light and dark themes. |
| Test before implementation | Not verified. Turbopack failed because its build process could not bind a port. |

## Lessons
Keep navigation labels in their own wrapping row when the header contains variable-width connection controls.
