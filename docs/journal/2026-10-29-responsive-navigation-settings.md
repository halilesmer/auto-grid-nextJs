---
date: 2026-10-29
author: Codex
type: fix
status: done
pr: [240]
features: [UI-01, UI-07, UI-08, SYS-09, FRM-23]
areas: [frontend, tests]
---

# Desktop navigation and settings gear

## Request
- Use the compact formation navigation below 1024 pixels only.
- Use the normal desktop header at 1024 pixels and above.
- Replace the wide connection trigger with a settings gear at every width.

## Cause
| Symptom | Cause |
|---|---|
| Desktop formation page hides its page links. | The route condition forces the compact navigation at every width. |
| The settings trigger takes a large part of the header. | The trigger shows the connection host and a chevron. |

## Solution
| Area | Change |
|---|---|
| Navigation | Limit the floating formation header to widths below lg. Use the normal header above that limit. |
| Formation workspace | Start below the 56-pixel desktop header. Keep the mobile workspace full-height. |
| Settings | Use the standard icon button with a gear. Keep host and status in the panel and status in the accessible name and tooltip. |
| Tests | Cover breakpoint transitions, three languages, both themes, keyboard access and connection states. |

## Verification
| Check | Result |
|---|---|
| Regression tests before the fix | Three expected failures: desktop chart starts at zero and the gear is absent. |
| Production build with mocked connection | Passed with webpack. |
| Lint and TypeScript | Passed. |
| Screenshots | Checked mobile navigation and the desktop workspace in light and dark themes. |
| `npx playwright test` with UI, SYS-09 and FRM filters, one worker and JSON report | 94 passed, two UI-07 hover checks failed. Navigation, connection status, breakpoint transitions, tooltips coverage and card dragging passed. |
| Previous build comparison | Six repeated UI-07 hover checks on the unchanged previous build: one passed, five failed at a separate test port. No tooltip source or assertion was changed. |
| `bash scripts/features/run.sh check` | Passed: 186 features. |
| `npm run lint` and `npx tsc --noEmit` after integration | Passed. |
| Review | Checked layout, roles, accessible names, translated text, tooltips and callers against hooks/RULES.md section 9. No API or access-control changes. |

## Verification limits
- Local UI-07 hover failures also occur before this change; their cause is not verified.
- PR checks must pass before merge. Production deployment is not part of the local verification.
