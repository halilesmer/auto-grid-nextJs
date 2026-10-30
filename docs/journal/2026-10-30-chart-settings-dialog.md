---
date: 2026-10-30
author: Claude
type: feature
status: done
pr: []
features: [ANA-19, UI-07, UI-08]
areas: [frontend, tests, docs]
---

# Chart settings dialog redesign

## Request
- Change the chart settings dialog to the layout of the TradingView settings view.
- Keep the existing settings. Do not add functions.

## Solution
| File | Change |
|---|---|
| `chart-workspace/settings.ts` | New `SETTINGS_LAYOUT`: sections, groups and rows. The storage format does not change. |
| `chart-workspace/SettingsDialog.tsx` | New frame: section list, grouped rows, footer with template menu. The preview logic does not change. |
| `ui/checkbox.tsx` | New. Control with a required `hint`, same structure as `Switch`. |
| `ui/dropdown-menu.tsx` | New `side="top"`, because the template menu is at the bottom of the dialog. |
| `workspace.ts` | Group headings in tr, en and de. |
| `chart-settings-lib.spec.ts` | New. Each setting has one place in the layout, in its own section. |

## Why
- A layout list can lose a new setting without an error. The new test fails if this occurs.
- The "overlays" section keeps its switches. Five charts supply this content, and it is not part of this change.

## Verification
| Check | Result |
|---|---|
| `npx tsc --noEmit`, `eslint` on changed files | No errors. |
| Layout test | Failed before `SETTINGS_LAYOUT` existed, passes now. |
| Mocked e2e, tags ANA-17, ANA-19, ANA-20, UI-07, UI-08, two workers | 100 passed, 1 failed. The failed test was the ANA-20 alarm test. It depended on the weekday. Commit `3ecb729` on `main` fixes it. After the merge of `main` it passes. |
| Template test | Failed when `saveTemplate` was removed, passes now. |
| Screenshots at 1440 px and 375 px, light and dark | Checked. |

## Open points
None.

## Lessons
- The production build shortens CSS colors (`#ffffff` to `#fff`). `input[type=color]` accepts only the long form. Expand the value before you give it to the input.
- A foreign server on port 3100 makes all e2e tests fail with a 404 page, because Playwright reuses it. Set `E2E_PORT` to a free port.
- With the default worker count, chart tests fail because of load. Use `--workers=2` on this Mac.
